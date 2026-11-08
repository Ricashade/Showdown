import type { Metadata } from "next";
import LocalThirteen from "@/components/thirteen/LocalThirteen";

export const metadata: Metadata = { title: "Play solo | Thirteen" };

export default function LocalThirteenPage() {
  return <LocalThirteen />;
}
