import type { Metadata } from "next";
import LocalBlackjack from "@/components/blackjack/LocalBlackjack";

export const metadata: Metadata = { title: "Local simulator | Blackjack" };

export default function LocalBlackjackPage() {
  return <LocalBlackjack />;
}
