import type { Metadata } from "next";
import LocalWar from "@/components/war/LocalWar";

export const metadata: Metadata = { title: "Play solo | War" };

export default function LocalWarPage() {
  return <LocalWar />;
}
