"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftRight, Bot, MessageSquare, Minus, SendHorizontal } from "lucide-react";
import type { ActiveGameState } from "@/types/party";
import { REACTIONS, mergeChat, reactionEmoji, senderColor, type ChatMessage } from "@/lib/chat";
import { matchWinners } from "@/lib/party-engine";
import { useBanterSetting, useBotBanter, useLocalChat, useRoomEvents } from "@/lib/hooks/use-room-chat";

export interface RoomChatProps {
  /** "Room chat" online, "Table chat" in a simulator. */
  title: string;
  code?: string;
  /** Who's talking from this screen. */
  me: string;
  messages: ChatMessage[];
  onSend: (kind: "chat" | "reaction", text: string) => void;
  /** Connected to the room (online only; no dot without it). */
  live?: boolean;
  /** Host and simulator only: let the bots talk. */
  banter?: { on: boolean; set: (on: boolean) => void };
}

const PREVIEW_MS = 4500;
const SIDE_KEY = "showdown:chat-side";

/**
 * The room chat: a corner launcher that opens a drawer, a passing preview of new lines while
 * it's closed, and one-tap reactions that also float up from the sender's seat. It sits above
 * the table (and its dialogs), in the corner the player chooses.
 */
export function RoomChat({ title, code, me, messages, onSend, live, banter }: RoomChatProps) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"right" | "left">("right");
  const [unread, setUnread] = useState(0);
  const [preview, setPreview] = useState<ChatMessage | null>(null);
  const [floats, setFloats] = useState<{ id: string; emoji: string; x: number; y: number }[]>([]);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const seen = useRef<Set<string> | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDE_KEY) === "left") setSide("left");
    } catch {
      // Storage blocked: stay right.
    }
  }, []);
  const flipSide = () => {
    const next = side === "right" ? "left" : "right";
    setSide(next);
    try {
      localStorage.setItem(SIDE_KEY, next);
    } catch {
      // Not critical.
    }
  };

  // New arrivals: float reactions from their seat, and while closed, count and preview them.
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(messages.map((m) => m.id));
      return;
    }
    const fresh = messages.filter((m) => !seen.current!.has(m.id));
    if (fresh.length === 0) return;
    fresh.forEach((m) => seen.current!.add(m.id));

    for (const m of fresh.filter((m) => m.kind === "reaction")) {
      const at = seatOf(m.senderId) ?? launcherRef.current?.getBoundingClientRect();
      if (at) setFloats((f) => [...f, { id: m.id, emoji: reactionEmoji(m.text), x: at.left + at.width / 2, y: at.top }]);
    }
    const fromOthers = fresh.filter((m) => m.senderId !== me);
    if (!openRef.current && fromOthers.length) {
      setUnread((n) => n + fromOthers.filter((m) => m.kind !== "system").length);
      setPreview(fromOthers.at(-1)!);
    }
  }, [messages, me]);

  useEffect(() => {
    if (!preview) return;
    const t = setTimeout(() => setPreview(null), PREVIEW_MS);
    return () => clearTimeout(t);
  }, [preview]);

  const show = () => {
    setOpen(true);
    setUnread(0);
    setPreview(null);
  };

  const right = side === "right";
  return (
    <>
      <div className={clsx("fixed bottom-5 z-[58] flex flex-col gap-3", right ? "right-5 items-end" : "left-5 items-start")}>
        <AnimatePresence>
          {open && (
            <Drawer
              key="drawer"
              title={title}
              code={code}
              me={me}
              messages={messages}
              live={live}
              banter={banter}
              origin={right ? "bottom right" : "bottom left"}
              onSend={onSend}
              onFlip={flipSide}
              onClose={() => {
                setOpen(false);
                requestAnimationFrame(() => launcherRef.current?.focus());
              }}
            />
          )}
        </AnimatePresence>

        <div className={clsx("flex items-center gap-3", !right && "flex-row-reverse")}>
          <AnimatePresence>
            {preview && !open && (
              <motion.button
                key={preview.id}
                onClick={show}
                initial={{ opacity: 0, x: right ? 16 : -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="max-w-[min(20rem,calc(100vw-7rem))] truncate rounded-full bg-smoke/80 px-4 py-2 text-left text-sm text-bone shadow-lg ring-1 ring-bone/10 backdrop-blur-md"
              >
                {preview.kind === "system" ? (
                  <span className="text-parchment">{preview.text}</span>
                ) : (
                  <>
                    <span className="font-bold" style={{ color: senderColor(preview.senderId ?? "") }}>
                      {preview.senderName}
                    </span>
                    : {preview.text}
                  </>
                )}
              </motion.button>
            )}
          </AnimatePresence>

          <button
            ref={launcherRef}
            onClick={() => (open ? setOpen(false) : show())}
            aria-expanded={open}
            aria-label={unread ? `${title}, ${unread} unread` : title}
            className="relative grid size-14 place-items-center rounded-full bg-smoke-raised/90 text-bone shadow-[0_6px_24px_rgba(0,0,0,0.45),0_0_0_1px_rgba(176,141,87,0.55),0_0_18px_rgba(20,106,69,0.35)] backdrop-blur-md transition hover:bg-leather"
          >
            <MessageSquare className="size-6" aria-hidden />
            <AnimatePresence>
              {unread > 0 && (
                <motion.span
                  key="badge"
                  aria-hidden
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute -top-1 -right-1 grid h-6 min-w-6 place-items-center rounded-full bg-brass px-1.5 text-xs font-bold text-smoke tabular-nums shadow"
                >
                  {unread > 99 ? "99+" : unread}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

      {/* Reactions rising from the seat that sent them. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[57]">
        <AnimatePresence>
          {floats.map((f) => (
            <motion.span
              key={f.id}
              className="absolute -translate-x-1/2 text-3xl drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
              style={{ left: f.x, top: f.y - 8 }}
              initial={{ opacity: 0, y: 6, scale: 0.6 }}
              animate={{ opacity: [0, 1, 1, 0], y: -64, scale: 1.1 }}
              transition={{ duration: 1.7, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
              onAnimationComplete={() => setFloats((all) => all.filter((x) => x.id !== f.id))}
            >
              {f.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

/** Where a player sits on screen right now: their nameplate at the table, or their row in the lobby. */
function seatOf(playerId: string | null): DOMRect | null {
  if (!playerId) return null;
  for (const el of document.querySelectorAll(`[data-seat-of="${CSS.escape(playerId)}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.bottom > 0 && r.top < window.innerHeight) return r;
  }
  return null;
}

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function Drawer({
  title,
  code,
  me,
  messages,
  live,
  banter,
  origin,
  onSend,
  onFlip,
  onClose,
}: Omit<RoomChatProps, "onSend"> & { origin: string; onSend: RoomChatProps["onSend"]; onFlip: () => void; onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stick = useRef(true);
  const titleId = useId();

  useEffect(() => inputRef.current?.focus(), []);
  // Follow new lines, unless you've scrolled up to read back.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = () => {
    if (!draft.trim()) return;
    onSend("chat", draft);
    setDraft("");
  };

  const icon = "grid size-9 place-items-center rounded-full text-parchment transition hover:bg-bone/10 hover:text-bone";
  return (
    <motion.section
      aria-labelledby={titleId}
      initial={{ opacity: 0, y: 18, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 340, damping: 30 }}
      style={{ transformOrigin: origin }}
      className="flex h-[min(420px,70dvh)] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl bg-smoke/85 shadow-[0_24px_60px_rgba(0,0,0,0.55)] ring-1 ring-bone/15 backdrop-blur-xl"
      // Keys typed here belong to the chat, never to the table's shortcuts.
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      <header className="flex items-center gap-2 border-b border-bone/10 py-2 pr-2 pl-4">
        <h2 id={titleId} className="font-display text-xl font-bold text-bone">
          {title}
        </h2>
        {code && <span className="text-sm text-ash tabular-nums">#{code}</span>}
        {live !== undefined && (
          <span
            role="img"
            aria-label={live ? "Connected" : "Reconnecting"}
            className={clsx("size-2 rounded-full", live ? "bg-[#4fa77a] shadow-[0_0_6px_#4fa77a]" : "bg-ash")}
          />
        )}
        <span className="flex-1" />
        {banter && (
          <button
            onClick={() => banter.set(!banter.on)}
            aria-pressed={banter.on}
            aria-label="Bot banter"
            title={banter.on ? "Bot banter on" : "Bot banter off"}
            className={clsx(icon, banter.on && "text-brass-lit")}
          >
            <Bot className="size-4" />
          </button>
        )}
        <button onClick={onFlip} aria-label="Move chat to the other side" title="Other side" className={icon}>
          <ArrowLeftRight className="size-4" />
        </button>
        <button onClick={onClose} aria-label="Minimize chat" title="Minimize" className={icon}>
          <Minus className="size-4" />
        </button>
      </header>

      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex-1 space-y-1.5 overflow-y-auto px-3 py-3"
      >
        {messages.length === 0 && <p className="pt-10 text-center text-sm text-ash">Nothing said yet.</p>}
        {messages.map((m, i) => {
          if (m.kind === "system") {
            return (
              <p key={m.id} className="mx-auto my-2 w-fit max-w-full rounded-full bg-bone/5 px-3 py-1 text-center text-xs text-ash">
                {m.text}
              </p>
            );
          }
          const mine = m.senderId === me;
          const prev = messages[i - 1];
          const first = !prev || prev.kind === "system" || prev.senderId !== m.senderId || m.ts - prev.ts > 120_000;
          const emojiOnly = m.kind === "reaction";
          return (
            <div key={m.id} className={clsx("flex flex-col", mine ? "items-end" : "items-start", first && "pt-1.5")}>
              {first && !mine && (
                <span className="mb-0.5 px-1 text-xs font-bold" style={{ color: senderColor(m.senderId ?? "") }}>
                  {m.senderName}
                </span>
              )}
              <div
                title={time(m.ts)}
                className={clsx(
                  "max-w-[85%] px-3 py-1.5 break-words",
                  emojiOnly ? "text-2xl leading-tight" : "text-sm",
                  mine ? "rounded-2xl rounded-br-xs bg-brass text-smoke" : "rounded-2xl rounded-bl-xs bg-bone/10 text-bone",
                )}
              >
                {m.text}
              </div>
              {(!messages[i + 1] || messages[i + 1].senderId !== m.senderId || messages[i + 1].kind === "system") && (
                <span className="mt-0.5 px-1 text-[0.6875rem] text-ash">{time(m.ts)}</span>
              )}
            </div>
          );
        })}
      </div>

      <div role="group" aria-label="Reactions" className="flex gap-1.5 overflow-x-auto px-3 pt-2 pb-1.5">
        {REACTIONS.map((r) => (
          <button
            key={r.text}
            onClick={() => onSend("reaction", r.text)}
            className="min-h-9 shrink-0 rounded-full bg-bone/5 px-2.5 text-base whitespace-nowrap text-bone ring-1 ring-bone/10 transition hover:bg-bone/12"
          >
            {r.label}
          </button>
        ))}
      </div>

      <form
        className="flex items-center gap-2 px-3 pt-1 pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={200}
          aria-label="Message"
          placeholder="Say something"
          autoComplete="off"
          className="min-h-11 min-w-0 flex-1 rounded-full bg-black/30 px-4 text-sm text-bone ring-1 ring-bone/15 placeholder:text-ash focus-visible:ring-brass-lit focus-visible:outline-none"
        />
        <button
          disabled={!draft.trim()}
          aria-label="Send"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-brass text-smoke transition hover:bg-brass-lit disabled:opacity-40"
        >
          <SendHorizontal className="size-4" />
        </button>
      </form>
    </motion.section>
  );
}

/** Chat for a local simulator: everyone's on this screen, and you talk as whoever you're viewing as. */
export function LocalRoomChat({ state, speakerId }: { state: ActiveGameState; speakerId: string }) {
  const { chat, post } = useLocalChat();
  const [banter, setBanter] = useBanterSetting();
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? "Player";
  useBotBanter(state, banter, (botId, text) => post({ id: botId, name: nameOf(botId) }, "chat", text));
  const events = useRoomEvents({ players: state.players, winners: matchWinners(state), place: "table" });
  return (
    <RoomChat
      title="Table chat"
      me={speakerId}
      messages={mergeChat(chat, events)}
      onSend={(kind, text) => post({ id: speakerId, name: nameOf(speakerId) }, kind, text)}
      banter={{ on: banter, set: setBanter }}
    />
  );
}
