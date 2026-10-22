import type { Metadata } from "next";
import LocalGame from "@/components/bs-poker/LocalGame";

export const metadata: Metadata = { title: "Local simulator | BS Poker" };

export default function LocalGamePage() {
  return <LocalGame />;
}
