import type { Metadata } from "next";
import LocalGarbage from "@/components/garbage/LocalGarbage";

export const metadata: Metadata = { title: "Local simulator | Garbage" };

export default function LocalGarbagePage() {
  return <LocalGarbage />;
}
