import type { Metadata } from "next";
import LocalHoldem from "@/components/holdem/LocalHoldem";

export const metadata: Metadata = { title: "Play solo | Texas Hold'em" };

export default function LocalHoldemPage() {
  return <LocalHoldem />;
}
