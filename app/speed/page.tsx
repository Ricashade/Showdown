import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";
import { gameMetadata } from "@/lib/site";

export const metadata: Metadata = gameMetadata("Speed");

export default function SpeedPage() {
  return <PlayModeChooser game="speed" />;
}
