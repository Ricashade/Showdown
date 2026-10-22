import { cleanMembers, type PresenceMeta, type RoomChannel } from "./channel";

const HEARTBEAT_MS = 1500;
const STALE_MS = 5000;

/**
 * Test transport for when Supabase isn't configured: connects tabs of THIS browser only,
 * with presence rebuilt from heartbeats. Same protocol, so the online flow can be tried
 * locally by opening a second tab.
 */
export function createTabChannel(roomCode: string): RoomChannel {
  const messageHandlers = new Map<string, ((payload: unknown) => void)[]>();
  const presenceHandlers: ((members: PresenceMeta[]) => void)[] = [];
  const tabId = globalThis.crypto.randomUUID();
  const members = new Map<string, { meta: PresenceMeta; seen: number }>();
  let bc: BroadcastChannel | null = null;
  let me: PresenceMeta | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const emit = () => {
    const list = cleanMembers([me, ...[...members.values()].map((m) => m.meta)]);
    presenceHandlers.forEach((h) => h(list));
  };
  const post = (data: unknown) => bc?.postMessage(data);
  const onPageHide = () => post({ kind: "bye", tab: tabId });

  return {
    onMessage(event, handler) {
      messageHandlers.set(event, [...(messageHandlers.get(event) ?? []), handler]);
    },
    onPresence(handler) {
      presenceHandlers.push(handler);
    },
    async connect(meta) {
      me = meta;
      bc = new BroadcastChannel(`showdown-room-${roomCode}`);
      bc.onmessage = ({ data }) => {
        if (!data || data.tab === tabId) return;
        if (data.kind === "msg") {
          messageHandlers.get(data.event)?.forEach((h) => h(data.payload));
        } else if (data.kind === "hello" || data.kind === "beat") {
          const isNew = !members.has(data.tab);
          members.set(data.tab, { meta: data.meta, seen: Date.now() });
          if (data.kind === "hello") post({ kind: "beat", tab: tabId, meta: me });
          if (isNew) emit();
        } else if (data.kind === "bye") {
          if (members.delete(data.tab)) emit();
        }
      };
      post({ kind: "hello", tab: tabId, meta });
      timer = setInterval(() => {
        post({ kind: "beat", tab: tabId, meta: me });
        let changed = false;
        for (const [id, m] of members) if (Date.now() - m.seen > STALE_MS) changed = members.delete(id) || changed;
        if (changed) emit();
      }, HEARTBEAT_MS);
      window.addEventListener("pagehide", onPageHide);
      emit();
    },
    async send(event, payload) {
      post({ kind: "msg", tab: tabId, event, payload });
    },
    async close() {
      onPageHide();
      window.removeEventListener("pagehide", onPageHide);
      if (timer) clearInterval(timer);
      bc?.close();
      bc = null;
    },
  };
}
