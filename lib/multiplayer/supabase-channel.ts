import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { cleanMembers, type PresenceMeta, type RoomChannel } from "./channel";

// Referenced literally so Next.js inlines them into the client bundle at build time.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = () => !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/**
 * supabase-js hands back the SAME channel object for a topic until it's fully removed, so a
 * quick leave-and-rejoin (React dev mode mounts effects twice) must wait for the old close.
 */
const pendingCloses = new Map<string, Promise<void>>();

function getClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  // Realtime only: no auth session, no database tables.
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return client;
}

/** One Supabase Realtime channel per room: `room:ABCD`, using Broadcast + Presence. */
export function createSupabaseChannel(roomCode: string): RoomChannel {
  const messageHandlers = new Map<string, ((payload: unknown) => void)[]>();
  const presenceHandlers: ((members: PresenceMeta[]) => void)[] = [];
  let channel: RealtimeChannel | null = null;

  return {
    onMessage(event, handler) {
      messageHandlers.set(event, [...(messageHandlers.get(event) ?? []), handler]);
    },
    onPresence(handler) {
      presenceHandlers.push(handler);
    },
    async connect(me) {
      await pendingCloses.get(roomCode);
      return new Promise<void>((resolve, reject) => {
        const ch = getClient().channel(`room:${roomCode}`, {
          config: { broadcast: { self: false }, presence: { key: me.playerId } },
        });
        channel = ch;
        for (const [event, handlers] of messageHandlers) {
          ch.on("broadcast", { event }, ({ payload }) => handlers.forEach((h) => h(payload)));
        }
        ch.on("presence", { event: "sync" }, () => {
          const members = cleanMembers(Object.values(ch.presenceState()).flat());
          presenceHandlers.forEach((h) => h(members));
        });
        let settled = false;
        ch.subscribe(async (status, err) => {
          if (status === "SUBSCRIBED") {
            await ch.track({ ...me });
            if (!settled) (settled = true), resolve();
          } else if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !settled) {
            settled = true;
            reject(err ?? new Error(`Couldn't connect to the room (${status.toLowerCase().replace("_", " ")}).`));
          }
        });
      });
    },
    async send(event, payload) {
      await channel?.send({ type: "broadcast", event, payload });
    },
    async close() {
      if (!channel) return;
      const ch = channel;
      channel = null;
      const closing = (async () => {
        await ch.untrack().catch(() => {});
        await getClient().removeChannel(ch);
      })();
      pendingCloses.set(roomCode, closing);
      await closing;
      if (pendingCloses.get(roomCode) === closing) pendingCloses.delete(roomCode);
    },
  };
}
