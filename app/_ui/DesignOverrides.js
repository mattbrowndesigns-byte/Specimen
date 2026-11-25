"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { OVERRIDES_EVENT, countOverrides, readOverrides, saveOverrides, EMPTY } from "@/lib/designOverrides";

// What's being tried out on /design, worn by the whole app, in the one browser
// it's being tried in. Nothing here unless something is: the key in storage is
// the only switch, and no other visitor has it.
export default function DesignOverrides() {
  const pathname = usePathname();
  const [overrides, setOverrides] = useState(EMPTY);

  useEffect(() => {
    const read = () => setOverrides(readOverrides());
    read();
    window.addEventListener(OVERRIDES_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(OVERRIDES_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  useEffect(() => {
    let node = document.getElementById("design-overrides");
    if (!overrides.css) {
      node?.remove();
      return;
    }
    if (!node) {
      node = document.createElement("style");
      node.id = "design-overrides";
      document.head.appendChild(node);
    }
    node.textContent = overrides.css;
  }, [overrides]);

  const count = countOverrides(overrides);
  if (!count || pathname === "/design") return null;
  return (
    <div className="design-trying" role="status">
      <a href="/design">
        Trying {count} design {count === 1 ? "change" : "changes"}
      </a>
      <button onClick={() => saveOverrides(EMPTY)}>Reset</button>
    </div>
  );
}
