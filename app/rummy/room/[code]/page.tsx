import { redirect } from "next/navigation";
import { normalizeRoomCode } from "@/lib/multiplayer/room-code";

/** Old invite links: every room is shared now. */
export default async function OldRoomLink({ params }: { params: Promise<{ code: string }> }) {
  redirect(`/room/${normalizeRoomCode((await params).code)}`);
}
