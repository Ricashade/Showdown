import type { Metadata } from "next";
import LocalThirteen from "@/components/thirteen/LocalThirteen";

export const metadata: Metadata = { title: "Local simulator | Thirteen" };

/** `?bots=1` (from the demo) seats you against two bots. */
export default async function LocalThirteenPage({ searchParams }: { searchParams: Promise<{ bots?: string }> }) {
  const { bots } = await searchParams;
  return <LocalThirteen vsBots={bots === "1"} />;
}
