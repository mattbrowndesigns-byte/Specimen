// Draws one frame of a video into a JPEG, in the browser -- the poster for a
// video a page offered without one. The server has no video decoder (and a
// free one on Vercel would be a 70MB binary); every browser is one. Works on
// the copy in Storage, which answers with Access-Control-Allow-Origin: *, so
// the canvas isn't tainted and can be read back.
//
// A second in, or a quarter of the way through a short loop: the very first
// frame of a case-study video is so often black, or the start of a fade.
export function grabFrame(src, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new Error("Timed out reading the video")), timeoutMs);

    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.addEventListener("error", () => finish(reject, new Error("The video couldn't be played")));
    video.addEventListener("loadedmetadata", () => {
      const at = Number.isFinite(video.duration) ? Math.min(1, video.duration / 4) : 0;
      video.currentTime = at;
    });
    video.addEventListener("seeked", () => {
      try {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) throw new Error("The video has no picture");
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(video, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? finish(resolve, { blob, width, height }) : finish(reject, new Error("Couldn't draw a frame"))),
          "image/jpeg",
          0.9
        );
      } catch (err) {
        finish(reject, err);
      }
    });
    video.src = src;
  });
}
