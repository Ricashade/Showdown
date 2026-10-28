import type { Metadata } from "next";
import LocalGoFish from "@/components/gofish/LocalGoFish";

export const metadata: Metadata = { title: "Local simulator | Go Fish" };

/** `?bots=1` (from the tutorial) seats you against two bots. */
export default async function LocalGoFishPage({ searchParams }: { searchParams: Promise<{ bots?: string }> }) {
  const { bots } = await searchParams;
  return <LocalGoFish vsBots={bots === "1"} />;
}
