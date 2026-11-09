import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";
import { gameMetadata } from "@/lib/site";

export const metadata: Metadata = gameMetadata("Thirteen");

export default function ThirteenPage() {
  return <PlayModeChooser game="thirteen" />;
}
