import type { Metadata } from "next";
import Link from "next/link";
import OnlineWar from "@/components/war/OnlineWar";
import { isRoomCode, normalizeRoomCode } from "@/lib/multiplayer/room-code";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: `Room ${normalizeRoomCode(code)} | War` };
}

export default async function WarRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeRoomCode((await params).code);
  if (!isRoomCode(code)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 sm:px-8">
        <h1 className="font-display text-5xl font-extrabold text-bone">That isn&apos;t a room code</h1>
        <Link href="/war" className="mt-8 text-base font-bold text-bone underline underline-offset-4">
          Back to War
        </Link>
      </main>
    );
  }
  return <OnlineWar key={code} code={code} />;
}
