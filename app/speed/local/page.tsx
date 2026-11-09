import type { Metadata } from "next";
import LocalSpeed from "@/components/speed/LocalSpeed";

export const metadata: Metadata = { title: "Play solo | Speed" };

export default function LocalSpeedPage() {
  return <LocalSpeed />;
}
