import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Big_Shoulders } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { MotionProvider } from "@/components/ui/MotionProvider";
import { IdleBackground } from "@/components/IdleBackground";
import { RoomTransitionProvider } from "@/components/ui/RoomTransition";
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "@/lib/site";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson" });
const shoulders = Big_Shoulders({ subsets: ["latin"], variable: "--font-shoulders", axes: ["opsz"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: { siteName: "Showdown", title: SITE_TITLE, description: SITE_DESCRIPTION, type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${atkinson.variable} ${shoulders.variable}`}>
      <body className="font-sans antialiased">
        <MotionProvider>
          <IdleBackground />
          <RoomTransitionProvider>{children}</RoomTransitionProvider>
        </MotionProvider>
        <Analytics />
      </body>
    </html>
  );
}
