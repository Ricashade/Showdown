import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";
import { gameMetadata } from "@/lib/site";

export const metadata: Metadata = gameMetadata("Garbage");

export default function GarbagePage() {
  return <PlayModeChooser game="garbage" />;
}
