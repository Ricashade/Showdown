import { cleanMembers, type PresenceMeta, type RoomChannel } from "./channel";

/** In-memory hub with Supabase-like semantics, for tests. */
export function createMemoryHub() {
  const rooms = new Map<string, Set<Peer>>();
  interface Peer {
    meta: PresenceMeta | null;
    deliver(event: string, payload: unknown): void;
    presence(members: PresenceMeta[]): void;
  }
  const syncPresence = (code: string) => {
    const peers = rooms.get(code) ?? new Set<Peer>();
    const members = cleanMembers([...peers].map((p) => p.meta));
    peers.forEach((p) => queueMicrotask(() => p.presence(members)));
  };

  return {
    factory(roomCode: string): RoomChannel {
      const messageHandlers = new Map<string, ((payload: unknown) => void)[]>();
      const presenceHandlers: ((m: PresenceMeta[]) => void)[] = [];
      const peer: Peer = {
        meta: null,
        deliver: (event, payload) => messageHandlers.get(event)?.forEach((h) => h(structuredClone(payload))),
        presence: (members) => presenceHandlers.forEach((h) => h(members)),
      };
      return {
        onMessage: (event, h) => void messageHandlers.set(event, [...(messageHandlers.get(event) ?? []), h]),
        onPresence: (h) => void presenceHandlers.push(h),
        async connect(meta) {
          peer.meta = meta;
          if (!rooms.has(roomCode)) rooms.set(roomCode, new Set());
          rooms.get(roomCode)!.add(peer);
          syncPresence(roomCode);
        },
        async send(event, payload) {
          rooms.get(roomCode)?.forEach((p) => p !== peer && queueMicrotask(() => p.deliver(event, payload)));
        },
        async close() {
          rooms.get(roomCode)?.delete(peer);
          syncPresence(roomCode);
        },
      };
    },
    /** Everything any peer sent, as an eavesdropper on the channel would see it. */
    tap(roomCode: string, onMessage: (event: string, payload: unknown) => void) {
      const spy: Peer = { meta: null, deliver: onMessage, presence: () => {} };
      if (!rooms.has(roomCode)) rooms.set(roomCode, new Set());
      rooms.get(roomCode)!.add(spy);
    },
  };
}
