import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";

export const metadata: Metadata = { title: "Blackjack | Showdown" };

export default function BlackjackPage() {
  return <PlayModeChooser game="blackjack" />;
}
