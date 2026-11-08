import type { Metadata } from "next";
import LocalGoFish from "@/components/gofish/LocalGoFish";

export const metadata: Metadata = { title: "Play solo | Go Fish" };

export default function LocalGoFishPage() {
  return <LocalGoFish />;
}
