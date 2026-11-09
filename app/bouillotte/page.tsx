import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";
import { gameMetadata } from "@/lib/site";

export const metadata: Metadata = gameMetadata("Bouillotte");

export default function BouillottePage() {
  return <PlayModeChooser game="bouillotte" />;
}
