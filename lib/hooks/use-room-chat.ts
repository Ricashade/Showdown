"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActiveGameState } from "@/types/party";
import type { GameMode } from "@/types/game";
import { GAMES } from "@/lib/games";
import { banterFor } from "@/lib/bot-banter";
import { cleanChat, makeChat, mergeChat, type ChatMessage } from "@/lib/chat";

/**
 * Room milestones as chat lines (who came and went, a game switch, a winner), worked out on each
 * screen from what it already shows, so they cost nothing on the wire.
 */
export function useRoomEvents({
  players,
  game,
  hostName,
  winners,
  place,
}: {
  players: { id: string; name: string }[];
  game?: GameMode;
  hostName?: string;
  winners: string[];
  /** "room" online, "table" in a local simulator. */
  place: string;
}): ChatMessage[] {
  const [events, setEvents] = useState<ChatMessage[]>([]);
  const prev = useRef<{ names: Map<string, string>; game?: GameMode; winners: string } | null>(null);
  const roster = players.map((p) => `${p.id}\u0000${p.name}`).join("\u0001");
  const winnerKey = winners.join();

  useEffect(() => {
    const names = new Map(players.map((p) => [p.id, p.name]));
    const before = prev.current;
    prev.current = { names, game, winners: winnerKey };
    // Whoever's here when the screen opens was already here.
    if (!before) return;
    const lines: string[] = [];
    for (const [id, name] of names) if (!before.names.has(id)) lines.push(`✨ ${name} joined the ${place}`);
    for (const [id, name] of before.names) if (!names.has(id)) lines.push(`${name} left the ${place}`);
    if (game && before.game && game !== before.game) lines.push(`🎮 ${hostName ?? "The host"} switched the game to ${GAMES[game].title}`);
    if (winnerKey && winnerKey !== before.winners) {
      const who = winners.map((id) => names.get(id) ?? "Someone");
      lines.push(`👑 ${who.join(" and ")} won the match!`);
    }
    if (lines.length) setEvents((e) => mergeChat(e, lines.map((t) => makeChat(null, "", "system", t))));
    // `roster` and `winnerKey` stand in for `players` and `winners`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, game, winnerKey, hostName, place]);

  return events;
}

/** Now and then, a bot says something when the table turns on it (see lib/bot-banter.ts). */
export function useBotBanter(state: ActiveGameState | null, enabled: boolean, post: (botId: string, text: string) => void) {
  const prev = useRef<ActiveGameState | null>(null);
  const lastSaid = useRef(new Map<string, number>());
  const postRef = useRef(post);
  postRef.current = post;

  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (!state || !before || !enabled) return;
    for (const line of banterFor(before, state)) {
      // Not every time, and not the same bot twice in a row.
      const now = Date.now();
      if (Math.random() > 0.7 || now - (lastSaid.current.get(line.botId) ?? 0) < 6000) continue;
      lastSaid.current.set(line.botId, now);
      setTimeout(() => postRef.current(line.botId, line.text), 600 + Math.random() * 900);
    }
  }, [state, enabled]);
}

const BANTER_KEY = "showdown:bot-banter";

/** Whether bots chat, remembered on this device. On unless turned off. */
export function useBanterSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(BANTER_KEY) === "off") setOn(false);
    } catch {
      // Storage blocked: stay on.
    }
  }, []);
  const set = useCallback((next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem(BANTER_KEY, next ? "on" : "off");
    } catch {
      // Not critical.
    }
  }, []);
  return [on, set];
}

/** A local simulator's chat: everyone's on this screen, so lines go straight into the list. */
export function useLocalChat() {
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const post = useCallback((sender: { id: string; name: string }, kind: "chat" | "reaction", text: string) => {
    const clean = cleanChat(kind, text);
    if (clean) setChat((c) => mergeChat(c, [makeChat(sender.id, sender.name, clean.kind, clean.text)]));
  }, []);
  return { chat, post };
}
