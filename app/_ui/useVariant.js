"use client";
import { useSyncExternalStore } from "react";

// Which design variant this page is wearing: "original", "refined" or
// "elevated". Read off <html data-variant>, which lib/variant.js's boot script
// stamps before paint.
//
// The server snapshot is "original" because the server never knows -- the
// attribute is set in the browser -- so the first client render agrees with
// the HTML and React re-renders once with the real answer. Anything that
// renders differently per variant should therefore be something that appears
// after a fetch, not something in the first paint, or it will visibly swap.
// Styling never needs this: CSS sees the attribute from the first frame.
const subscribe = () => () => {};
const read = () => document.documentElement.dataset.variant || "original";

export default function useVariant() {
  return useSyncExternalStore(subscribe, read, () => "original");
}
