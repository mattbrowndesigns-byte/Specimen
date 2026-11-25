import { notFound } from "next/navigation";
import { currentUser } from "@/lib/supabaseServer";
import { isOwner } from "@/lib/owner";
import DesignSystem from "./DesignSystem";
import "./design.css";

export const metadata = { title: "Design System · Kivli", robots: { index: false } };

// The owner's. Anyone else, the demo included, gets the page that isn't there.
export default async function DesignPage() {
  if (!isOwner(await currentUser())) notFound();
  return <DesignSystem />;
}
