import type { Metadata } from "next";
import Link from "next/link";
import OnlineGarbage from "@/components/garbage/OnlineGarbage";
import { isRoomCode, normalizeRoomCode } from "@/lib/multiplayer/room-code";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: `Room ${normalizeRoomCode(code)} | Garbage` };
}

export default async function GarbageRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeRoomCode((await params).code);
  if (!isRoomCode(code)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 sm:px-8">
        <h1 className="font-display text-5xl font-extrabold text-bone">That isn&apos;t a room code</h1>
        <Link href="/garbage" className="mt-8 text-base font-bold text-bone underline underline-offset-4">
          Back to Garbage
        </Link>
      </main>
    );
  }
  return <OnlineGarbage key={code} code={code} />;
}
