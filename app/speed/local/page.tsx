import type { Metadata } from "next";
import LocalSpeed from "@/components/speed/LocalSpeed";

export const metadata: Metadata = { title: "Play solo | Speed" };

/** `?demo=1` (from the reflex drill) seats a quicker bot. */
export default async function LocalSpeedPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  return <LocalSpeed fromDemo={demo === "1"} />;
}
