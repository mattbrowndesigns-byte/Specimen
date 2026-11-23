// Draws frames of a video into JPEGs, in the browser. The server has no video
// decoder (and a free one on Vercel would be a 70MB binary); every browser is
// one. Two callers: the poster for a case-study video a page offered without
// one, drawn off the copy in Storage -- which answers with
// Access-Control-Allow-Origin: *, so the canvas isn't tainted and can be read
// back -- and a clip about to be uploaded, drawn off the file itself.
//
// `pick(duration)` says which: a list of { at, edge, quality }, seconds in, the
// longest side to draw at (its own size without one) and the JPEG's quality.
export function grabFrames(src, pick, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let settled = false;
    let timer = null;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      fn(value);
    };
    // Per frame rather than for the lot, so five seeks aren't given the time
    // of one.
    const wait = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(reject, new Error("Timed out reading the video")), timeoutMs);
    };
    wait();

    const frames = [];
    let wanted = null;
    const next = () => {
      wait();
      const target = wanted[frames.length].at;
      // Asking for the moment it is already at fires no `seeked`.
      if (video.currentTime === target && video.readyState >= 2) draw();
      else video.currentTime = target;
    };
    const draw = () => {
      try {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) throw new Error("The video has no picture");
        const { edge, quality = 0.9 } = wanted[frames.length];
        const scale = edge ? Math.min(1, edge / Math.max(width, height)) : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return finish(reject, new Error("Couldn't draw a frame"));
            frames.push({ blob, width: canvas.width, height: canvas.height });
            if (frames.length === wanted.length) finish(resolve, frames);
            else next();
          },
          "image/jpeg",
          quality
        );
      } catch (err) {
        finish(reject, err);
      }
    };

    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.addEventListener("error", () => finish(reject, new Error("The video couldn't be played")));
    video.addEventListener("loadeddata", () => {
      if (wanted) return;
      wanted = pick(Number.isFinite(video.duration) ? video.duration : 0);
      next();
    });
    video.addEventListener("seeked", draw);
    video.src = src;
  });
}

// A second in, or a quarter of the way through a short loop: the very first
// frame of a case-study video is so often black, or the start of a fade.
export async function grabFrame(src, options) {
  const [frame] = await grabFrames(src, (duration) => [{ at: Math.min(1, duration / 4) }], options);
  return frame;
}
