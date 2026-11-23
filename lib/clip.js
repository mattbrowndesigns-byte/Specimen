import { refusal } from "@/lib/mp4";
import { grabFrames } from "@/lib/videoFrame";

// A clip opened in the browser that is about to upload it. The server has no
// video decoder (lib/videoFrame.js), so everything that needs to SEE the clip
// happens here: whether it plays, the poster, and the stills the AI is shown.

// Five, spread across it. The AI is told they are one clip in order, which is
// the only way it can know anything moved; more would cost nothing in requests
// but a lot in bytes kept for every clip.
const MOMENTS = [0.1, 0.3, 0.5, 0.7, 0.9];
const POSTER_EDGE = 1920;
const FRAME_EDGE = 1280;

// Throws the rest of a sentence that starts with the file's name.
export async function readClip(file) {
  const why = refusal(await file.arrayBuffer());
  if (why) throw new Error(why);

  const src = URL.createObjectURL(file);
  try {
    // Second in, or a quarter through a short one: a recording's first frame is
    // so often the moment before anything happened.
    const [poster, ...frames] = await grabFrames(src, (duration) => [
      { at: Math.min(1, duration / 4), edge: POSTER_EDGE, quality: 0.88 },
      ...MOMENTS.map((m) => ({ at: duration * m, edge: FRAME_EDGE, quality: 0.78 })),
    ]);
    return { poster: poster.blob, frames: frames.map((f) => f.blob) };
  } catch {
    throw new Error(
      "couldn't be played by this browser. In QuickTime Player, use File > Export As > 1080p, then upload that copy."
    );
  } finally {
    URL.revokeObjectURL(src);
  }
}
