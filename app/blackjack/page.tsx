import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";
import { gameMetadata } from "@/lib/site";

export const metadata: Metadata = gameMetadata("Blackjack");

export default function BlackjackPage() {
  return <PlayModeChooser game="blackjack" />;
}
