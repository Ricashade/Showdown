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
  code: string;
  playerId: string;
  name: string;
  role: PeerRole;
  joinedAt: number;
  identity: StoredIdentity;
}

const sessionKey = (code: string) => `showdown:session:${code}`;
const hostKey = (code: string) => `showdown:host:${code}`;

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

export const loadSession = (code: string) => read<RoomSession>(sessionKey(code));

export async function createSession(code: string, name: string, role: PeerRole): Promise<RoomSession> {
  const identity = await generateIdentity();
  const session: RoomSession = {
    code,
    playerId: randomId(role === "host" ? "h" : "p"),
    name: name.trim().slice(0, 20) || "Player",
    role,
    joinedAt: Date.now(),
    identity: await exportIdentity(identity),
  };
  write(sessionKey(code), session);
  return session;
}

export const sessionIdentity = (s: RoomSession): Promise<Identity> => importIdentity(s.identity);

export const loadHostSnapshot = (code: string) => read<HostSnapshot>(hostKey(code));
export const saveHostSnapshot = (code: string, snap: HostSnapshot) => write(hostKey(code), snap);

export function clearSession(code: string) {
  try {
    sessionStorage.removeItem(sessionKey(code));
    sessionStorage.removeItem(hostKey(code));
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
