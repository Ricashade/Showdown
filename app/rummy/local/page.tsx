import type { Metadata } from "next";
import LocalRummy from "@/components/rummy/LocalRummy";

export const metadata: Metadata = { title: "Local simulator | Rummy" };

export default function LocalRummyPage() {
  return <LocalRummy />;
}
