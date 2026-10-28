import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";

export const metadata: Metadata = { title: "Garbage | Showdown" };

export default function GarbagePage() {
  return <PlayModeChooser game="garbage" />;
}
