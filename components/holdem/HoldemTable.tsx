"use client";

import clsx from "clsx";
import type { HoldemMove } from "@/types/holdem";
import { nextBlindRise, type HoldemPublicPlayer, type HoldemView } from "@/lib/holdem-game";
import { buildPots } from "@/lib/holdem-pots";
import { handSlot, tableSlot } from "@/lib/deal-plan";
import { BurnPile, DealtCard, DeckPile } from "@/components/table/deal";
import { DIFFICULTY_LABEL } from "@/lib/bot-ai";

const chips = (n: number) => n.toLocaleString("en-US");

const MOVE_LABEL: Partial<Record<HoldemMove, string>> = {
  fold: "Fold",
  check: "Check",
  call: "Call",
  bet: "Bet",
  raise: "Raise",
  all_in: "All in",
};

interface HoldemTableProps {
  view: HoldemView;
  /** Cards that make the winning hands, highlighted after a showdown. */
  winningCardIds: Set<string>;
  connectedIds?: Set<string>;
}

function seatOrder(players: HoldemPublicPlayer[], anchorId: string | null) {
  const i = Math.max(0, players.findIndex((p) => p.id === anchorId));
  return [...players.slice(i), ...players.slice(0, i)];
}

export function HoldemTable({ view, winningCardIds, connectedIds }: HoldemTableProps) {
  const ordered = seatOrder(view.players, view.viewerId);
  const seat = (p: HoldemPublicPlayer, size: "sm" | "md", showBet: boolean) => (
    <Seat
      player={p}
      view={view}
      size={size}
      showBet={showBet}
      winningCardIds={winningCardIds}
      disconnected={!!connectedIds && !connectedIds.has(p.id)}
    />
  );

  return (
    <section aria-label="Table">
      {/* Desktop: oval table, bets pushed out in front of each seat. */}
      <div className="relative mx-auto hidden h-[640px] w-full max-w-5xl md:block">
        <div className="felt absolute inset-x-[5%] inset-y-[9%] rounded-[50%]" />
        <div className="absolute inset-x-[24%] inset-y-[30%] flex items-center justify-center">
          <Center view={view} winningCardIds={winningCardIds} />
        </div>
        <ul>
          {ordered.map((p, i) => {
            const angle = Math.PI / 2 + (i * 2 * Math.PI) / ordered.length;
            const at = (rx: number, ry: number) => ({ left: `${50 + rx * Math.cos(angle)}%`, top: `${50 + ry * Math.sin(angle)}%` });
            return (
              <li key={p.id}>
                <div className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ ...at(45, 41), zIndex: i === 0 ? 20 : 10 }}>
                  {seat(p, i === 0 && view.viewerId ? "md" : "sm", false)}
                </div>
                {p.bet > 0 && (
                  <div className="absolute -translate-x-1/2 -translate-y-1/2" style={at(31, 24)}>
                    <BetChips amount={p.bet} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Phone: the felt holds the board; seats line up below with their bets. */}
      <div className="space-y-6 md:hidden">
        <div className="felt mx-8 rounded-[2rem] px-4 py-7">
          <Center view={view} winningCardIds={winningCardIds} />
        </div>
        <ul className="flex flex-wrap justify-center gap-x-3 gap-y-5">
          {ordered.map((p) => (
            <li key={p.id}>{seat(p, "sm", true)}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Seat({
  player: p,
  view,
  size,
  showBet,
  winningCardIds,
  disconnected,
}: {
  player: HoldemPublicPlayer;
  view: HoldemView;
  size: "sm" | "md";
  showBet: boolean;
  winningCardIds: Set<string>;
  disconnected: boolean;
}) {
  const isTurn = view.currentTurnId === p.id;
  const isViewer = view.viewerId === p.id;
  const busted = p.status === "busted";
  const won = view.result?.won[p.id];
  const move = view.lastActions[p.id]?.move;
  const tag = move ? MOVE_LABEL[move] : undefined;
  const handOver = view.phase !== "betting";
  const overlap = size === "md" ? "-ml-4" : "-ml-3";

  return (
    <div className={clsx("relative flex w-max flex-col items-center gap-1.5", (busted || p.folded) && "opacity-50")}>
      <div className="flex min-h-14 items-end">
        {busted ? (
          <span className="text-sm text-ash">Out</span>
        ) : !p.inHand || p.folded ? null : p.hand ? (
          p.hand.map((c, i) => (
            <div key={`${view.handNumber}-${c.id}`} className={clsx(i > 0 && overlap)}>
              <DealtCard
                slot={handSlot(p.id, i)}
                card={c}
                size={size}
                highlight={handOver && winningCardIds.has(c.id) ? "match" : null}
                dimmed={handOver && winningCardIds.size > 0 && !winningCardIds.has(c.id)}
              />
            </div>
          ))
        ) : (
          [0, 1].map((i) => (
            <div key={`${view.handNumber}-back-${i}`} className={clsx(i > 0 && overlap)}>
              <DealtCard slot={handSlot(p.id, i)} card={null} faceUp={false} size={size} />
            </div>
          ))
        )}
      </div>

      <div
        className={clsx(
          "relative flex min-w-24 flex-col items-center rounded-2xl px-3 py-1.5",
          isTurn ? "bg-leather-lit ring-2 ring-brass-lit" : won ? "bg-leather ring-2 ring-brass-lit" : "bg-leather",
        )}
      >
        {view.buttonId === p.id && !busted && (
          <span
            aria-label="Dealer"
            className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-bone font-display text-sm font-extrabold text-smoke shadow"
          >
            D
          </span>
        )}
        <div className="flex max-w-36 items-baseline gap-1.5">
          <span className={clsx("truncate text-base font-bold", isTurn ? "text-bone" : "text-parchment")}>{p.name}</span>
          {isViewer && <span className="text-xs text-brass-lit">you</span>}
          {p.isBot && <span className="text-xs text-brass-lit">{DIFFICULTY_LABEL[p.botDifficulty ?? "medium"]}</span>}
        </div>
        {!busted && <span className="font-display text-lg leading-tight font-bold text-brass-lit tabular-nums">{chips(p.chips)}</span>}
        {isTurn && p.isBot && <span className="text-xs font-bold text-brass-lit">Thinking…</span>}
        {disconnected && !busted && <span className="text-xs text-parchment">Reconnecting…</span>}
      </div>

      {won ? (
        <span className="text-sm font-bold text-brass-lit">+{chips(won)}</span>
      ) : tag && !busted ? (
        <span className={clsx("text-xs font-bold", move === "all_in" ? "text-bone" : "text-parchment")}>{tag}</span>
      ) : null}
      {showBet && p.bet > 0 && <BetChips amount={p.bet} />}
    </div>
  );
}

/** A small stack of chips with the amount, in front of a seat. */
function BetChips({ amount }: { amount: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-black/35 py-0.5 pr-2.5 pl-1" aria-label={`Bet ${chips(amount)}`}>
      <span aria-hidden className="relative h-4 w-4">
        <span className="absolute inset-0 translate-y-0.5 rounded-full bg-brass-deep" />
        <span className="absolute inset-0 rounded-full border-2 border-dashed border-bone/80 bg-brass" />
      </span>
      <span className="text-sm font-bold text-bone tabular-nums">{chips(amount)}</span>
    </div>
  );
}

function Center({ view, winningCardIds }: { view: HoldemView; winningCardIds: Set<string> }) {
  const handOver = view.phase !== "betting";
  // What's already in the middle: everything bet on earlier streets.
  const settled = view.players.filter((p) => p.inHand).map((p) => ({ id: p.id, amount: p.totalBet - p.bet, folded: p.folded }));
  const { pots } = buildPots(settled);
  const middle = settled.reduce((n, c) => n + c.amount, 0);
  const rise = nextBlindRise(view.settings, view.handNumber);

  return (
    <div className="flex w-full flex-col items-center gap-4 text-center">
      <div className="grid grid-cols-2 items-start justify-items-center gap-x-6 gap-y-3 sm:flex sm:gap-4">
        <div className="justify-self-end sm:order-1">
          <DeckPile />
        </div>
        <ul aria-label="Board" className="col-span-2 row-start-1 flex gap-1.5 sm:order-2">
          {Array.from({ length: 5 }, (_, i) => {
            const c = view.board[i];
            return (
              <li key={c ? `${view.handNumber}-${c.id}` : `empty-${i}`}>
                {c ? (
                  <DealtCard
                    slot={tableSlot(i)}
                    card={c}
                    size="sm"
                    highlight={handOver && winningCardIds.has(c.id) ? "match" : null}
                    dimmed={handOver && winningCardIds.size > 0 && !winningCardIds.has(c.id)}
                  />
                ) : (
                  <div className="h-14 w-10 rounded-md border border-dashed border-bone/25" />
                )}
              </li>
            );
          })}
        </ul>
        <div className="justify-self-start sm:order-3">
          <BurnPile count={view.burnCount} round={view.handNumber} />
        </div>
      </div>

      {!handOver && middle > 0 && (
        <div className="space-y-0.5">
          {pots.length <= 1 ? (
            <p className="font-display text-3xl font-extrabold text-bone tabular-nums">Pot {chips(middle)}</p>
          ) : (
            pots.map((pot, i) => (
              <p key={i} className={clsx("font-display font-extrabold text-bone tabular-nums", i === 0 ? "text-3xl" : "text-xl")}>
                {i === 0 ? "Main pot" : "Side pot"} {chips(pot.amount)}
              </p>
            ))
          )}
        </div>
      )}

      <p className="text-sm text-bone">
        Blinds {chips(view.smallBlind)}/{chips(view.bigBlind)}
        {rise && `, ${chips(rise.small)}/${chips(rise.big)} in ${rise.handsLeft} ${rise.handsLeft === 1 ? "hand" : "hands"}`}
      </p>
    </div>
  );
}
