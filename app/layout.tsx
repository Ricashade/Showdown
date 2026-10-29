import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Big_Shoulders } from "next/font/google";
import { MotionProvider } from "@/components/ui/MotionProvider";
import { IdleBackground } from "@/components/IdleBackground";
import { RoomTransitionProvider } from "@/components/ui/RoomTransition";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson" });
const shoulders = Big_Shoulders({ subsets: ["latin"], variable: "--font-shoulders", axes: ["opsz"] });

export const metadata: Metadata = {
  title: "Showdown",
  description: "Texas Hold'em, BS Poker, Blackjack, Garbage, Rummy and War with friends",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${atkinson.variable} ${shoulders.variable}`}>
      <body className="font-sans antialiased">
        <MotionProvider>
          <IdleBackground />
          <RoomTransitionProvider>{children}</RoomTransitionProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
