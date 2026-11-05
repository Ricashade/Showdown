import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";

export const metadata: Metadata = { title: "13 | Showdown" };

export default function ThirteenPage() {
  return <PlayModeChooser game="thirteen" />;
}
