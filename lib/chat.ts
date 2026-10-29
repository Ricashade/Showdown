/**
 * Room chat: what a message is, and the rules every client and the host agree on.
 * Online, messages go through the host like moves do (see lib/multiplayer/room.ts): the host
 * checks who really sent each one and stamps their name, so nobody can post as someone else.
 */

export type ChatKind = "chat" | "reaction" | "system";

export interface ChatMessage {
  id: string;
  /** null for room events. */
  senderId: string | null;
  senderName: string;
  text: string;
  /** ms timestamp, from the host's clock online. */
  ts: number;
  kind: ChatKind;
}

/** One-tap table reactions: what's sent, and what the button shows. */
export const REACTIONS = [
  { text: "😂", label: "😂" },
  { text: "🔥", label: "🔥" },
  { text: "🧢 Cap!", label: "🧢 Cap!" },
  { text: "👀", label: "👀" },
  { text: "👏", label: "👏" },
  { text: "💀", label: "💀" },
] as const;

/** The emoji a reaction floats up from its sender's seat. */
export const reactionEmoji = (text: string) => [...text][0] ?? text;

export const CHAT_HISTORY = 100;
export const CHAT_MAX_LENGTH = 200;
/** Per sender, at most one message this often (ms). */
export const CHAT_MIN_GAP_MS = 250;

/** A sendable message, or null. Trims, collapses whitespace, caps the length; reactions must be one of ours. */
export function cleanChat(kind: unknown, text: unknown): { kind: "chat" | "reaction"; text: string } | null {
  if (typeof text !== "string") return null;
  if (kind === "reaction") return REACTIONS.some((r) => r.text === text) ? { kind, text } : null;
  if (kind !== "chat") return null;
  const clean = text.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_LENGTH);
  return clean ? { kind, text: clean } : null;
}

/** Messages in time order, each once, the latest `CHAT_HISTORY` kept. */
export function mergeChat(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) if (isChatMessage(m)) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.ts - b.ts).slice(-CHAT_HISTORY);
}

/** Messages arrive from the network: check their shape before trusting them. */
export function isChatMessage(x: unknown): x is ChatMessage {
  if (!x || typeof x !== "object") return false;
  const m = x as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    (m.senderId === null || typeof m.senderId === "string") &&
    typeof m.senderName === "string" &&
    typeof m.text === "string" &&
    typeof m.ts === "number" &&
    (m.kind === "chat" || m.kind === "reaction" || m.kind === "system")
  );
}

/** A name colour for each sender, the same on every screen. Muted, readable on smoke. */
const NAME_COLORS = ["#d6b67f", "#7fc8a9", "#e59a8c", "#9fb7e0", "#c9a0dc", "#e8c66a", "#8fd0d0", "#f0a35e", "#b5c98a"];
export function senderColor(senderId: string) {
  let h = 0;
  for (const ch of senderId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}

/** A message made on this device (the host's own, a bot's, a local simulator's, a room event). */
export function makeChat(senderId: string | null, senderName: string, kind: ChatKind, text: string, ts = Date.now()): ChatMessage {
  return { id: `${ts.toString(36)}-${Math.random().toString(36).slice(2, 10)}`, senderId, senderName, text, ts, kind };
}
