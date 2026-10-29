"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RoomGuest, RoomHost, type GameDefinition, type GuestStatus, type RoomAction, type RoomState } from "@/lib/multiplayer/room";
import type { ChatMessage } from "@/lib/chat";
import {
  clearSession,
  getTransport,
  loadHostSnapshot,
  loadSession,
  saveHostSnapshot,
  sessionIdentity,
  type RoomSession,
  type TransportKind,
} from "@/lib/multiplayer/session";

export type OnlineRoom<S, V> =
  | { phase: "needs-name" }
  | { phase: "connecting" }
  | { phase: "failed"; message: string }
  | {
      phase: "ready";
      role: "host" | "guest";
      me: string;
      status: GuestStatus | "hosting";
      view: V | null;
      connectedIds: Set<string>;
      hostName: string | null;
      error: { message: string; id: number } | null;
      /** The full game state — host only, never sent anywhere. Bots are run from it. */
      hostState: S | null;
      chat: ChatMessage[];
    };

/** How long a new host listens for an existing host before claiming the code. */
const CLAIM_WAIT_MS = 1200;

export interface OnlineRoomOptions<S> {
  /** Names the room across games (see session.ts). */
  roomKey: string;
  code: string;
  /** A fresh game state for a new host. */
  createState: (host: { id: string; name: string }) => S;
}

/** Run an online room as its host or as a guest, for any game the room protocol can host. */
export function useOnlineRoom<S extends RoomState, A extends RoomAction, V>(
  game: GameDefinition<S, A, V>,
  { roomKey, code, createState }: OnlineRoomOptions<S>,
) {
  const [session, setSession] = useState<RoomSession | null | undefined>(undefined);
  const [room, setRoom] = useState<OnlineRoom<S, V>>({ phase: "connecting" });
  const [transport, setTransport] = useState<TransportKind>("supabase");
  const hostRef = useRef<RoomHost<S, A, V> | null>(null);
  const guestRef = useRef<RoomGuest<A, V> | null>(null);
  const errorId = useRef(0);
  const createRef = useRef(createState);
  createRef.current = createState;

  // Read this tab's seat once we're in the browser.
  useEffect(() => {
    setTransport(getTransport().kind);
    setSession(loadSession(roomKey));
  }, [roomKey]);

  useEffect(() => {
    if (session === undefined) return;
    if (session === null) {
      setRoom({ phase: "needs-name" });
      return;
    }
    let cancelled = false;
    let cleanup = () => {};
    setRoom({ phase: "connecting" });

    (async () => {
      const identity = await sessionIdentity(session);
      if (cancelled) return;
      const channel = getTransport().factory(roomKey);
      const meta = { playerId: session.playerId, name: session.name, role: session.role, publicKey: identity.publicKey, joinedAt: session.joinedAt };

      if (session.role === "host") {
        const snapshot = loadHostSnapshot<S>(roomKey);
        const host = new RoomHost(game, channel, identity, meta, snapshot ?? createRef.current({ id: session.playerId, name: session.name }));
        hostRef.current = host;
        const publish = () => {
          saveHostSnapshot(roomKey, host.snapshot());
          setRoom((prev) => ({
            phase: "ready",
            role: "host",
            me: session.playerId,
            status: "hosting",
            view: game.getPlayerView(host.getState(), session.playerId),
            connectedIds: new Set(host.getConnectedIds()),
            hostName: session.name,
            error: prev.phase === "ready" ? prev.error : null,
            hostState: host.getState(),
            chat: host.getChat(),
          }));
        };
        const unsubscribe = host.subscribe(publish);
        cleanup = () => {
          unsubscribe();
          void host.stop();
        };
        await host.start();
        if (cancelled) return;
        if (!snapshot) {
          await new Promise((r) => setTimeout(r, CLAIM_WAIT_MS));
          if (cancelled) return;
          if (host.isRoomTaken()) {
            cleanup();
            clearSession(roomKey);
            if (!cancelled) setRoom({ phase: "failed", message: `Room ${code} is already in use. Go back and create a new room.` });
            return;
          }
        }
        if (!cancelled) publish();
      } else {
        const guest = new RoomGuest<A, V>(channel, identity, meta);
        guestRef.current = guest;
        const publish = () => {
          const snap = guest.getSnapshot();
          setRoom({
            phase: "ready",
            role: "guest",
            me: session.playerId,
            status: snap.status,
            view: snap.view,
            connectedIds: new Set(snap.connectedIds),
            hostName: snap.hostName,
            error: snap.error,
            hostState: null,
            chat: snap.chat,
          });
        };
        const unsubscribe = guest.subscribe(publish);
        cleanup = () => {
          unsubscribe();
          void guest.stop();
        };
        await guest.start();
        if (!cancelled) publish();
      }
    })().catch((e: unknown) => {
      if (!cancelled) setRoom({ phase: "failed", message: e instanceof Error ? e.message : "Couldn't connect to the room." });
    });

    return () => {
      cancelled = true;
      cleanup();
      hostRef.current = null;
      guestRef.current = null;
    };
  }, [game, roomKey, code, session]);

  /** Send a move as this player. The host applies its own moves directly. */
  const act = useCallback((action: A) => {
    const host = hostRef.current;
    if (host) {
      const result = host.act(action);
      if (!result.ok) {
        const message = result.error;
        setRoom((prev) => (prev.phase === "ready" ? { ...prev, error: { message, id: ++errorId.current + 1e6 } } : prev));
      }
      return;
    }
    void guestRef.current?.act(action);
  }, []);

  const removePlayer = useCallback((playerId: string) => hostRef.current?.removePlayer(playerId), []);

  /** Say something in the room chat as this player. */
  const say = useCallback((kind: "chat" | "reaction", text: string) => {
    const host = hostRef.current;
    if (host) host.post(host.hostId, kind, text);
    else void guestRef.current?.say(kind, text);
  }, []);

  /** Host only: a line from one of the host's bots. */
  const postAsBot = useCallback((botId: string, text: string) => void hostRef.current?.post(botId, "chat", text), []);

  /** Leave for good: the host closes the room for everyone, a guest gives up their seat. */
  const leave = useCallback(async () => {
    if (hostRef.current) await hostRef.current.close();
    else await guestRef.current?.stop();
    clearSession(roomKey);
  }, [roomKey]);

  return { room, transport, setSession, act, removePlayer, leave, say, postAsBot };
}
