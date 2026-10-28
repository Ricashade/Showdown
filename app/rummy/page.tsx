import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";

export const metadata: Metadata = { title: "Rummy | Showdown" };

export default function RummyPage() {
  return <PlayModeChooser game="rummy" />;
}
