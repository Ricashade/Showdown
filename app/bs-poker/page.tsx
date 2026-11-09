import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";
import { gameMetadata } from "@/lib/site";

export const metadata: Metadata = gameMetadata("BS Poker");

export default function BsPokerPage() {
  return <PlayModeChooser game="bs-poker" />;
}
