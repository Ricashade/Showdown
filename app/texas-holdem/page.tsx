import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";

export const metadata: Metadata = { title: "Texas Hold'em | Showdown" };

export default function TexasHoldemPage() {
  return <PlayModeChooser game="texas-holdem" />;
}
