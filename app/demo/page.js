import SharedLibrary from "../_ui/SharedLibrary";

// The link that goes on LinkedIn: the showcase library, plus an Add that
// replays one real save. The token comes from the same variable the case
// study reads, and for the same reason -- a share token in a public repo's
// history outlives revoking it.
const SHOWCASE = process.env.NEXT_PUBLIC_SHOWCASE_SHARE;

export const metadata = {
  title: "Kivli demo",
  description: "A working demo of Kivli, a visual inspiration library.",
};

export default function DemoPage() {
  return <SharedLibrary token={SHOWCASE || "missing"} demo />;
}
