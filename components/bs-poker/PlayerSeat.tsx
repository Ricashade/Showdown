"use client";

import clsx from "clsx";
import type { BsPokerSettings, WildAssignment } from "@/types/bs-poker";
import type { PublicPlayer } from "@/lib/bs-poker-game";
import { isWildCard } from "@/lib/bs-poker-engine";
import { rankShort, sortCards, suitSymbol } from "@/lib/cards";
import { type CardHighlight, type CardSize } from "@/components/ui/PlayingCard";
import { handSlot } from "@/lib/deal-plan";
import { DealtCard } from "./deal";

export interface SeatHighlights {
  cardIds: Set<string>;
  kind: Exclude<CardHighlight, null>;
  wilds: Map<string, WildAssignment>;
}

interface PlayerSeatProps {
  player: PublicPlayer;
  round: number;
  settings: BsPokerSettings;
  isTurn: boolean;
  isViewer: boolean;
  highlights?: SeatHighlights | null;
  cardSize?: CardSize;
  /** Fade cards that aren't part of the showdown hand. */
  dimUnmatched?: boolean;
  /** Online play: this player's connection dropped. */
  disconnected?: boolean;
}

export function wildLabel(w: WildAssignment) {
  return `${rankShort(w.rank)}${w.suit ? suitSymbol(w.suit) : ""}`;
}

export function PlayerSeat({
  player,
  round,
  settings,
  isTurn,
  isViewer,
  highlights,
  cardSize = "sm",
  dimUnmatched,
  disconnected,
}: PlayerSeatProps) {
  const out = player.status === "eliminated";
  const onBrink = !out && player.cardCount >= settings.maxCards;
  const cards = player.hand ? sortCards(player.hand) : null;
  const overlap = cardSize === "md" ? "-ml-6" : "-ml-5";
  // Only fade the rest when something is actually highlighted.
  const shouldDim = !!dimUnmatched && !!highlights && highlights.cardIds.size > 0;

  return (
    <div className={clsx("relative flex w-max max-w-44 flex-col items-center gap-1.5", out && "opacity-55")}>
      {/* Cards */}
      <div className="flex min-h-14 items-end">
        {out && !cards?.length ? (
          <span className="text-sm text-ash">Out</span>
        ) : cards ? (
          cards.map((c, i) => {
            const wild = highlights?.wilds.get(c.id);
            const hit = highlights?.cardIds.has(c.id);
            return (
              <div key={`${round}-${c.id}`} className={clsx(i > 0 && overlap)} style={{ zIndex: i }}>
                <DealtCard
                  slot={handSlot(player.id, i)}
                  card={c}
                  size={cardSize}
                  isWild={isWildCard(c, settings)}
                  highlight={hit ? highlights!.kind : null}
                  wildAs={wild ? wildLabel(wild) : undefined}
                  dimmed={shouldDim && !hit}
                  dealDelay={i * 0.06}
                />
              </div>
            );
          })
        ) : (
          Array.from({ length: player.cardCount }, (_, i) => (
            <div key={`${round}-back-${i}`} className={clsx(i > 0 && overlap)} style={{ zIndex: i }}>
              <DealtCard slot={handSlot(player.id, i)} card={null} faceUp={false} size={cardSize} dealDelay={i * 0.06} />
            </div>
          ))
        )}
      </div>

      {/* Nameplate */}
      <div
        className={clsx(
          "flex flex-col items-center rounded-2xl px-3 py-1.5 transition",
          isTurn ? "bg-leather-lit ring-2 ring-brass-lit" : "bg-leather",
        )}
      >
        <div className="flex max-w-40 items-baseline gap-1.5">
          <span className={clsx("truncate text-base font-bold", isTurn ? "text-bone" : "text-parchment")}>{player.name}</span>
          {isViewer && <span className="text-xs text-brass-lit">you</span>}
        </div>
        {isTurn && <span className="text-xs font-bold text-brass-lit">{isViewer ? "Your turn" : "Their turn"}</span>}
        {onBrink && !isTurn && (
          <span className="text-xs font-bold text-chip-lit">One more loss and {isViewer ? "you're" : "they're"} out</span>
        )}
        {out && <span className="text-xs text-ash">Out in round {player.eliminatedInRound}</span>}
        {disconnected && !out && <span className="text-xs text-parchment">Reconnecting…</span>}
      </div>

    </div>
  );
}
