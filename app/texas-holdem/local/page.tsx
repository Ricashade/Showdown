import type { Metadata } from "next";
import LocalHoldem from "@/components/holdem/LocalHoldem";

export const metadata: Metadata = { title: "Local simulator | Texas Hold'em" };

export default function LocalHoldemPage() {
  return <LocalHoldem />;
}
