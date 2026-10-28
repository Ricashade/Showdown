"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Bot } from "lucide-react";
import type { Card, Rank } from "@/types/cards";
import type { GoFishAction, GoFishEvent } from "@/types/gofish";
import { knownRanks, rankOf, type GoFishLegal, type GoFishPublicPlayer, type GoFishView } from "@/lib/gofish-engine";
import { rankShort, sortCards } from "@/lib/cards";
import { DIFFICULTY_LABEL } from "@/lib/bot-ai";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { bubbleFor, plural } from "./words";

type Ask = Extract<GoFishEvent, { kind: "ask" }>;

interface GoFishTableProps {
  view: GoFishView;
  /** Whose hand is shown at the bottom. */
  focusId: string | null;
  legal: GoFishLegal;
  actingId: string | null;
  onAction: (action: GoFishAction) => void;
  connectedIds?: Set<string>;
}

export function GoFishTable({ view, focusId, legal, actingId, onAction, connectedIds }: GoFishTableProps) {
  const focus = view.players.find((p) => p.id === focusId) ?? null;
  const others = view.players.filter((p) => p.id !== focus?.id);
  const canAsk = legal.isMyTurn && !!actingId && actingId === focus?.id;
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? "";

  // Two clicks: who to ask, then which rank.
  const [target, setTarget] = useState<string | null>(null);
  const [rank, setRank] = useState<Rank | null>(null);
  useEffect(() => {
    // With just one person to ask, they're already picked.
    setTarget(canAsk && legal.targets.length === 1 ? legal.targets[0] : null);
    setRank(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.version, canAsk]);

  const lastAsk = useMemo(() => {
    const out: Record<string, Ask> = {};
    for (const e of view.log) if (e.kind === "ask") out[e.askerId] = e;
    return out;
  }, [view.log]);
  const latest = [...view.log].reverse().find((e): e is Ask => e.kind === "ask");
  const memory = useMemo(() => (view.settings.memoryHelper ? knownRanks(view.log) : {}), [view.log, view.settings.memoryHelper]);

  const ready = canAsk && !!target && rank !== null && legal.targets.includes(target) && legal.ranks.includes(rank);

  return (
    <section aria-label="Table" className="felt mx-4 rounded-[2.5rem] px-4 py-6 sm:px-8 sm:py-8">
      <ul className="flex flex-wrap items-start justify-center gap-x-6 gap-y-6">
        {others.map((p) => {
          const selectable = canAsk && legal.targets.includes(p.id);
          return (
            <li key={p.id}>
              <Seat
                player={p}
                view={view}
                bubble={lastAsk[p.id] ? bubbleFor(lastAsk[p.id], name) : null}
                goFish={latest?.targetId === p.id && latest.got === 0 ? latest.n : null}
                known={memory[p.id]}
                selectable={selectable}
                selected={selectable && target === p.id}
                onSelect={() => setTarget(p.id)}
                disconnected={!!connectedIds && !connectedIds.has(p.id)}
              />
            </li>
          );
        })}
      </ul>

      <Pond view={view} latest={latest ?? null} />

      {focus && (
        <div className="flex flex-col items-center gap-4">
          {focus.books.length > 0 && <Books books={focus.books} size={view.settings.bookSize} />}
          {focus.hand && (
            <Hand
              hand={focus.hand}
              bookSize={view.settings.bookSize}
              selectable={canAsk}
              selected={rank}
              onSelect={setRank}
              fresh={latest?.askerId === focus.id && latest.got > 0 ? latest.rank : null}
            />
          )}
          {canAsk && (
            <button
              onClick={() => ready && onAction({ type: "ASK", playerId: actingId!, targetId: target!, rank: rank! })}
              disabled={!ready}
              className="min-h-14 rounded-full bg-brass px-8 font-display text-2xl font-bold text-smoke shadow-lg transition hover:bg-brass-lit disabled:opacity-40"
            >
              {target && rank !== null ? `Ask ${name(target)} for ${plural(rank)}` : !target ? "Pick who to ask" : "Pick a rank from your hand"}
            </button>
          )}
          <Nameplate player={focus} view={view} you={focus.id === view.viewerId} />
        </div>
      )}
    </section>
  );
}

function Seat({
  player: p,
  view,
  bubble,
  goFish,
  known,
  selectable,
  selected,
  onSelect,
  disconnected,
}: {
  player: GoFishPublicPlayer;
  view: GoFishView;
  bubble: string | null;
  /** The ask this player just answered with "Go fish!" (to pop the bubble once per ask). */
  goFish: number | null;
  known?: Set<Rank>;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
  disconnected: boolean;
}) {
  const isTurn = view.phase === "playing" && view.currentTurnId === p.id;
  const knownList = known ? [...known].sort((a, b) => a - b) : [];
  return (
    <div className="relative flex w-44 flex-col items-center gap-2">
      <AnimatePresence>
        {goFish !== null && (
          <motion.span
            key={goFish}
            initial={{ scale: 0.4, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 18 }}
            className="absolute -top-4 right-0 z-10 rounded-2xl rounded-br-sm bg-bone px-3 py-1 font-display text-lg font-extrabold text-smoke shadow-lg"
          >
            🐟 Go fish!
          </motion.span>
        )}
      </AnimatePresence>

      <button
        onClick={onSelect}
        disabled={!selectable}
        aria-pressed={selectable ? selected : undefined}
        aria-label={`${p.name}, ${p.handCount} cards, ${p.books.length} books${selectable ? ". Ask them" : ""}`}
        className={clsx(
          "flex w-full flex-col items-center gap-1.5 rounded-3xl p-2 transition",
          selectable && "hover:bg-black/20",
          selected && "bg-black/25 ring-3 ring-brass-lit shadow-[0_0_20px_rgba(214,182,127,0.6)]",
        )}
      >
        <div className="flex h-14 items-end pl-5" aria-hidden>
          {Array.from({ length: Math.min(p.handCount, 8) }, (_, i) => (
            <div key={i} className="-ml-5">
              <PlayingCard card={null} faceUp={false} size="sm" entrance={false} />
            </div>
          ))}
          {p.handCount === 0 && <span className="pb-4 text-sm text-ash">No cards</span>}
        </div>
        <div className={clsx("flex w-full flex-col items-center rounded-2xl px-3 py-1.5", isTurn ? "bg-leather-lit ring-2 ring-brass-lit" : "bg-leather")}>
          <span className="flex max-w-full items-center gap-1.5 truncate text-base font-bold text-bone">
            {p.isBot && <Bot className="size-4 shrink-0 text-brass-lit" aria-hidden />}
            {p.name}
          </span>
          <span className="text-xs text-parchment tabular-nums">
            {p.handCount} {p.handCount === 1 ? "card" : "cards"} · {p.books.length} {p.books.length === 1 ? "book" : "books"}
            {p.isBot && ` · ${DIFFICULTY_LABEL[p.botDifficulty ?? "medium"]}`}
          </span>
          {isTurn && p.isBot && <span className="text-xs font-bold text-brass-lit">Thinking…</span>}
          {disconnected && <span className="text-xs text-parchment">Reconnecting…</span>}
        </div>
      </button>

      {bubble && <p className="w-full rounded-2xl bg-black/30 px-3 py-1.5 text-center text-xs text-bone">“{bubble}”</p>}
      {knownList.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1" aria-label={`${p.name} is known to hold ${knownList.map(plural).join(", ")}`}>
          <span className="text-xs text-ash">Has</span>
          {knownList.map((r) => (
            <span key={r} className="rounded-md bg-bone px-1.5 font-display text-sm font-extrabold text-smoke">
              {rankShort(r)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** The pond, and what the last ask did. */
function Pond({ view, latest }: { view: GoFishView; latest: Ask | null }) {
  const stack = Math.min(5, Math.ceil(view.pondCount / 8));
  return (
    <div className="my-7 flex items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-1.5">
        <div className="relative h-20 w-14" role="img" aria-label={`The pond, ${view.pondCount} cards`}>
          {view.pondCount === 0 ? (
            <div className="absolute inset-0 rounded-lg border border-dashed border-bone/30" />
          ) : (
            Array.from({ length: stack }, (_, i) => (
              <div key={i} className="card-back absolute inset-0 rounded-lg ring-1 ring-black/40" style={{ transform: `translate(${i * 2}px, ${-i * 2}px) rotate(${(i % 2 ? 1 : -1) * i * 2}deg)` }} />
            ))
          )}
        </div>
        <span className="text-xs text-bone tabular-nums">Pond {view.pondCount}</span>
      </div>
      <AnimatePresence mode="wait">
        {latest?.lucky && latest.shown && (
          <motion.div key={latest.n} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3">
            <PlayingCard card={latest.shown} size="md" startFaceDown revealDelay={0.2} />
            <span className="font-display text-2xl font-extrabold text-brass-lit">🍀 Lucky catch!</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Books({ books, size }: { books: Rank[]; size: 2 | 4 }) {
  const suits = ["S", "H", "D", "C"] as const;
  return (
    <ul aria-label="Your books" className="flex flex-wrap justify-center gap-3">
      {books.map((r, i) => (
        <li key={`${r}-${i}`} className="flex rounded-xl bg-black/20 p-1 pl-6">
          {suits.slice(0, size).map((s) => (
            <span key={s} className="-ml-6">
              <PlayingCard card={{ id: `${r}${s}`, kind: "standard", rank: r, suit: s }} size="sm" entrance={false} />
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

/** Your hand, grouped by rank, with how close each rank is to a book. */
function Hand({
  hand,
  bookSize,
  selectable,
  selected,
  onSelect,
  fresh,
}: {
  hand: Card[];
  bookSize: 2 | 4;
  selectable: boolean;
  selected: Rank | null;
  onSelect: (r: Rank) => void;
  /** The rank you just took: those cards glow as they arrive. */
  fresh: Rank | null;
}) {
  const groups = new Map<Rank, Card[]>();
  for (const c of sortCards(hand).reverse()) groups.set(rankOf(c), [...(groups.get(rankOf(c)) ?? []), c]);
  return (
    <ul aria-label="Your hand" className="flex flex-wrap items-end justify-center gap-x-4 gap-y-5">
      {[...groups].map(([r, list]) => {
        const on = selected === r;
        const need = bookSize - list.length;
        return (
          <li key={r}>
            <motion.button
              onClick={() => onSelect(r)}
              disabled={!selectable}
              aria-pressed={selectable ? on : undefined}
              aria-label={`${plural(r)}: you hold ${list.length} of ${bookSize}${selectable ? ". Ask for these" : ""}`}
              animate={{ y: on ? -14 : 0 }}
              className={clsx("flex flex-col items-center gap-1.5 rounded-2xl p-1.5 transition", selectable && "hover:bg-black/20", on && "bg-black/25 ring-3 ring-bone")}
            >
              <div className="flex pl-8">
                {list.map((c) => (
                  <div key={c.id} className="-ml-8">
                    <PlayingCard card={c} size="md" highlight={fresh === r ? "match" : null} />
                  </div>
                ))}
              </div>
              <span className="rounded-full bg-black/35 px-2 text-xs font-bold text-bone tabular-nums">
                {list.length}/{bookSize}
                {need > 0 && <span className="text-parchment"> · need {need}</span>}
              </span>
            </motion.button>
          </li>
        );
      })}
    </ul>
  );
}

function Nameplate({ player: p, view, you }: { player: GoFishPublicPlayer; view: GoFishView; you: boolean }) {
  const isTurn = view.phase === "playing" && view.currentTurnId === p.id;
  return (
    <div className={clsx("flex min-w-32 flex-col items-center rounded-2xl px-3 py-1.5", isTurn ? "bg-leather-lit ring-2 ring-brass-lit" : "bg-leather")}>
      <span className="text-base font-bold text-bone">
        {p.name}
        {you && <span className="ml-1.5 text-xs font-normal text-brass-lit">you</span>}
      </span>
      <span className="text-xs text-parchment tabular-nums">
        {p.books.length} {p.books.length === 1 ? "book" : "books"}
      </span>
    </div>
  );
}
