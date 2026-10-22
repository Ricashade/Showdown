import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Big_Shoulders } from "next/font/google";
import { MotionProvider } from "@/components/ui/MotionProvider";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson" });
const shoulders = Big_Shoulders({ subsets: ["latin"], variable: "--font-shoulders", axes: ["opsz"] });

export const metadata: Metadata = {
  title: "Showdown",
  description: "BS Poker and Texas Hold'em with friends",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${atkinson.variable} ${shoulders.variable}`}>
      <body className="font-sans antialiased">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
