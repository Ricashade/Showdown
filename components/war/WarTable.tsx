"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import type { Card } from "@/types/cards";
import type { WarPublicSide, WarView } from "@/lib/war-engine";
import { DIFFICULTY_LABEL } from "@/lib/bot-ai";
import { PlayingCard } from "@/components/ui/PlayingCard";

export type WarSpeed = "normal" | "fast" | "turbo";
/** How long a card takes to fly in, by speed. */
const FLY: Record<WarSpeed, number> = { normal: 0.35, fast: 0.2, turbo: 0.1 };

interface WarTableProps {
  view: WarView;
  /** The side shown on the left (you, if you're playing). */
  leftId: string;
  speed: WarSpeed;
  connectedIds?: Set<string>;
}

/** Cards held, as a tug of war across the whole deck. */
export function TugOfWar({ view, leftId }: { view: WarView; leftId: string }) {
  const [l, r] = orderSides(view, leftId);
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? "";
  const total = l.count + r.count || 1;
  const share = (l.count / total) * 100;
  return (
    <div className="mx-4 flex items-center gap-3" role="img" aria-label={`${name(l.id)} ${l.count} cards, ${name(r.id)} ${r.count} cards`}>
      <span className="w-28 truncate text-right text-sm font-bold text-bone sm:w-36">
        {name(l.id)} <span className="font-display text-xl text-brass-lit tabular-nums">{l.count}</span>
      </span>
      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-leather">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-brass" animate={{ width: `${share}%` }} transition={{ type: "spring", stiffness: 200, damping: 30 }} />
        <motion.div
          aria-hidden
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bone shadow"
          animate={{ left: `${share}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 30 }}
        />
      </div>
      <span className="w-28 truncate text-sm font-bold text-bone sm:w-36">
        <span className="font-display text-xl text-parchment tabular-nums">{r.count}</span> {name(r.id)}
      </span>
    </div>
  );
}

const orderSides = (view: WarView, leftId: string): [WarPublicSide, WarPublicSide] => {
  const [a, b] = view.sides!;
  return a.id === leftId ? [a, b] : [b, a];
};

export function WarTable({ view, leftId, speed, connectedIds }: WarTableProps) {
  const [left, right] = orderSides(view, leftId);
  const atWar = view.stage === "war";
  const potNow = Object.values(view.table).flat().length;
  // A War puts down the bounty plus one more card on each side.
  const atStake = potNow + 2 * (view.settings.bounty + 1);
  // On the table: the War in progress, or else the last battle (bounties turned up).
  type Shown = { card: Card | null; bounty: boolean };
  const showing: Record<string, Shown[]> = atWar
    ? Object.fromEntries(Object.entries(view.table).map(([id, list]) => [id, list.map((card) => ({ card, bounty: card === null }))]))
    : view.last
      ? Object.fromEntries(Object.entries(view.last.laid).map(([id, list]) => [id, list.map((l) => ({ card: l.card, bounty: !!l.bounty }))]))
      : {};
  const settled = !atWar && !!view.last;
  // The same battle keeps the same number from War to settled, so its cards stay put and flip over.
  const round = atWar ? view.battles + 1 : (view.last?.number ?? 0);

  return (
    <section aria-label="Table" className="felt relative mx-4 overflow-hidden rounded-[2.5rem] px-4 py-8 sm:px-8">
      <motion.div
        key={atWar ? `war-${view.wars}` : "calm"}
        // A small shake when a War breaks out.
        animate={atWar ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
        transition={{ duration: 0.45 }}
        className="grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-6"
      >
        <Deck side={left} view={view} disconnected={!!connectedIds && !connectedIds.has(left.id)} />
        <div className="flex min-h-48 items-center justify-center gap-3 sm:gap-8">
          <Stack round={round} cards={showing[left.id] ?? []} from="left" speed={speed} won={settled && view.last!.winnerId === left.id} />
          <Stack round={round} cards={showing[right.id] ?? []} from="right" speed={speed} won={settled && view.last!.winnerId === right.id} />
        </div>
        <Deck side={right} view={view} disconnected={!!connectedIds && !connectedIds.has(right.id)} />
      </motion.div>

      <div className="mt-4 flex min-h-12 items-center justify-center" aria-live="polite">
        <AnimatePresence mode="wait">
          {atWar ? (
            <motion.p
              key={`war-${view.wars}`}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 18 }}
              className="rounded-full bg-chip px-6 py-1.5 font-display text-3xl font-extrabold text-bone shadow-[0_0_30px_rgba(200,16,46,0.6)]"
            >
              {view.wars > 1 ? `${view.wars === 2 ? "Double" : "Triple"} WAR!` : "WAR!"} {atStake} cards at stake
            </motion.p>
          ) : settled ? (
            <motion.p key={`won-${view.last!.number}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-center font-display text-2xl font-bold text-bone">
              {view.players.find((p) => p.id === view.last!.winnerId)?.name} takes {view.last!.cards}
              {view.last!.wars > 0 && <span className="ml-2 text-lg text-brass-lit">Bounty revealed</span>}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}

/** One side's cards in the battle zone: the battle card, then any War bounty and decider. */
function Stack({
  round,
  cards,
  from,
  speed,
  won,
}: {
  round: number;
  cards: { card: Card | null; bounty: boolean }[];
  from: "left" | "right";
  speed: WarSpeed;
  won: boolean;
}) {
  const dx = from === "left" ? -140 : 140;
  return (
    <div className={clsx("relative flex min-h-28 min-w-20 items-center rounded-2xl p-2 transition", won && "bg-black/20 ring-2 ring-brass-lit")}>
      {cards.length === 0 && <div className="h-28 w-20 rounded-xl border border-dashed border-bone/25" />}
      {cards.map(({ card: c, bounty }, i) => {
        // War bounty (face down, or turned up once it's settled) tucks in tight and sits a little higher.
        return (
          <motion.div
            key={`${round}-${i}`}
            initial={{ x: dx, opacity: 0, rotate: from === "left" ? -12 : 12 }}
            animate={{ x: 0, opacity: 1, rotate: 0 }}
            transition={{ duration: FLY[speed], delay: Math.min(i, 5) * FLY[speed] * 0.5 }}
            className={clsx(i > 0 && (bounty ? "-ml-14" : "-ml-6"), bounty && "-translate-y-2")}
          >
            <PlayingCard card={c} faceUp={c !== null} size="lg" entrance={false} />
          </motion.div>
        );
      })}
    </div>
  );
}

function Deck({ side, view, disconnected }: { side: WarPublicSide; view: WarView; disconnected: boolean }) {
  const p = view.players.find((x) => x.id === side.id);
  const tall = Math.min(6, Math.ceil(side.drawCount / 6));
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-28 w-20" role="img" aria-label={`${p?.name}'s deck, ${side.drawCount} cards`}>
        {side.drawCount === 0 ? (
          <div className="absolute inset-0 rounded-xl border border-dashed border-bone/30" />
        ) : (
          Array.from({ length: tall }, (_, i) => (
            <div key={i} className="card-back absolute inset-0 rounded-xl ring-1 ring-black/40" style={{ transform: `translate(${i * 1.5}px, ${-i * 1.5}px)` }} />
          ))
        )}
        {/* Flipped and waiting: the top card is lifted, ready to go. */}
        {side.ready && (
          <motion.div initial={{ y: 0 }} animate={{ y: -14 }} className="card-back absolute inset-0 rounded-xl shadow-[0_0_18px_rgba(214,182,127,0.7)] ring-2 ring-brass-lit">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-bone px-2 text-xs font-bold text-smoke shadow">Ready</span>
          </motion.div>
        )}
      </div>
      <div className="flex min-w-24 flex-col items-center rounded-2xl bg-leather px-3 py-1.5">
        <span data-seat-of={side.id} className="max-w-32 truncate text-sm font-bold text-bone">
          {p?.name}
          {side.id === view.viewerId && <span className="ml-1 text-xs font-normal text-brass-lit">you</span>}
        </span>
        {p?.isBot && <span className="text-xs text-brass-lit">{DIFFICULTY_LABEL[p.botDifficulty ?? "medium"]} bot</span>}
        <span className="text-xs text-parchment tabular-nums">
          {side.drawCount} in deck · {side.wonCount} won
        </span>
        {disconnected && <span className="text-xs text-parchment">Reconnecting…</span>}
      </div>
    </div>
  );
}
