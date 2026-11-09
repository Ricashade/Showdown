import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";
import { gameMetadata } from "@/lib/site";

export const metadata: Metadata = gameMetadata("Go Fish");

export default function GoFishPage() {
  return <PlayModeChooser game="go-fish" />;
}
