"use client";

/**
 * Shuffle-and-deal animation. Purely visual: the new hand already exists in state; every
 * screen replays the deal when a new round arrives — the deck riffles, then each card flies
 * from the deck to its seat, the burn pile, or the table, in real dealing order.
 */
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { BsPokerView } from "@/lib/bs-poker-game";
import { burnSlot, planDeal, type DealPlan } from "@/lib/deal-plan";
import { PlayingCard } from "@/components/ui/PlayingCard";

const SHUFFLE_MS = 1300;
const FLIGHT_MS = 420;
/** The whole deal (after the shuffle) takes about this long, however many cards there are. */
const DEAL_BUDGET_MS = 2600;

export interface DealClock {
  round: number;
  /** ms timestamp the shuffle began; -Infinity when there's nothing to animate. */
  startedAt: number;
  shuffleMs: number;
  staggerMs: number;
  flightMs: number;
  plan: DealPlan;
  /** When the last card lands. */
  endsAt: number;
}

const DealContext = createContext<DealClock | null>(null);
export const DealProvider = DealContext.Provider;
export const useDeal = () => useContext(DealContext);

/**
 * Starts a deal whenever a new round shows up. Opening a table mid-round (a refresh, or
 * joining late) skips the animation once bidding has begun.
 */
export function useDealClock(view: BsPokerView): DealClock {
  const reduceMotion = useReducedMotion();
  const tracked = useRef<{ round: number; startedAt: number } | null>(null);

  // Decided during render so the new cards mount already knowing they should fly in.
  if (view.phase === "bidding" && tracked.current?.round !== view.round) {
    const fresh = tracked.current !== null || view.bidHistory.length === 0;
    tracked.current = { round: view.round, startedAt: fresh && !reduceMotion ? Date.now() : -Infinity };
  }
  const startedAt = tracked.current?.startedAt ?? -Infinity;

  const plan = useMemo(
    () => planDeal(view.players, view.roundStarterId),
    // Only the deal's shape matters, and it's fixed for the round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view.round, view.roundStarterId],
  );
  const staggerMs = Math.min(150, Math.max(70, DEAL_BUDGET_MS / Math.max(plan.count, 1)));
  return {
    round: view.round,
    startedAt,
    shuffleMs: SHUFFLE_MS,
    staggerMs,
    flightMs: FLIGHT_MS,
    plan,
    endsAt: startedAt + SHUFFLE_MS + Math.max(plan.count - 1, 0) * staggerMs + FLIGHT_MS,
  };
}

/** The deck pile the cards fly out of. On-screen layouts each have one; the visible one wins. */
function findDeck(): DOMRect | null {
  for (const el of document.querySelectorAll("[data-deck]")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0) return r;
  }
  return null;
}

type CardProps = React.ComponentProps<typeof PlayingCard>;

/** A card that, during a deal, leaves the deck at its turn and flies to where it's rendered. */
export function DealtCard({ slot, ...card }: CardProps & { slot: string }) {
  const clock = useDeal();
  const ref = useRef<HTMLDivElement>(null);
  const [mountedAt] = useState(() => Date.now());
  const index = clock?.plan.order.get(slot);
  const leavesAt = clock && index !== undefined ? clock.startedAt + clock.shuffleMs + index * clock.staggerMs : -Infinity;
  const flying = !!clock && mountedAt < leavesAt + clock.flightMs;
  const [from, setFrom] = useState<{ x: number; y: number; scale: number } | "skip" | null>(null);

  // Measure before paint, so the card never flashes at its final spot first.
  useLayoutEffect(() => {
    if (!flying) return;
    const me = ref.current?.getBoundingClientRect();
    const deck = findDeck();
    if (!me || me.width === 0 || !deck) return setFrom("skip");
    setFrom({
      x: deck.left + deck.width / 2 - (me.left + me.width / 2),
      y: deck.top + deck.height / 2 - (me.top + me.height / 2),
      scale: deck.width / me.width,
    });
  }, [flying]);

  if (!flying || from === "skip") return <PlayingCard {...card} />;

  const delay = Math.max(0, leavesAt - mountedAt) / 1000;
  const flight = clock!.flightMs / 1000;
  const turnsFaceUp = (card.faceUp ?? true) && card.card !== null;
  return (
    <div ref={ref} style={{ visibility: from ? "visible" : "hidden" }}>
      {from ? (
        <motion.div
          className="relative z-40"
          initial={{ x: from.x, y: from.y, scale: from.scale, rotate: -10, opacity: 0 }}
          animate={{ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }}
          transition={{ delay, duration: flight, ease: [0.2, 0.75, 0.25, 1], opacity: { delay, duration: 0.01 } }}
        >
          <PlayingCard {...card} entrance={false} startFaceDown={turnsFaceUp} revealDelay={delay + flight} />
        </motion.div>
      ) : (
        <PlayingCard {...card} entrance={false} />
      )}
    </div>
  );
}

/** The deck. It riffles while the dealer shuffles. */
export function DeckPile() {
  const clock = useDeal();
  const now = Date.now();
  const shuffleLeft = clock ? clock.startedAt + clock.shuffleMs - now : 0;
  const shuffling = shuffleLeft > 0;
  const riffle = (dir: 1 | -1) => ({
    initial: { x: 0, rotate: 0 },
    animate: { x: [0, 26 * dir, 0, 26 * dir, 0], rotate: [0, 9 * dir, 0, 9 * dir, 0], y: [0, -3, 0, -3, 0] },
    transition: { duration: Math.min(shuffleLeft, clock?.shuffleMs ?? 0) / 1000, ease: "easeInOut" as const },
  });

  return (
    <div className="flex flex-col items-center gap-1">
      <div data-deck className="relative h-14 w-10" role="img" aria-label={shuffling ? "Deck, shuffling" : "Deck"}>
        {/* Thickness of the deck. */}
        <Back className="absolute top-1 left-1" />
        <Back className="absolute top-0.5 left-0.5" />
        {shuffling ? (
          <>
            <motion.div key={`l-${clock!.startedAt}`} className="absolute inset-0" {...riffle(-1)}>
              <Back />
            </motion.div>
            <motion.div key={`r-${clock!.startedAt}`} className="absolute inset-0" {...riffle(1)}>
              <Back />
            </motion.div>
          </>
        ) : (
          <Back className="absolute inset-0" />
        )}
      </div>
      <span className="text-xs text-bone">Deck</span>
    </div>
  );
}

const BURN_TILT = [-9, 6, -2];

/** Burned cards, face down and slightly askew, like a real burn pile. */
export function BurnPile({ count, round }: { count: number; round: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-14 w-10" role="img" aria-label={`Burn pile, ${count} ${count === 1 ? "card" : "cards"}`}>
        {count === 0 && <div className="absolute inset-0 rounded-md border border-dashed border-bone/30" />}
        {Array.from({ length: count }, (_, i) => (
          // Keyed by round: each hand's burns are new cards, dealt fresh.
          <div key={`${round}-${i}`} className="absolute inset-0" style={{ transform: `rotate(${BURN_TILT[i % BURN_TILT.length]}deg)` }}>
            <DealtCard slot={burnSlot(i)} card={null} faceUp={false} size="sm" />
          </div>
        ))}
      </div>
      <span className="text-xs text-bone">Burn</span>
    </div>
  );
}

function Back({ className }: { className?: string }) {
  return (
    <div className={`card-back h-14 w-10 rounded-md shadow-md ring-1 ring-black/40 ${className ?? ""}`}>
      <div className="absolute inset-1 rounded-[inherit] border border-bone/25" />
    </div>
  );
}
