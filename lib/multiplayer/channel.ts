/**
 * The small slice of a realtime channel the room protocol needs. Supabase Realtime is the
 * real backend; a BroadcastChannel version lets you test between tabs without Supabase, and
 * an in-memory one drives the tests.
 *
 * Semantics follow Supabase: `send` reaches every OTHER member (not yourself), and presence
 * lists every member, including yourself.
 */
export type PeerRole = "host" | "guest";

export interface PresenceMeta {
  playerId: string;
  name: string;
  role: PeerRole;
  /** ECDH P-256 public key (base64, raw). Public by design. */
  publicKey: string;
  /** ms timestamp; the earliest host wins if two claim the same room. */
  joinedAt: number;
}

export interface RoomChannel {
  /** Register handlers before calling connect(). */
  onMessage(event: string, handler: (payload: unknown) => void): void;
  onPresence(handler: (members: PresenceMeta[]) => void): void;
  connect(me: PresenceMeta): Promise<void>;
  send(event: string, payload: unknown): Promise<void>;
  close(): Promise<void>;
}

export type RoomChannelFactory = (roomCode: string) => RoomChannel;

/**
 * Keep only well-formed presence entries (presence payloads come from other clients).
 * Entries are NOT merged by playerId: someone else can announce your id, and the real
 * you must not disappear when they do. Keys decide who is who.
 */
export function cleanMembers(raw: unknown[]): PresenceMeta[] {
  const out: PresenceMeta[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const { playerId, name, role, publicKey, joinedAt } = m as Record<string, unknown>;
    if (typeof playerId !== "string" || typeof publicKey !== "string" || (role !== "host" && role !== "guest")) continue;
    out.push({
      playerId,
      name: typeof name === "string" ? name.slice(0, 20) : "Player",
      role,
      publicKey,
      joinedAt: typeof joinedAt === "number" ? joinedAt : 0,
    });
  }
  return out;
}
