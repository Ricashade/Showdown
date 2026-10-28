import type { Metadata } from "next";
import Link from "next/link";
import OnlineParty from "@/components/party/OnlineParty";
import { isGameId } from "@/lib/party-engine";
import { isRoomCode, normalizeRoomCode } from "@/lib/multiplayer/room-code";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: `Room ${normalizeRoomCode(code)} | Showdown` };
}

/** A shared room. `?game=` is only the game a new host opens it on. */
export default async function RoomPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ game?: string }> }) {
  const code = normalizeRoomCode((await params).code);
  const { game } = await searchParams;
  if (!isRoomCode(code)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 sm:px-8">
        <h1 className="font-display text-5xl font-extrabold text-bone">That isn&apos;t a room code</h1>
        <Link href="/" className="mt-8 text-base font-bold text-bone underline underline-offset-4">
          Main menu
        </Link>
      </main>
    );
  }
  return <OnlineParty key={code} code={code} initialGame={isGameId(game) ? game : undefined} />;
}
