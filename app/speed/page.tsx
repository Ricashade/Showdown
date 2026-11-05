import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";

export const metadata: Metadata = { title: "Speed | Showdown" };

export default function SpeedPage() {
  return <PlayModeChooser game="speed" />;
}
