import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";

export const metadata: Metadata = { title: "Thirteen | Showdown" };

export default function ThirteenPage() {
  return <PlayModeChooser game="thirteen" />;
}
