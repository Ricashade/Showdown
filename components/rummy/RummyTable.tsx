"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { motion } from "framer-motion";
import type { Card } from "@/types/cards";
import type { Meld, RummyAction } from "@/types/rummy";
import type { RummyLegal, RummyPublicPlayer, RummyView } from "@/lib/rummy-engine";
import { findMelds, layOffShape, validateMeld } from "@/lib/rummy-melds";
import { cardLabel, SUITS } from "@/lib/cards";
import { DIFFICULTY_LABEL } from "@/lib/bot-ai";
import { cardName, PlayingCard } from "@/components/ui/PlayingCard";

/** Shared-layout id: a card moving from your hand to a meld or the discard pile glides across. */
const cardKey = (c: Card) => `rummy-${c.id}`;
const chips = (n: number) => n.toLocaleString("en-US");

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

export type SortMode = "rank" | "suit";

/** Rank: Aces low to Kings, Jokers last. Suit: ♠ ♥ ♦ ♣, low to high within each. */
export function sortHand(hand: Card[], mode: SortMode): Card[] {
  const rank = (c: Card) => (c.kind === "joker" ? 99 : c.rank === 14 ? 1 : c.rank);
  const suit = (c: Card) => (c.kind === "joker" ? 9 : SUITS.indexOf(c.suit));
  return [...hand].sort((a, b) => (mode === "rank" ? rank(a) - rank(b) || suit(a) - suit(b) : suit(a) - suit(b) || rank(a) - rank(b)));
}

interface RummyTableProps {
  view: RummyView;
  /** Whose hand is shown at the bottom. */
  focusId: string | null;
  legal: RummyLegal;
  actingId: string | null;
  onAction: (action: RummyAction) => void;
  connectedIds?: Set<string>;
}

export function RummyTable({ view, focusId, legal, actingId, onAction, connectedIds }: RummyTableProps) {
  const wide = useWide();
  const focus = view.players.find((p) => p.id === focusId) ?? null;
  const others = view.players.filter((p) => p.id !== focus?.id);
  const canAct = !!actingId && actingId === focus?.id;
  const aceRule = view.settings.aceRule;

  const [sort, setSort] = useState<SortMode>("suit");
  const [selected, setSelected] = useState<string[]>([]);
  // A new step or turn clears the selection.
  useEffect(() => setSelected([]), [view.version, focusId]);

  const hand = useMemo(() => (focus?.hand ? sortHand(focus.hand, sort) : []), [focus?.hand, sort]);
  const ready = useMemo(() => new Set(findMelds(hand, aceRule).flat().map((c) => c.id)), [hand, aceRule]);
  const picked = hand.filter((c) => selected.includes(c.id));
  const playing = canAct && legal.canPlay;
  const meldable = playing && picked.length >= 3 && !!validateMeld(picked, aceRule);
  const layOffTargets = playing && picked.length > 0 ? view.melds.filter((m) => layOffShape(m, picked, aceRule)).map((m) => m.id) : [];
  const canDiscard = playing && picked.length === 1 && !legal.mustPlayId;

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <section aria-label="Table" className="felt mx-4 rounded-[2.5rem] px-4 py-6 sm:px-8 sm:py-8">
      {others.length > 0 && (
        <ul className="flex flex-wrap items-start justify-center gap-x-8 gap-y-4">
          {others.map((p) => (
            <li key={p.id}>
              <Opponent player={p} view={view} disconnected={!!connectedIds && !connectedIds.has(p.id)} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center lg:gap-10">
        <Piles view={view} legal={canAct ? legal : null} actingId={actingId} onAction={onAction} />
        <Melds view={view} targets={layOffTargets} onLayOff={(meldId) => onAction({ type: "LAY_OFF", playerId: actingId!, cardIds: selected, meldId })} />
      </div>

      {focus?.hand && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div role="radiogroup" aria-label="Sort your hand" className="flex gap-1 rounded-full bg-black/30 p-1">
              {(["rank", "suit"] as const).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={sort === m}
                  onClick={() => setSort(m)}
                  className={clsx("min-h-9 rounded-full px-3.5 text-sm font-bold transition", sort === m ? "bg-bone text-smoke" : "text-bone hover:bg-black/20")}
                >
                  {m === "rank" ? "Sort by rank (A–K)" : "Sort by suit (♠ ♥ ♦ ♣)"}
                </button>
              ))}
            </div>
            {playing && (
              <>
                <button
                  onClick={() => onAction({ type: "MELD", playerId: actingId!, cardIds: selected })}
                  disabled={!meldable}
                  className="min-h-11 rounded-full bg-brass px-6 font-display text-xl font-bold text-smoke transition hover:bg-brass-lit disabled:opacity-35"
                >
                  Meld {picked.length >= 3 ? picked.length : ""} cards
                </button>
                <button
                  onClick={() => onAction({ type: "DISCARD", playerId: actingId!, cardId: selected[0] })}
                  disabled={!canDiscard}
                  className="min-h-11 rounded-full border-2 border-bone/60 px-5 font-display text-xl font-bold text-bone transition hover:border-bone disabled:opacity-35"
                >
                  Discard{picked.length === 1 ? ` ${cardLabel(picked[0])}` : ""}
                </button>
              </>
            )}
          </div>
          <Hand hand={hand} wide={wide} selected={selected} ready={ready} mustPlayId={legal.mustPlayId} selectable={playing} onToggle={toggle} />
          <Nameplate player={focus} view={view} you={focus.id === view.viewerId} disconnected={!!connectedIds && !connectedIds.has(focus.id)} />
        </div>
      )}
    </section>
  );
}

function Hand({
  hand,
  wide,
  selected,
  ready,
  mustPlayId,
  selectable,
  onToggle,
}: {
  hand: Card[];
  wide: boolean;
  selected: string[];
  ready: Set<string>;
  mustPlayId: string | null;
  selectable: boolean;
  onToggle: (id: string) => void;
}) {
  // Overlap more as the hand grows, so it stays on one line.
  const size = wide ? "lg" : "md";
  const step = wide ? (hand.length > 14 ? -46 : -36) : hand.length > 10 ? -34 : -26;
  return (
    <ul aria-label="Your hand" className="flex max-w-full flex-wrap justify-center pt-5 pl-10">
      {hand.map((c) => {
        const on = selected.includes(c.id);
        return (
          <li key={c.id} style={{ marginLeft: step }} className="relative">
            <motion.button
              layoutId={cardKey(c)}
              onClick={() => onToggle(c.id)}
              disabled={!selectable}
              aria-pressed={selectable ? on : undefined}
              aria-label={`${cardName(c, true)}${ready.has(c.id) ? ", part of a meld you can make" : ""}${c.id === mustPlayId ? ", must be played this turn" : ""}`}
              animate={{ y: on ? -18 : 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className={clsx("relative block rounded-xl", on && "ring-3 ring-bone", c.id === mustPlayId && "ring-3 ring-brass-lit")}
            >
              <PlayingCard card={c} size={size} entrance={false} />
            </motion.button>
            {ready.has(c.id) && <span aria-hidden className="absolute -bottom-2 left-1/2 h-1.5 w-6 -translate-x-1/2 rounded-full bg-brass-lit" />}
          </li>
        );
      })}
    </ul>
  );
}

/** Stock and discard pile. Rummy 500 fans the whole discard pile out. */
function Piles({ view, legal, actingId, onAction }: { view: RummyView; legal: RummyLegal | null; actingId: string | null; onAction: (a: RummyAction) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const drawing = !!legal?.mustDraw;
  const deep = view.settings.variant === "rummy500";
  const top = view.discard.length - 1;
  const glow = "ring-3 ring-brass-lit shadow-[0_0_18px_rgba(214,182,127,0.6)] hover:-translate-y-0.5";

  return (
    <div className="flex items-end gap-5">
      <div className="flex flex-col items-center gap-1.5">
        <button
          onClick={() => onAction({ type: "DRAW_STOCK", playerId: actingId! })}
          disabled={!drawing}
          aria-label={`Draw from the stock, ${view.stockCount} cards`}
          className={clsx("relative h-20 w-14 shrink-0 rounded-lg transition", drawing && glow)}
        >
          <span className="card-back absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-lg ring-1 ring-black/40" />
          <span className="card-back absolute inset-0 rounded-lg shadow-md ring-1 ring-black/40" />
        </button>
        <span className="text-xs text-bone tabular-nums">Stock {view.stockCount}</span>
      </div>

      <div className="flex min-w-14 flex-col items-center gap-1.5">
        {deep ? (
          // Every discard, oldest first. Taking one takes everything to its right too.
          <ul aria-label="Discard pile" className="flex max-w-[min(32rem,70vw)] overflow-x-auto pt-1 pr-1 pb-2 pl-6" onMouseLeave={() => setHover(null)}>
            {view.discard.map((c, i) => {
              const can = drawing && legal!.takeable.includes(i);
              const lifted = hover !== null && i >= hover;
              return (
                <li key={c.id} className="-ml-6 shrink-0">
                  <motion.button
                    layoutId={cardKey(c)}
                    onClick={() => onAction({ type: "DRAW_DISCARD", playerId: actingId!, index: i })}
                    onMouseEnter={() => can && setHover(i)}
                    onFocus={() => can && setHover(i)}
                    disabled={!can}
                    aria-label={`${cardName(c, true)}${can ? `. Take it${i < top ? ` and the ${top - i} above it` : ""}` : ""}`}
                    animate={{ y: lifted ? -10 : 0 }}
                    className={clsx("block rounded-lg", can && "ring-2 ring-brass-lit", lifted && "shadow-[0_0_16px_rgba(214,182,127,0.7)]")}
                  >
                    <PlayingCard card={c} size="md" entrance={false} />
                  </motion.button>
                </li>
              );
            })}
          </ul>
        ) : (
          <button
            onClick={() => onAction({ type: "DRAW_DISCARD", playerId: actingId!, index: top })}
            disabled={!drawing || !legal!.takeable.includes(top)}
            aria-label={view.discard[top] ? `Take the ${cardName(view.discard[top], true)}` : "Discard pile, empty"}
            className={clsx("relative h-20 w-14 rounded-lg border border-dashed border-bone/30 transition", drawing && legal!.takeable.includes(top) && glow)}
          >
            {view.discard[top] && (
              <motion.span key={view.discard[top].id} layoutId={cardKey(view.discard[top])} className="absolute inset-0">
                <PlayingCard card={view.discard[top]} size="md" entrance={false} />
              </motion.span>
            )}
          </button>
        )}
        <span className="text-xs text-bone">
          {deep && hover !== null && hover < top ? `Takes ${top - hover + 1} cards` : "Discard pile"}
        </span>
      </div>
    </div>
  );
}

/** Everyone's sets and runs. A meld your selected cards fit lights up. */
function Melds({ view, targets, onLayOff }: { view: RummyView; targets: string[]; onLayOff: (meldId: string) => void }) {
  if (view.melds.length === 0) {
    return <div className="grid min-h-24 min-w-64 flex-1 place-items-center rounded-3xl border border-dashed border-bone/25 px-6 text-sm text-bone">Melds</div>;
  }
  return (
    <ul aria-label="Melds on the table" className="flex min-w-0 flex-1 flex-wrap content-start justify-center gap-x-5 gap-y-4 lg:justify-start">
      {view.melds.map((m: Meld) => {
        const target = targets.includes(m.id);
        return (
          <li key={m.id}>
            <button
              onClick={() => onLayOff(m.id)}
              disabled={!target}
              aria-label={`${m.kind === "set" ? "Set" : "Run"}: ${m.cards.map(cardLabel).join(" ")}${target ? ". Lay off here" : ""}`}
              className={clsx("relative flex rounded-xl p-1.5 pl-6 transition", target ? "bg-black/25 ring-3 ring-brass-lit hover:-translate-y-0.5" : "bg-black/15")}
            >
              {m.cards.map((c) => (
                <motion.span key={c.id} layoutId={cardKey(c)} className="-ml-5 block">
                  <PlayingCard card={c} size="sm" entrance={false} />
                </motion.span>
              ))}
              {target && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brass-lit px-2 text-xs font-bold whitespace-nowrap text-smoke shadow">+ Lay off here</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Opponent({ player: p, view, disconnected }: { player: RummyPublicPlayer; view: RummyView; disconnected: boolean }) {
  const shown = Math.min(p.handCount, 10);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex h-14 items-end pl-6" aria-hidden>
        {Array.from({ length: shown }, (_, i) => (
          <div key={i} className="-ml-6">
            <PlayingCard card={null} faceUp={false} size="sm" entrance={false} />
          </div>
        ))}
      </div>
      <Nameplate player={p} view={view} you={false} disconnected={disconnected} />
    </div>
  );
}

function Nameplate({ player: p, view, you, disconnected }: { player: RummyPublicPlayer; view: RummyView; you: boolean; disconnected: boolean }) {
  const isTurn = view.phase === "playing" && view.currentTurnId === p.id;
  return (
    <div className={clsx("flex min-w-28 flex-col items-center rounded-2xl px-3 py-1.5", isTurn ? "bg-leather-lit ring-2 ring-brass-lit" : "bg-leather")}>
      <div className="flex max-w-40 items-baseline gap-1.5">
        <span data-seat-of={p.id} className={clsx("truncate text-base font-bold", isTurn ? "text-bone" : "text-parchment")}>{p.name}</span>
        {you && <span className="text-xs text-brass-lit">you</span>}
        {p.isBot && <span className="text-xs text-brass-lit">{DIFFICULTY_LABEL[p.botDifficulty ?? "medium"]}</span>}
      </div>
      <span className="text-xs text-parchment tabular-nums">
        {chips(p.score)} pts · {p.handCount} {p.handCount === 1 ? "card" : "cards"}
      </span>
      {isTurn && p.isBot && <span className="text-xs font-bold text-brass-lit">Thinking…</span>}
      {disconnected && <span className="text-xs text-parchment">Reconnecting…</span>}
    </div>
  );
}
