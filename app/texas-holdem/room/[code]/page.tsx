import type { Metadata } from "next";
import Link from "next/link";
import OnlineHoldem from "@/components/holdem/OnlineHoldem";
import { isRoomCode, normalizeRoomCode } from "@/lib/multiplayer/room-code";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: `Room ${normalizeRoomCode(code)} | Texas Hold'em` };
}

export default async function HoldemRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeRoomCode((await params).code);
  if (!isRoomCode(code)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 sm:px-8">
        <h1 className="font-display text-5xl font-extrabold text-bone">That isn&apos;t a room code</h1>
        <Link href="/texas-holdem" className="mt-8 text-base font-bold text-bone underline underline-offset-4">
          Back to Texas Hold&apos;em
        </Link>
      </main>
    );
  }
  return <OnlineHoldem key={code} code={code} />;
}
