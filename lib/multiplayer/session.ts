/**
 * Per-tab room sessions. sessionStorage keeps your seat (id + keys) through a refresh but
 * never shares it with other tabs, so two tabs in one browser can be two players.
 */
import type { PeerRole, RoomChannelFactory } from "./channel";
import { exportIdentity, generateIdentity, importIdentity, type Identity, type StoredIdentity } from "./crypto";
import type { HostSnapshot } from "./room";
import { randomId } from "./room-code";
import { createSupabaseChannel, isSupabaseConfigured } from "./supabase-channel";
import { createTabChannel } from "./tab-channel";

export interface RoomSession {
  /** Room code, as shared (e.g. "ABCD"). */
  code: string;
  playerId: string;
  name: string;
  role: PeerRole;
  joinedAt: number;
  identity: StoredIdentity;
}

/**
 * `roomKey` names a room across games: BS Poker uses the plain code, Hold'em "holdem:CODE".
 * It also names the realtime channel, so the two games' rooms never collide.
 */
const sessionKey = (roomKey: string) => `showdown:session:${roomKey}`;
const hostKey = (roomKey: string) => `showdown:host:${roomKey}`;

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the game still works, it just won't survive a refresh.
  }
}

export const loadSession = (roomKey: string) => read<RoomSession>(sessionKey(roomKey));

export async function createSession(roomKey: string, code: string, name: string, role: PeerRole): Promise<RoomSession> {
  const identity = await generateIdentity();
  const session: RoomSession = {
    code,
    playerId: randomId(role === "host" ? "h" : "p"),
    name: name.trim().slice(0, 20) || "Player",
    role,
    joinedAt: Date.now(),
    identity: await exportIdentity(identity),
  };
  write(sessionKey(roomKey), session);
  return session;
}

export const sessionIdentity = (s: RoomSession): Promise<Identity> => importIdentity(s.identity);

export const loadHostSnapshot = <S>(roomKey: string) => read<HostSnapshot<S>>(hostKey(roomKey));
export const saveHostSnapshot = <S>(roomKey: string, snap: HostSnapshot<S>) => write(hostKey(roomKey), snap);

export function clearSession(roomKey: string) {
  try {
    sessionStorage.removeItem(sessionKey(roomKey));
    sessionStorage.removeItem(hostKey(roomKey));
  } catch {
    // Nothing to clear.
  }
}

export type TransportKind = "supabase" | "tabs";

/** Supabase when its keys are set; otherwise a same-browser test transport. */
export function getTransport(): { kind: TransportKind; factory: RoomChannelFactory } {
  return isSupabaseConfigured()
    ? { kind: "supabase", factory: createSupabaseChannel }
    : { kind: "tabs", factory: createTabChannel };
}
