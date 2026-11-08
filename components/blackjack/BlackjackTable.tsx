"use client";

import clsx from "clsx";
import type { BlackjackHand, HandOutcome } from "@/types/blackjack";
import type { Card } from "@/types/cards";
import { dealerShowing, handValue, isNatural, type BlackjackView } from "@/lib/blackjack-engine";
import { DIFFICULTY_LABEL } from "@/lib/bot-ai";
import { PlayingCard } from "@/components/ui/PlayingCard";

export const chips = (n: number) => n.toLocaleString("en-US");

/** Seconds between cards in the opening deal. */
const DEAL_STAGGER = 0.18;

type PublicPlayer = BlackjackView["players"][number];

const OUTCOME: Record<HandOutcome, string> = { blackjack: "Blackjack", win: "Win", push: "Push", lose: "Lose", bust: "Bust" };

/** "Soft 17", "21", "Bust"… for a hand's cards. */
export function totalLabel(cards: readonly Card[], natural = false): string {
  if (natural) return "Blackjack";
  const { total, soft } = handValue(cards);
  if (total > 21) return "Bust";
  return soft && total < 21 ? `Soft ${total}` : String(total);
}

interface BlackjackTableProps {
  view: BlackjackView;
  connectedIds?: Set<string>;
}

export function BlackjackTable({ view, connectedIds }: BlackjackTableProps) {
  const dealtIn = view.players.filter((p) => p.hands.length > 0);
  // Opening-deal order: one card round the table and the dealer, twice.
  const dealOrder = (seat: number, card: number) => (card * (dealtIn.length + 1) + seat) * DEAL_STAGGER;

  return (
    // On wider screens the felt takes the height the window leaves, and the dealer, the rules and the seats spread evenly in it.
    <section
      aria-label="Table"
      className="felt felt-line relative mx-4 rounded-t-[3rem] rounded-b-[45%_30%] px-4 pt-7 pb-14 sm:px-10 md:pb-12 md:flex md:h-[calc(100dvh-19.25rem)] md:min-h-fit md:flex-col md:justify-between"
    >
      <Dealer view={view} delayFor={(i) => (i < 2 ? dealOrder(dealtIn.length, i) : 0)} />

      <div aria-hidden className="mt-3 text-center font-display text-bone">
        <p className="text-2xl font-extrabold sm:text-3xl">Blackjack pays 3 to 2</p>
        <p className="text-sm font-bold sm:text-base">Dealer hits soft 17 · Insurance pays 2 to 1</p>
      </div>

      <ul className="mt-4 flex flex-wrap items-start justify-center gap-x-4 gap-y-8 sm:gap-x-6 md:mt-2">
        {view.players.map((p, i) => {
          const fromCenter = Math.abs(i - (view.players.length - 1) / 2) / Math.max(1, (view.players.length - 1) / 2);
          const seat = dealtIn.findIndex((x) => x.id === p.id);
          return (
            // Seats follow the curve of the rail: the ends sit higher than the middle.
            <li key={p.id} className="md:translate-y-[var(--arc)]" style={{ "--arc": `${-fromCenter * fromCenter * 36}px` } as React.CSSProperties}>
              <Seat
                player={p}
                view={view}
                delayFor={(card) => (card < 2 && seat >= 0 ? dealOrder(seat, card) : 0)}
                disconnected={!!connectedIds && !connectedIds.has(p.id)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Dealer({ view, delayFor }: { view: BlackjackView; delayFor: (card: number) => number }) {
  const cards = view.dealer.cards;
  const showing = dealerShowing(view);
  const revealed = view.dealer.holeRevealed;
  const label = cards.length === 0 ? null : revealed ? totalLabel(cards as Card[], view.result?.dealerBlackjack) : String(showing.total);
  const isDealerTurn = view.phase === "dealer";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex min-h-20 items-end" aria-label="Dealer's cards" role="group">
        {cards.length === 0 ? (
          <div className="h-20 w-14 rounded-lg border border-dashed border-bone/30" />
        ) : (
          cards.map((c, i) => (
            <div key={`${view.roundNumber}-d${i}`} className={clsx(i > 0 && "-ml-7")}>
              <PlayingCard card={c} faceUp={c !== null} size="md" dealDelay={delayFor(i)} />
            </div>
          ))
        )}
      </div>
      <div className={clsx("flex items-center gap-2 rounded-2xl px-4 py-1", isDealerTurn ? "bg-leather-lit ring-2 ring-brass-lit" : "bg-leather")}>
        <span className="text-base font-bold text-bone">Dealer</span>
        {label && (
          <span
            className={clsx(
              "font-display text-xl font-extrabold tabular-nums",
              label === "Bust" ? "text-chip-lit" : "text-brass-lit",
            )}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

function Seat({
  player: p,
  view,
  delayFor,
  disconnected,
}: {
  player: PublicPlayer;
  view: BlackjackView;
  delayFor: (card: number) => number;
  disconnected: boolean;
}) {
  const isViewer = view.viewerId === p.id;
  const isTurn = view.phase === "playing" && view.currentTurnId === p.id;
  const out = p.status === "busted";
  const net = view.phase === "settled" || view.phase === "game_over" ? view.result?.net[p.id] : undefined;
  const size = isViewer ? "md" : "sm";

  let status: string | null = null;
  if (view.phase === "betting" && !out) status = p.bet > 0 ? `Bet ${chips(p.bet)}` : p.isBot ? null : "No bet yet";
  if (view.phase === "insurance" && p.hands.length > 0) {
    status = p.insurance === null ? (p.isBot ? null : "Insurance?") : p.insurance > 0 ? `Insured ${chips(p.insurance)}` : "No insurance";
  }

  return (
    <div className={clsx("flex w-max flex-col items-center gap-2", out && "opacity-50")}>
      {/* Room for a hand is kept from the start, so the seats don't jump when the cards come out. */}
      <div className={clsx("flex items-end gap-3", size === "md" ? "min-h-36" : "min-h-30")}>
        {p.hands.map((hand, h) => (
            <Hand
              key={h}
              hand={hand}
              size={size}
              active={isTurn && view.currentHand === h}
              settled={view.phase === "settled" || view.phase === "game_over"}
              delayFor={h === 0 && !hand.fromSplit ? delayFor : () => 0}
            />
          ))}
      </div>

      <div
        className={clsx(
          "flex min-w-28 flex-col items-center rounded-2xl px-3 py-1.5",
          // Whose turn it is shows on the seat itself: its name box turns brass.
          isTurn ? "bg-brass ring-2 ring-brass-lit" : net !== undefined && net > 0 ? "bg-leather ring-2 ring-brass-lit" : "bg-leather",
        )}
      >
        <div className="flex max-w-40 items-baseline gap-1.5">
          <span data-seat-of={p.id} className={clsx("truncate text-base font-bold", isTurn ? "text-smoke" : "text-parchment")}>{p.name}</span>
          {isViewer && <span className={clsx("text-xs", isTurn ? "text-smoke/75" : "text-brass-lit")}>you</span>}
          {p.isBot && <span className={clsx("text-xs", isTurn ? "text-smoke/75" : "text-brass-lit")}>{DIFFICULTY_LABEL[p.botDifficulty ?? "medium"]}</span>}
        </div>
        {out ? (
          <span className="text-sm text-ash">Out</span>
        ) : (
          <span className={clsx("font-display text-lg leading-tight font-bold tabular-nums", isTurn ? "text-smoke" : "text-brass-lit")}>{chips(p.chips)}</span>
        )}
        {disconnected && !out && <span className="text-xs text-parchment">Reconnecting…</span>}
      </div>

      {/* One line, kept even when empty: the round's result, or where this seat stands on the bet. */}
      <div className="flex h-5 items-center">
        {net !== undefined ? (
          <span className={clsx("text-sm font-bold tabular-nums", net > 0 ? "text-brass-lit" : net < 0 ? "text-parchment" : "text-bone")}>
            {net > 0 ? `+${chips(net)}` : net < 0 ? `−${chips(-net)}` : "Even"}
          </span>
        ) : (
          status && <span className="text-xs font-bold text-parchment">{status}</span>
        )}
      </div>
    </div>
  );
}

function Hand({
  hand,
  size,
  active,
  settled,
  delayFor,
}: {
  hand: BlackjackHand;
  size: "sm" | "md";
  active: boolean;
  settled: boolean;
  delayFor: (card: number) => number;
}) {
  const natural = isNatural(hand);
  const label = totalLabel(hand.cards, natural);
  const outcome = settled && hand.outcome ? hand.outcome : null;
  const won = outcome === "win" || outcome === "blackjack";

  return (
    <div className={clsx("flex flex-col items-center gap-1.5 rounded-2xl p-1.5", active && "bg-black/20 ring-2 ring-brass-lit")}>
      <div className="flex">
        {hand.cards.map((c, i) => (
          <div key={`${c.id}-${i}`} className={clsx(i > 0 && (size === "md" ? "-ml-8" : "-ml-6"))}>
            <PlayingCard card={c} size={size} dealDelay={delayFor(i)} dimmed={outcome === "bust" || outcome === "lose"} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className={clsx(
            "rounded-full px-2 font-display text-base font-extrabold tabular-nums",
            label === "Bust" ? "bg-chip text-bone" : natural ? "bg-brass text-smoke" : "bg-smoke/70 text-bone",
          )}
        >
          {label}
        </span>
        <BetChip amount={hand.bet} doubled={hand.doubled} />
      </div>
      <span className={clsx("h-4 text-xs font-bold", won ? "text-brass-lit" : "text-parchment")}>{outcome && outcome !== "bust" ? OUTCOME[outcome] : ""}</span>
    </div>
  );
}

/** The bet in front of a hand: a little chip and the amount. */
export function BetChip({ amount, doubled }: { amount: number; doubled?: boolean }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-black/35 py-0.5 pr-2 pl-0.5" aria-label={`Bet ${chips(amount)}${doubled ? ", doubled" : ""}`}>
      <span aria-hidden className="bet-chip relative size-4 rounded-full" style={{ "--chip-face": "var(--color-brass-deep)" } as React.CSSProperties} />
      <span className="text-sm font-bold text-bone tabular-nums">{chips(amount)}</span>
      {doubled && <span className="text-xs font-bold text-brass-lit">×2</span>}
    </span>
  );
}
