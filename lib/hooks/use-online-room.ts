"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BsPokerAction } from "@/types/bs-poker";
import { createRoom, getPlayerView, type BsPokerView } from "@/lib/bs-poker-game";
import { RoomGuest, RoomHost, type GuestStatus } from "@/lib/multiplayer/room";
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

export type OnlineRoom =
  | { phase: "needs-name" }
  | { phase: "connecting" }
  | { phase: "failed"; message: string }
  | {
      phase: "ready";
      role: "host" | "guest";
      me: string;
      status: GuestStatus | "hosting";
      view: BsPokerView | null;
      connectedIds: Set<string>;
      hostName: string | null;
      error: { message: string; id: number } | null;
    };

/** How long a new host listens for an existing host before claiming the code. */
const CLAIM_WAIT_MS = 1200;

export function useOnlineRoom(code: string) {
  const [session, setSession] = useState<RoomSession | null | undefined>(undefined);
  const [room, setRoom] = useState<OnlineRoom>({ phase: "connecting" });
  const [transport, setTransport] = useState<TransportKind>("supabase");
  const hostRef = useRef<RoomHost | null>(null);
  const guestRef = useRef<RoomGuest | null>(null);
  const errorId = useRef(0);

  // Read this tab's seat once we're in the browser.
  useEffect(() => {
    setTransport(getTransport().kind);
    setSession(loadSession(code));
  }, [code]);

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
      const channel = getTransport().factory(code);
      const meta = { playerId: session.playerId, name: session.name, role: session.role, publicKey: identity.publicKey, joinedAt: session.joinedAt };

      if (session.role === "host") {
        const snapshot = loadHostSnapshot(code);
        const host = new RoomHost(
          channel,
          identity,
          meta,
          snapshot ?? createRoom({ roomId: code, host: { id: session.playerId, name: session.name } }),
        );
        hostRef.current = host;
        const publish = () => {
          saveHostSnapshot(code, host.snapshot());
          setRoom((prev) => ({
            phase: "ready",
            role: "host",
            me: session.playerId,
            status: "hosting",
            view: getPlayerView(host.getState(), session.playerId),
            connectedIds: new Set(host.getConnectedIds()),
            hostName: session.name,
            error: prev.phase === "ready" ? prev.error : null,
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
            clearSession(code);
            if (!cancelled) setRoom({ phase: "failed", message: `Room ${code} is already in use. Go back and create a new room.` });
            return;
          }
        }
        if (!cancelled) publish();
      } else {
        const guest = new RoomGuest(channel, identity, meta);
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
  }, [code, session]);

  /** Send a move as this player. The host applies its own moves directly. */
  const act = useCallback((action: BsPokerAction) => {
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

  /** Leave for good: the host closes the room for everyone, a guest gives up their seat. */
  const leave = useCallback(async () => {
    if (hostRef.current) await hostRef.current.close();
    else await guestRef.current?.stop();
    clearSession(code);
  }, [code]);

  return { room, transport, setSession, act, removePlayer, leave };
}
