import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";

export const metadata: Metadata = { title: "Bouillotte | Showdown" };

export default function BouillottePage() {
  return <PlayModeChooser game="bouillotte" />;
}
