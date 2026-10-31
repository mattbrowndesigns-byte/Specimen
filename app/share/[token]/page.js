"use client";
import { use as usePromise } from "react";
import SharedLibrary from "../../_ui/SharedLibrary";

// What someone without an account sees. The page itself lives in
// SharedLibrary, because /demo shows the same library with one thing added.
export default function SharedPage({ params }) {
  const { token } = usePromise(params);
  return <SharedLibrary token={token} />;
}
