import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";

export const metadata: Metadata = { title: "Go Fish | Showdown" };

export default function GoFishPage() {
  return <PlayModeChooser game="go-fish" />;
}
