"use client";

import clsx from "clsx";
import type { Card, StandardCard } from "@/types/cards";
import type { BouillotteMove } from "@/types/bouillotte";
import { brelanOf, type BouillottePublicPlayer, type BouillotteView } from "@/lib/bouillotte-engine";
import { DIFFICULTY_LABEL } from "@/lib/bot-ai";
import { rankName, suitName, suitSymbol } from "@/lib/cards";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { brelanWords, chips } from "./words";
import { suitStrength } from "@/lib/bots/bouillotte-bot";

interface BouillotteTableProps {
  view: BouillotteView;
  /** Whose hand is at the bottom (null: watching). */
  focusId: string | null;
  connectedIds?: Set<string>;
}

const MOVE_LABEL: Record<BouillotteMove, string> = { ante: "Ante", carre: "Carré", pass: "Pass", open: "Open", call: "Call", raise: "Raise", all_in: "Va-tout", fold: "Fold" };

export function BouillotteTable({ view, focusId, connectedIds }: BouillotteTableProps) {
  const focus = view.players.find((p) => p.id === focusId) ?? null;
  const others = focus ? [...view.players.slice(view.players.indexOf(focus) + 1), ...view.players.slice(0, view.players.indexOf(focus))] : view.players;
  const winning = new Set(view.result?.pots.map((p) => p.cardId).filter(Boolean) as string[]);

  // On wider screens the felt takes the height the window leaves, and the seats, the pile and your hand spread evenly in it.
  return (
    <section aria-label="Table" className="felt felt-line relative mx-4 flex flex-col justify-between rounded-[2.5rem] px-4 py-6 sm:px-8 sm:py-5 md:h-[calc(100dvh-16.5rem)] md:min-h-fit">
      <ul className="flex flex-wrap items-start justify-center gap-x-2 gap-y-5 sm:gap-x-10">
        {others.map((p) => (
          <li key={p.id}>
            <Seat player={p} view={view} winning={winning} disconnected={!!connectedIds && !connectedIds.has(p.id)} />
          </li>
        ))}
      </ul>

      <Pedestal view={view} />

      {focus && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex min-h-8 items-center">
            {!!focus.hand?.length && view.retourne && view.phase !== "lobby" && <Helper hand={focus.hand as StandardCard[]} retourne={view.retourne as StandardCard} favori={view.settings.brelanFavori} />}
          </div>
          <Seat player={focus} view={view} winning={winning} big you={focus.id === view.viewerId} disconnected={false} />
        </div>
      )}
    </section>
  );
}

function Seat({ player: p, view, winning, big, you, disconnected }: { player: BouillottePublicPlayer; view: BouillotteView; winning: Set<string>; big?: boolean; you?: boolean; disconnected: boolean }) {
  const isTurn = view.currentTurnId === p.id && (view.phase === "betting" || view.phase === "carre");
  const won = view.result?.won[p.id];
  const last = view.lastActions[p.id];
  const cards: (Card | null)[] = p.hand ?? (p.inHand ? [null, null, null] : []);
  // One size all hand, revealed or not, so the board never grows mid-round.
  const size = big ? "lg" : "sm";
  const busted = p.status === "busted";
  const note = won ? (
    <span className="text-sm font-bold text-brass-lit">+{chips(won)}</span>
  ) : isTurn && p.isBot ? (
    <span className="text-xs font-bold text-brass-lit">Thinking…</span>
  ) : last && !busted && last.move !== "ante" ? (
    <span className={clsx("text-xs font-bold", last.move === "all_in" || last.move === "carre" ? "text-bone" : "text-parchment")}>
      {MOVE_LABEL[last.move]}
      {last.amount && last.move !== "call" && last.move !== "fold" ? ` ${chips(last.amount)}` : ""}
    </span>
  ) : null;

  return (
    <div className={clsx("flex flex-col items-center gap-3", busted && "opacity-40")}>
      <div className={clsx("flex min-h-14 items-end", p.folded && "opacity-45")}>
        {busted ? (
          <span className="text-sm text-ash">Out</span>
        ) : (
          cards.map((c, i) => (
            <div key={`${view.handNumber}-${c?.id ?? i}`} className={clsx(i > 0 && (size === "lg" ? "-ml-5" : "-ml-4"))} style={{ transform: `rotate(${(i - 1) * 5}deg)` }}>
              <PlayingCard card={c} faceUp={!!c} size={size} highlight={c && winning.has(c.id) ? "match" : null} dealDelay={i * 0.06} />
            </div>
          ))
        )}
      </div>
      <div className="relative flex flex-col items-center gap-1">
        <div className={clsx("relative flex min-w-24 flex-col items-center rounded-2xl px-2 py-1.5 sm:min-w-28 sm:px-3", isTurn ? "bg-leather-lit ring-2 ring-brass-lit" : won ? "bg-leather ring-2 ring-brass-lit" : "bg-leather")}>
          {view.dealerId === p.id && !busted && (
            <span aria-label="Dealer" className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-bone font-display text-sm font-extrabold text-smoke shadow">
              D
            </span>
          )}
          <div className={clsx("flex items-baseline gap-1.5", big ? "max-w-40" : "max-w-24 flex-col items-center gap-0 sm:max-w-40 sm:flex-row sm:gap-1.5")}>
            <span data-seat-of={p.id} className={clsx("max-w-full truncate text-sm font-bold sm:text-base", isTurn ? "text-bone" : "text-parchment")}>
              {p.name}
            </span>
            {you && p.name !== "You" && <span className="text-xs text-brass-lit">you</span>}
            {p.isBot && <span className="text-xs text-brass-lit">{DIFFICULTY_LABEL[p.botDifficulty ?? "medium"]}</span>}
          </div>
          {!busted && <span className="font-display text-lg leading-tight font-bold text-brass-lit tabular-nums">{chips(p.chips)}</span>}
          {disconnected && !busted && <span className="text-xs text-parchment">Reconnecting…</span>}
        </div>
        {/* What just happened at this seat: on a line kept for it under other seats, beside your own. */}
        {big ? (
          note && <div className="absolute top-1/2 left-full ml-3 -translate-y-1/2 whitespace-nowrap">{note}</div>
        ) : (
          <div className="flex h-5 items-center">{note}</div>
        )}
      </div>
    </div>
  );
}

/** The Retourné in its frame, the pot, and the undealt stub. */
function Pedestal({ view }: { view: BouillotteView }) {
  const corner = "absolute size-3 border-brass-lit/80";
  return (
    <div className="my-8 flex items-center justify-center gap-6 sm:gap-10 md:my-1">
      <div className="flex flex-col items-center gap-1" role="img" aria-label={`Stub, ${view.stubCount} cards`}>
        <div className="relative h-14 w-10">
          {view.stubCount > 0 ? (
            <>
              <div className="card-back absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-md ring-1 ring-black/40" />
              <div className="card-back absolute inset-0 rounded-md shadow-md ring-1 ring-black/40" />
            </>
          ) : (
            <div className="absolute inset-0 rounded-md border border-dashed border-bone/20" />
          )}
        </div>
        <span className="text-xs text-bone tabular-nums">Stub {view.stubCount}</span>
      </div>

      <figure className="flex flex-col items-center gap-2">
        <div className="relative rounded-2xl bg-black/20 p-2.5 shadow-[inset_0_0_0_1px_rgba(214,182,127,0.45),0_0_0_5px_rgba(122,92,46,0.35),0_10px_30px_rgba(0,0,0,0.35)]">
          <span aria-hidden className={clsx(corner, "top-1 left-1 rounded-tl-md border-t-2 border-l-2")} />
          <span aria-hidden className={clsx(corner, "top-1 right-1 rounded-tr-md border-t-2 border-r-2")} />
          <span aria-hidden className={clsx(corner, "bottom-1 left-1 rounded-bl-md border-b-2 border-l-2")} />
          <span aria-hidden className={clsx(corner, "right-1 bottom-1 rounded-br-md border-r-2 border-b-2")} />
          {view.retourne ? (
            <PlayingCard key={`${view.handNumber}-${view.retourne.id}`} card={view.retourne} size="md" startFaceDown revealDelay={0.35} />
          ) : (
            <div className="card-back h-20 w-14 rounded-lg ring-1 ring-black/40" />
          )}
        </div>
        <figcaption className="font-display text-base font-bold tracking-wide text-brass-lit">Retourné</figcaption>
      </figure>

      <div className="flex flex-col items-center">
        <span className="text-sm text-bone">Pot</span>
        <span className="font-display text-4xl font-extrabold text-bone tabular-nums">{chips(view.result ? view.result.pots.reduce((n, p) => n + p.amount, 0) : view.pot)}</span>
      </div>
    </div>
  );
}

/** What your three cards amount to: a brélan, or your best suit for Le Point. */
function Helper({ hand, retourne, favori }: { hand: StandardCard[]; retourne: StandardCard; favori: boolean }) {
  const brelan = brelanOf(hand, retourne, favori);
  if (brelan) return <p className="rounded-full bg-brass px-4 py-0.5 font-display text-lg font-bold text-smoke">{brelanWords(brelan)}</p>;
  const { suit, points, inHand } = suitStrength(hand, retourne);
  const top = hand.filter((c) => c.suit === suit).sort((a, b) => b.rank - a.rank)[0];
  return (
    <p className="rounded-full bg-black/25 px-4 py-1 text-sm text-bone">
      {top ? (
        <>
          <span className="font-bold">
            {rankName(top.rank)} of {suitName(suit)}
          </span>{" "}
          · {suitSymbol(suit)} {points} pts{points > inHand ? " with the Retourné" : ""}
        </>
      ) : (
        <>No {suitName(suit).toLowerCase()} in hand · the Retourné leads {suitSymbol(suit)}</>
      )}
    </p>
  );
}
