import type { Metadata } from "next";
import LocalBouillotte from "@/components/bouillotte/LocalBouillotte";

export const metadata: Metadata = { title: "Play solo | Bouillotte" };

export default function LocalBouillottePage() {
  return <LocalBouillotte />;
}
