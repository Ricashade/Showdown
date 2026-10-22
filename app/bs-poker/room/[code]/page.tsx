import type { Metadata } from "next";
import Link from "next/link";
import OnlineGame from "@/components/bs-poker/OnlineGame";
import { isRoomCode, normalizeRoomCode } from "@/lib/multiplayer/room-code";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: `Room ${normalizeRoomCode(code)} | BS Poker` };
}

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeRoomCode((await params).code);
  if (!isRoomCode(code)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 sm:px-8">
        <h1 className="font-display text-5xl font-extrabold text-bone">That isn&apos;t a room code</h1>
        <p className="mt-3 text-lg text-parchment">Room codes are four letters, like KQJT. Check the link with your host.</p>
        <Link href="/bs-poker" className="mt-8 text-base font-bold text-bone underline underline-offset-4">
          Back to BS Poker
        </Link>
      </main>
    );
  }
  return <OnlineGame key={code} code={code} />;
}
