import type { Metadata } from "next";
import LocalWar from "@/components/war/LocalWar";

export const metadata: Metadata = { title: "Local simulator | War" };

export default function LocalWarPage() {
  return <LocalWar />;
}
