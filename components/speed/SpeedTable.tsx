"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, RefreshCw, Zap } from "lucide-react";
import type { Card } from "@/types/cards";
import type { SpeedAction, SpeedEvent } from "@/types/speed";
import { targetsFor, type SpeedPublicSide, type SpeedView } from "@/lib/speed-engine";
import { DIFFICULTY_LABEL } from "@/lib/bot-ai";
import { playCardFlip, playThud } from "@/lib/sound-effects";
import { PlayingCard, cardName } from "@/components/ui/PlayingCard";

interface SpeedTableProps {
  view: SpeedView;
  /** Whose hand is at the bottom (null: watching, the first player sits there face down). */
  focusId: string | null;
  /** You can play from the bottom hand. */
  canAct: boolean;
  onAction: (action: SpeedAction) => void;
  /** A move the host turned away because the pile changed first (or it didn't fit). */
  bounce: { message: string; id: number } | null;
  connectedIds?: Set<string>;
}

/** Cards in a run: a player's plays, each within this long of the one before. */
export const CHAIN_GAP_MS = 2000;

const rankOf = (c: Card) => (c.kind === "standard" ? c.rank : 2);

/** A steady tilt for a card on a pile, -6° to 6°, the same on every screen. */
function tilt(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return { r: (Math.abs(h) % 13) - 6, x: (Math.abs(h >> 4) % 7) - 3, y: (Math.abs(h >> 8) % 7) - 3 };
}

/** How many cards in a row this play makes for its player (their own plays, each within two seconds). */
export function chainAt(log: SpeedEvent[], n: number) {
  const plays = log.filter((e): e is Extract<SpeedEvent, { kind: "play" }> => e.kind === "play" && e.n <= n);
  const last = plays.at(-1);
  if (!last || last.n !== n) return 0;
  let count = 0;
  let at = last.at;
  for (const e of [...plays].reverse().filter((p) => p.by === last.by)) {
    if (at - e.at > CHAIN_GAP_MS) break;
    count += e.cards.length;
    at = e.at;
  }
  return count;
}

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return wide;
}

/** 3, 2, 1 counted on this screen from when the countdown arrived, then "Speed!" as play opens. */
function useCountdown(phase: SpeedView["phase"]) {
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [go, setGo] = useState(false);
  const was = useRef(phase);
  useEffect(() => {
    if (phase === "countdown") setStarted(Date.now());
    if (was.current === "countdown" && phase !== "countdown") {
      setGo(true);
      const t = setTimeout(() => setGo(false), 700);
      was.current = phase;
      return () => clearTimeout(t);
    }
    was.current = phase;
  }, [phase]);
  useEffect(() => {
    if (phase !== "countdown") return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [phase]);
  if (phase === "countdown" && started !== null) return String(Math.max(1, 3 - Math.floor(Math.max(0, now - started) / 1000)));
  return go ? "Speed!" : null;
}

export function SpeedTable({ view, focusId, canAct, onAction, bounce, connectedIds }: SpeedTableProps) {
  const sides = view.sides!;
  const bottom = sides.find((x) => x.id === focusId) ?? sides[0];
  const top = sides.find((x) => x.id !== bottom.id)!;
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? "";
  const countdown = useCountdown(view.phase);
  const wide = useWide();
  const reduceMotion = useReducedMotion();

  // Where each card on a pile came from, so it flies in from that side.
  const origin = useMemo(() => {
    const out: Record<string, "bottom" | "top" | "spare"> = {};
    for (const e of view.log) {
      if (e.kind !== "play") continue;
      for (const c of e.cards) out[c.id] = e.by === bottom.id ? "bottom" : "top";
    }
    return out;
  }, [view.log, bottom.id]);

  // Sounds for whatever just happened, once each.
  const heard = useRef(view.log.at(-1)?.n ?? -1);
  const [runs, setRuns] = useState<Record<string, { n: number; count: number }>>({});
  useEffect(() => {
    for (const e of view.log) {
      if (e.n <= heard.current) continue;
      heard.current = e.n;
      if (e.kind === "play") {
        const chain = chainAt(view.log, e.n);
        playCardFlip(chain);
        if (chain >= 3) setRuns((r) => ({ ...r, [e.by]: { n: e.n, count: chain } }));
      } else if (e.kind === "flip") playCardFlip(0);
      else playThud();
    }
  }, [view.log]);
  useEffect(() => {
    const ids = Object.keys(runs);
    if (!ids.length) return;
    const t = setTimeout(() => setRuns({}), 1400);
    return () => clearTimeout(t);
  }, [runs]);

  // A move that came back: the card wobbles and the table says so.
  const tapped = useRef<number | null>(null);
  const [miss, setMiss] = useState<{ text: string; id: number; slot: number | null } | null>(null);
  const missOut = (text: string) => {
    playThud();
    setMiss({ text, id: Date.now(), slot: tapped.current });
  };
  useEffect(() => {
    if (bounce) missOut(bounce.message);
  }, [bounce?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!miss) return;
    const t = setTimeout(() => setMiss(null), 900);
    return () => clearTimeout(t);
  }, [miss]);

  const [together, setTogether] = useState(true);
  const hand = bottom.hand;
  const live = view.phase === "live" && canAct;

  const playSlot = (slot: number, preferRight = false) => {
    const card = hand?.[slot];
    if (!live || !card) return;
    tapped.current = slot;
    const targets = targetsFor(card, view);
    if (targets.length === 0) return missOut("Doesn't fit");
    const pile = targets.length > 1 && preferRight ? 1 : targets[0];
    const set = together && view.settings.allowDoubles ? hand!.filter((c): c is Card => !!c && rankOf(c) === rankOf(card)) : [card];
    const cardIds = [card.id, ...set.filter((c) => c.id !== card.id).map((c) => c.id)];
    onAction({ type: "PLAY", playerId: bottom.id, cardIds, pile, expectedTopId: view.piles[pile].at(-1)!.id });
  };
  const canDraw = live && !view.settings.autoDraw && bottom.stockCount > 0 && bottom.filled.includes(false);
  const draw = () => canDraw && onAction({ type: "DRAW", playerId: bottom.id });
  const slap = () => canAct && view.phase === "slap" && onAction({ type: "SLAP", playerId: bottom.id });
  const vote = () => live && onAction({ type: "VOTE_FLIP", playerId: bottom.id });

  // 1–5 play a card (Shift for the right pile when both fit), Space draws or slaps, F asks for new cards.
  const keys = useRef({ playSlot, draw, slap, vote });
  keys.current = { playSlot, draw, slap, vote };
  useEffect(() => {
    if (!canAct) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]");
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typing) return;
      const k = keys.current;
      const digit = /^Digit([1-5])$/.exec(e.code);
      if (digit) {
        e.preventDefault();
        k.playSlot(Number(digit[1]) - 1, e.shiftKey);
      } else if (e.code === "Space") {
        e.preventDefault();
        k.slap();
        k.draw();
      } else if (e.code === "KeyF") k.vote();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canAct]);

  const size = wide ? "lg" : "md";
  const doubles = view.settings.allowDoubles;

  return (
    <section aria-label="Table" className="felt relative mx-4 overflow-hidden rounded-[2.5rem] px-3 py-6 sm:px-8 sm:py-8">
      <SideBar side={top} view={view} run={runs[top.id]?.count} disconnected={!!connectedIds && !connectedIds.has(top.id)} />
      <div aria-hidden className="mt-3 flex justify-center gap-1.5 sm:gap-2">
        {top.filled.map((on, i) => (
          <div key={i} className={clsx("rounded-lg", size === "lg" ? "h-20 w-14" : "h-14 w-10", on ? "card-back shadow-md ring-1 ring-black/40" : "border border-dashed border-bone/15")} />
        ))}
      </div>

      {/* The middle: spare, pile, pile, spare. */}
      <div className="relative my-8 flex items-center justify-center gap-3 sm:gap-8">
        <Spare count={view.spareCounts[0]} />
        {([0, 1] as const).map((i) => (
          <Pile key={i} cards={view.piles[i]} count={view.pileCounts[i]} faceDown={view.phase === "countdown"} origin={origin} size={size} label={i === 0 ? "Left pile" : "Right pile"} />
        ))}
        <Spare count={view.spareCounts[1]} />

        <AnimatePresence>
          {countdown && (
            <motion.p
              key={countdown}
              role="status"
              className="pointer-events-none absolute inset-0 grid place-items-center font-display text-8xl font-extrabold text-bone [text-shadow:0_4px_30px_rgba(0,0,0,0.6)]"
              initial={{ opacity: 0, scale: 1.4 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.25 }}
            >
              {countdown}
            </motion.p>
          )}
          {miss && (
            <motion.p
              key={miss.id}
              role="status"
              className="pointer-events-none absolute -bottom-7 rounded-full bg-chip px-3 py-0.5 text-sm font-bold text-bone"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {miss.text}
            </motion.p>
          )}
        </AnimatePresence>

        {view.phase === "slap" && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-smoke/55 backdrop-blur-[1px]">
            <div className="flex flex-col items-center gap-3">
              <p className="text-base font-bold text-bone">{view.emptyId === bottom.id && canAct ? "You're out. Slap it!" : `${name(view.emptyId!)} is out`}</p>
              <motion.button
                onClick={slap}
                disabled={!canAct}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 16 }}
                className="flex min-h-20 items-center gap-3 rounded-full bg-brass px-10 font-display text-5xl font-extrabold text-smoke shadow-[0_0_40px_rgba(214,182,127,0.55)] transition hover:bg-brass-lit disabled:opacity-60"
              >
                <Zap className="size-9" aria-hidden /> Speed!
              </motion.button>
            </div>
          </div>
        )}
      </div>

      <div className="flex min-h-11 justify-center">
        {(view.phase === "live" || view.phase === "stalled") && (
          <button
            onClick={vote}
            disabled={!live}
            aria-pressed={bottom.flipVote}
            className={clsx(
              "flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold transition disabled:opacity-50",
              bottom.flipVote ? "bg-bone text-smoke" : top.flipVote ? "bg-black/25 text-bone ring-2 ring-brass-lit" : "bg-black/20 text-parchment ring-1 ring-bone/20 hover:text-bone",
            )}
          >
            <RefreshCw className="size-4" aria-hidden />
            {view.phase === "stalled" ? "New cards…" : bottom.flipVote ? `Waiting for ${name(top.id)}` : top.flipVote ? `${name(top.id)} wants new cards` : "Flip new cards"}
          </button>
        )}
      </div>

      <div className="mt-5 flex items-end justify-center gap-3 sm:gap-6">
        <ul aria-label={canAct ? "Your hand" : `${name(bottom.id)}'s hand`} className="flex gap-1.5 sm:gap-2">
          {bottom.filled.map((on, i) => {
            const c = hand?.[i] ?? null;
            const pair = c && doubles && together ? hand!.filter((x) => x && rankOf(x) === rankOf(c)).length : 0;
            return (
              <li key={i} className="flex flex-col items-center gap-1">
                {on && c ? (
                  <motion.button
                    key={c.id}
                    onClick={(e) => playSlot(i, e.shiftKey)}
                    disabled={!live}
                    aria-label={`${cardName(c, true)}${pair > 1 ? `, with ${pair - 1} more of that rank` : ""}`}
                    initial={{ y: 24, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    whileTap={{ scale: 0.94 }}
                    transition={{ type: "spring", stiffness: 500, damping: 28 }}
                    className="relative block rounded-xl"
                  >
                    <motion.span
                      key={miss?.slot === i ? miss.id : "still"}
                      className="block"
                      animate={miss?.slot === i && !reduceMotion ? { x: [0, -7, 6, -4, 0] } : undefined}
                      transition={{ duration: 0.32 }}
                    >
                      <PlayingCard card={c} size={size} entrance={false} />
                    </motion.span>
                    {pair > 1 && <span className="absolute -top-2 -right-2 rounded-full bg-brass-lit px-1.5 text-xs font-bold text-smoke shadow">×{pair}</span>}
                  </motion.button>
                ) : on ? (
                  <div className={clsx("card-back rounded-lg shadow-md ring-1 ring-black/40", size === "lg" ? "h-28 w-20" : "h-20 w-14")} />
                ) : (
                  <div className={clsx("rounded-lg border border-dashed border-bone/15", size === "lg" ? "h-28 w-20" : "h-20 w-14")} />
                )}
                {canAct && wide && <kbd className="font-display text-sm text-ash">{i + 1}</kbd>}
              </li>
            );
          })}
        </ul>
        <Stock count={bottom.stockCount} onDraw={canDraw ? draw : undefined} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <SideBar side={bottom} view={view} run={runs[bottom.id]?.count} you={bottom.id === view.viewerId} inline disconnected={!!connectedIds && !connectedIds.has(bottom.id)} />
        {canAct && doubles && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-parchment">
            <input type="checkbox" checked={together} onChange={(e) => setTogether(e.target.checked)} className="size-4 accent-[var(--color-brass)]" />
            Same ranks go down together
          </label>
        )}
      </div>
    </section>
  );
}

function SideBar({ side, view, run, you, inline, disconnected }: { side: SpeedPublicSide; view: SpeedView; run?: number; you?: boolean; inline?: boolean; disconnected: boolean }) {
  const player = view.players.find((p) => p.id === side.id);
  const left = side.filled.filter(Boolean).length + side.stockCount;
  return (
    <p className={clsx("flex items-center justify-center gap-2 text-base text-bone", !inline && "mx-auto")}>
      {player?.isBot && <Bot className="size-4 shrink-0 text-brass-lit" aria-label={`${DIFFICULTY_LABEL[player.botDifficulty ?? "medium"]} bot`} />}
      <span className="font-bold">{player?.name}</span>
      {you && player?.name !== "You" && <span className="text-sm text-brass-lit">you</span>}
      <span className="text-sm">
        <span className="font-display text-lg font-bold tabular-nums">{left}</span> to go
      </span>
      {disconnected && <span className="text-sm text-ash">· reconnecting…</span>}
      <AnimatePresence>
        {run && (
          <motion.span key={run} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="rounded-full bg-brass px-2 font-display text-base font-bold text-smoke">
            {run} in a row
          </motion.span>
        )}
      </AnimatePresence>
    </p>
  );
}

function Pile({ cards, count, faceDown, origin, size, label }: { cards: Card[]; count: number; faceDown: boolean; origin: Record<string, "bottom" | "top" | "spare">; size: "md" | "lg"; label: string }) {
  // Cards already here when the table opened don't fly in.
  const settled = useRef(new Set(cards.map((c) => c.id)));
  const box = size === "lg" ? "h-28 w-20" : "h-20 w-14";
  const shown = cards.slice(-4);
  const topCard = cards.at(-1);
  return (
    <div role="img" aria-label={faceDown || !topCard ? `${label}, face down` : `${label}: ${cardName(topCard, true)}, ${count} ${count === 1 ? "card" : "cards"}`} className={clsx("relative", box)}>
      {faceDown ? (
        <div className={clsx("card-back absolute inset-0 rounded-xl shadow-md ring-1 ring-black/40", box)} />
      ) : (
        shown.map((c) => {
          const t = tilt(c.id);
          const from = origin[c.id] ?? "spare";
          const fresh = !settled.current.has(c.id);
          return (
            <motion.div
              key={c.id}
              className="absolute inset-0"
              initial={fresh ? { y: from === "bottom" ? 150 : from === "top" ? -150 : 0, x: from === "spare" ? (label === "Left pile" ? -90 : 90) : 0, rotate: t.r * 3, opacity: 0.6 } : false}
              animate={{ x: t.x, y: t.y, rotate: t.r, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 28 }}
              onAnimationComplete={() => settled.current.add(c.id)}
            >
              <PlayingCard card={c} size={size} entrance={false} />
            </motion.div>
          );
        })
      )}
    </div>
  );
}

function Spare({ count }: { count: number }) {
  return (
    <div className="flex flex-col items-center gap-1" role="img" aria-label={`Spare pile, ${count} cards`}>
      <div className="relative h-14 w-10">
        {count === 0 ? (
          <div className="absolute inset-0 rounded-md border border-dashed border-bone/20" />
        ) : (
          <>
            {count > 1 && <div className="card-back absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-md ring-1 ring-black/40" />}
            <div className="card-back absolute inset-0 rounded-md shadow-md ring-1 ring-black/40" />
          </>
        )}
      </div>
      <span className="font-display text-sm text-bone tabular-nums">{count}</span>
    </div>
  );
}

function Stock({ count, onDraw }: { count: number; onDraw?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={onDraw}
        disabled={!onDraw}
        aria-label={onDraw ? `Draw from your stock, ${count} cards` : `Stock, ${count} cards`}
        className={clsx("relative h-20 w-14 rounded-lg transition", onDraw && "ring-3 ring-brass-lit shadow-[0_0_18px_rgba(214,182,127,0.6)] hover:-translate-y-0.5")}
      >
        {count === 0 ? (
          <span className="absolute inset-0 rounded-lg border border-dashed border-bone/20" />
        ) : (
          <>
            <span className="card-back absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-lg ring-1 ring-black/40" />
            <span className="card-back absolute inset-0 rounded-lg shadow-md ring-1 ring-black/40" />
          </>
        )}
      </button>
      <span className="font-display text-sm text-bone tabular-nums">{count}</span>
    </div>
  );
}
