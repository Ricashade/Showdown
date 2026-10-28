import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";

export const metadata: Metadata = { title: "War | Showdown" };

export default function WarPage() {
  return <PlayModeChooser game="war" />;
}
