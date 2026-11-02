import { Composition, registerRoot } from "remotion";
import { Sizzle } from "./Sizzle";
import { FPS, TOTAL_FRAMES } from "./shots";

// 1920 x 1080: LinkedIn's standard landscape video, and the frame every
// camera rectangle in shots.js is fitted to.
function Root() {
  return <Composition id="Sizzle" component={Sizzle} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />;
}

registerRoot(Root);
