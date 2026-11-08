import type { Metadata } from "next";
import LocalGarbage from "@/components/garbage/LocalGarbage";

export const metadata: Metadata = { title: "Play solo | Garbage" };

export default function LocalGarbagePage() {
  return <LocalGarbage />;
}
