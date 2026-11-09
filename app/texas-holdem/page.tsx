import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";
import { gameMetadata } from "@/lib/site";

export const metadata: Metadata = gameMetadata("Texas Hold'em");

export default function TexasHoldemPage() {
  return <PlayModeChooser game="texas-holdem" />;
}
