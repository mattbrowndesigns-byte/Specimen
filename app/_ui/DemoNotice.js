"use client";
import { useEffect, useState } from "react";
import { DEMO_REFUSAL_STATUS } from "./demoState";

// Says why a click in the demo did nothing.
//
// Every write is refused at the door (middleware.js), and the app's controls
// answer a refusal in whatever way each was written to: a form shows the
// error, but the heart quietly flips back and a chip un-highlights, which in
// a demo reads as broken. Rather than teach thirty-nine call sites about the
// demo, this listens to every request the page makes and puts one sentence on
// screen when the answer is the demo's refusal. Mounted only in the demo.
const SHOW_MS = 3200;

export default function DemoNotice() {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const original = window.fetch;
    let timer;
    window.fetch = async (...args) => {
      const res = await original(...args);
      if (res.status === DEMO_REFUSAL_STATUS) {
        res
          .clone()
          .json()
          .then((data) => {
            if (!data?.demo) return;
            setMessage(data.error);
            clearTimeout(timer);
            timer = setTimeout(() => setMessage(null), SHOW_MS);
          })
          .catch(() => {});
      }
      return res;
    };
    return () => {
      window.fetch = original;
      clearTimeout(timer);
    };
  }, []);

  if (!message) return null;
  return (
    <div className="demo-notice" role="status">
      {message}
    </div>
  );
}
