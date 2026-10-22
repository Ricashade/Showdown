"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { BsPokerView, PublicPlayer } from "@/lib/bs-poker-game";
import { bidLabel } from "@/lib/bs-poker-engine";
import { isWildCard } from "@/lib/bs-poker-engine";
import { tableSlot } from "@/lib/deal-plan";
import { BurnPile, DealtCard, DeckPile } from "@/components/table/deal";
import { PlayerSeat, wildLabel, type SeatHighlights } from "./PlayerSeat";

interface GameTableProps {
  view: BsPokerView;
  highlights: SeatHighlights | null;
  /** Online play: who is currently connected. */
  connectedIds?: Set<string>;
}

/** Rotate seats so the viewer sits at the bottom of the table. */
function seatOrder(players: PublicPlayer[], anchorId: string | null): PublicPlayer[] {
  const i = Math.max(0, players.findIndex((p) => p.id === anchorId));
  return [...players.slice(i), ...players.slice(0, i)];
}

export function GameTable({ view, highlights, connectedIds }: GameTableProps) {
  const ordered = seatOrder(view.players, view.viewerId);
  const revealing = view.phase !== "bidding";

  const seat = (p: PublicPlayer, size: "sm" | "md") => (
    <PlayerSeat
      player={p}
      round={view.round}
      settings={view.settings}
      isTurn={view.currentTurnPlayerId === p.id}
      isViewer={view.viewerId === p.id}
      highlights={highlights}
      dimUnmatched={revealing}
      cardSize={size}
      disconnected={!!connectedIds && !connectedIds.has(p.id)}
    />
  );

  return (
    <section aria-label="Table">
      {/* Desktop: seats sit on the rail of an oval table. */}
      <div className="relative mx-auto hidden h-[640px] w-full max-w-5xl md:block">
        <div className="felt absolute inset-x-[5%] inset-y-[9%] rounded-[50%]" />
        <div className="absolute inset-x-[22%] inset-y-[27%] flex items-center justify-center">
          <TableCenter view={view} highlights={highlights} />
        </div>
        <ul>
          {ordered.map((p, i) => {
            const angle = Math.PI / 2 + (i * 2 * Math.PI) / ordered.length;
            const x = 50 + 45 * Math.cos(angle);
            const y = 50 + 41 * Math.sin(angle);
            return (
              <li
                key={p.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${x}%`, top: `${y}%`, zIndex: i === 0 ? 20 : 10 }}
              >
                {seat(p, i === 0 && view.viewerId ? "md" : "sm")}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Phone: the felt holds the bid; seats line up below it. */}
      <div className="space-y-6 md:hidden">
        <div className="felt mx-8 rounded-[2rem] px-5 py-8">
          <TableCenter view={view} highlights={highlights} />
        </div>
        <ul className="flex flex-wrap justify-center gap-x-3 gap-y-5">
          {ordered.map((p) => (
            <li key={p.id}>{seat(p, "sm")}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The dealer's spot: deck, the 5 shared face-up cards, and the burn pile. */
function TableCards({ view, highlights }: { view: BsPokerView; highlights: SeatHighlights | null }) {
  if (view.tableCards.length === 0) return null;
  const dim = !!highlights && highlights.cardIds.size > 0;
  return (
    <div className="grid grid-cols-2 items-start justify-items-center gap-x-6 gap-y-3 sm:flex sm:gap-4">
      <div className="justify-self-end sm:order-1">
        <DeckPile />
      </div>
      <ul aria-label="Table cards" className="col-span-2 row-start-1 flex gap-1.5 sm:order-2">
      {view.tableCards.map((c, i) => {
        const hit = highlights?.cardIds.has(c.id);
        const wild = highlights?.wilds.get(c.id);
        return (
          <li key={`${view.round}-${c.id}`}>
            <DealtCard
              slot={tableSlot(i)}
              card={c}
              size="sm"
              isWild={isWildCard(c, view.settings)}
              highlight={hit ? highlights!.kind : null}
              wildAs={wild ? wildLabel(wild) : undefined}
              dimmed={dim && !hit}
              dealDelay={0.15 + i * 0.07}
            />
          </li>
        );
      })}
      </ul>
      <div className="justify-self-start sm:order-3">
        <BurnPile count={view.burnCount} round={view.round} />
      </div>
    </div>
  );
}

function TableCenter({ view, highlights }: { view: BsPokerView; highlights: SeatHighlights | null }) {
  const bid = view.currentBid;
  const name = (id: string | null | undefined) => view.players.find((p) => p.id === id)?.name ?? "";
  const earlier = view.bidHistory.slice(0, -1).slice(-3).reverse();

  return (
    <div className="flex w-full flex-col items-center text-center">
      <p className="mb-2 text-sm text-bone">Round {view.round}</p>
      <TableCards view={view} highlights={highlights} />
      <AnimatePresence mode="wait" initial={false}>
        {bid ? (
          <motion.div
            key={view.bidHistory.length}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-3"
          >
            <p className="font-display text-5xl leading-none font-extrabold text-bone drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] lg:text-6xl">
              {bidLabel(bid.bid)}
            </p>
            <p className="mt-2 text-base text-bone">
              bid by {name(bid.playerId)}
            </p>
          </motion.div>
        ) : (
          <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3">
            <p className="font-display text-5xl leading-none font-extrabold text-bone">No bids yet</p>
          </motion.div>
        )}
      </AnimatePresence>

      {earlier.length > 0 && view.phase === "bidding" && (
        <ol aria-label="Earlier bids this round" className="mt-4 space-y-0.5 text-sm text-bone">
          {earlier.map((e, i) => (
            <li key={view.bidHistory.length - 1 - i}>
              {name(e.playerId)}: {bidLabel(e.bid)}
            </li>
          ))}
        </ol>
      )}

    </div>
  );
}
