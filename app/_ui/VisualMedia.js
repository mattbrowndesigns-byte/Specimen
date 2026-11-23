"use client";
import { useEffect, useRef } from "react";
import { Play } from "lucide-react";

// A visual's picture: an <img>, or for a visual kept from a looping MP4, the
// loop itself -- muted, inline, no controls, the way the case study showed
// it. The poster is the stored frame, so the shape is right and something is
// on screen before a byte of video arrives.
//
// On a board of forty, every loop playing at once is forty decoders running
// for cards nobody is looking at. So a board video plays only while it's on
// screen (`playInView`), and not at all for someone who has asked their
// system for less motion -- they get the still, which is the poster.

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;
}

export default function VisualMedia({ visual, src, poster, className, alt, playInView = true, controls = false, loading }) {
  const ref = useRef(null);
  const video = visual?.video_url;

  useEffect(() => {
    const el = ref.current;
    if (!video || !el) return undefined;
    if (prefersReducedMotion()) return undefined;
    if (!playInView || typeof IntersectionObserver === "undefined") {
      el.play?.().catch(() => {});
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) el.play?.().catch(() => {});
        else el.pause?.();
      },
      { rootMargin: "200px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [video, playInView]);

  if (!video) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={className}
        src={src}
        alt={alt}
        width={visual?.width || undefined}
        height={visual?.height || undefined}
        loading={loading}
      />
    );
  }

  return (
    <video
      ref={ref}
      className={`${className || ""} visual-video`.trim()}
      src={video}
      poster={poster || src}
      width={visual?.width || undefined}
      height={visual?.height || undefined}
      muted
      loop
      playsInline
      // Nothing is fetched for a card until it's near the screen; the poster
      // carries it until then.
      preload={playInView ? "none" : "auto"}
      controls={controls}
      aria-label={alt}
      disablePictureInPicture
    />
  );
}

// On a picture that stands for something that moves: a loop that is paused --
// off screen, or reduced motion -- and a component clip, whose card only ever
// shows its poster, both look exactly like a still.
export function ClipBadge() {
  return (
    <span className="visual-card-badge" aria-label="Video">
      <Play size={10} fill="currentColor" />
    </span>
  );
}
