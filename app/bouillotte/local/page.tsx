import type { Metadata } from "next";
import LocalBouillotte from "@/components/bouillotte/LocalBouillotte";

export const metadata: Metadata = { title: "Local simulator | Bouillotte" };

/** `?bots=1` (from the demo) seats you against three bots. */
export default async function LocalBouillottePage({ searchParams }: { searchParams: Promise<{ bots?: string }> }) {
  const { bots } = await searchParams;
  return <LocalBouillotte vsBots={bots === "1"} />;
}
