import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";
import { gameMetadata } from "@/lib/site";

export const metadata: Metadata = gameMetadata("Rummy");

export default function RummyPage() {
  return <PlayModeChooser game="rummy" />;
}
