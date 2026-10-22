"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { Rank } from "@/types/cards";
import type { Bid, BidEntry, HandType } from "@/types/bs-poker";
import {
  FLUSH_HIGHS,
  HAND_TYPE_LABEL,
  HAND_TYPE_ORDER,
  HAND_TYPE_PLURAL,
  STRAIGHT_HIGHS,
  bidLabel,
  bidsEqual,
} from "@/lib/bs-poker-engine";
import { RANKS, rankName, rankShort } from "@/lib/cards";

interface BidBuilderProps {
  legalBids: Bid[];
  currentBid: BidEntry | null;
  currentBidderName?: string;
  /** Hand types banned this round: hidden from the picker. */
  disabledHandTypes: HandType[];
  canCallBS: boolean;
  actingName: string;
  onBid: (bid: Bid) => void;
  onCallBS: () => void;
}

/** First parameter of a bid (rank / high / trips). */
function primaryOf(bid: Bid): Rank {
  switch (bid.type) {
    case "TWO_PAIR":
    case "STRAIGHT":
    case "FLUSH":
    case "STRAIGHT_FLUSH":
      return bid.high;
    case "FULL_HOUSE":
      return bid.trips;
    default:
      return bid.rank;
  }
}

/** Second parameter (low pair / "full of"), if the hand type has one. */
function secondaryOf(bid: Bid): Rank | undefined {
  if (bid.type === "TWO_PAIR") return bid.low;
  if (bid.type === "FULL_HOUSE") return bid.pair;
  return undefined;
}

const HAS_SECONDARY = (t: HandType) => t === "TWO_PAIR" || t === "FULL_HOUSE";

const PRIMARY_LABEL: Record<HandType, string> = {
  HIGH_CARD: "Which card",
  PAIR: "Pair of",
  TWO_PAIR: "Higher pair",
  THREE_OF_A_KIND: "Three of",
  STRAIGHT: "Straight up to",
  FLUSH: "Flush topped by",
  FULL_HOUSE: "Three of",
  FOUR_OF_A_KIND: "Four of",
  STRAIGHT_FLUSH: "Straight flush up to",
};

const SECONDARY_LABEL: Partial<Record<HandType, string>> = { TWO_PAIR: "Lower pair", FULL_HOUSE: "Full of" };

function primaryChoices(type: HandType): readonly Rank[] {
  if (type === "STRAIGHT" || type === "STRAIGHT_FLUSH") return STRAIGHT_HIGHS;
  if (type === "FLUSH") return FLUSH_HIGHS;
  return RANKS;
}

export function BidBuilder({
  legalBids,
  currentBid,
  currentBidderName,
  disabledHandTypes,
  canCallBS,
  actingName,
  onBid,
  onCallBS,
}: BidBuilderProps) {
  const minBid = legalBids[0] ?? null;
  const [selected, setSelected] = useState<Bid | null>(minBid);

  // Reset to the smallest raise whenever the situation changes (new bid / new turn).
  const legalKey = minBid ? JSON.stringify(minBid) : "none";
  useEffect(() => setSelected(minBid), [legalKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const byType = useMemo(() => {
    const m = new Map<HandType, Bid[]>();
    for (const b of legalBids) m.set(b.type, [...(m.get(b.type) ?? []), b]);
    return m;
  }, [legalBids]);

  const type = selected?.type;
  const typeBids = type ? byType.get(type) ?? [] : [];
  const primary = selected ? primaryOf(selected) : undefined;

  const pickType = (t: HandType) => setSelected(byType.get(t)?.[0] ?? null);
  const pickPrimary = (r: Rank) => setSelected(typeBids.find((b) => primaryOf(b) === r) ?? null);
  const pickSecondary = (r: Rank) =>
    setSelected(typeBids.find((b) => primaryOf(b) === primary && secondaryOf(b) === r) ?? null);

  const isLegal = !!selected && legalBids.some((b) => bidsEqual(b, selected));

  return (
    <section aria-label={`${actingName}'s move`} className="grid gap-x-10 gap-y-6 md:grid-cols-[1fr_auto]">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-display text-3xl font-bold text-bone">Your move, {actingName}</h2>
          {minBid && (
            <button
              onClick={() => setSelected(minBid)}
              className="min-h-10 text-sm text-brass-lit underline decoration-brass/50 underline-offset-4 hover:decoration-brass-lit"
            >
              Smallest raise: {bidLabel(minBid)}
            </button>
          )}
        </div>

        {legalBids.length === 0 ? (
          <p className="mt-3 max-w-prose text-base text-parchment">
            Nothing beats a Royal flush. Call BS.
          </p>
        ) : (
          <>
            <div role="radiogroup" aria-label="Hand" className="mt-4 flex flex-wrap gap-1.5">
              {HAND_TYPE_ORDER.filter((t) => !disabledHandTypes.includes(t)).map((t) => {
                const available = (byType.get(t)?.length ?? 0) > 0;
                return (
                  <button
                    key={t}
                    role="radio"
                    aria-checked={type === t}
                    onClick={() => pickType(t)}
                    disabled={!available}
                    className={clsx(
                      "min-h-10 rounded-full px-4 text-sm font-bold transition",
                      type === t
                        ? "bg-bone text-smoke"
                        : available
                          ? "text-parchment ring-1 ring-leather-lit hover:text-bone hover:ring-brass"
                          : "text-ash/60",
                    )}
                  >
                    {HAND_TYPE_LABEL[t]}
                  </button>
                );
              })}
            </div>
            {disabledHandTypes.length > 0 && (
              <p className="mt-2 text-sm text-ash">
                Banned this round: {disabledHandTypes.map((t) => HAND_TYPE_PLURAL[t].toLowerCase()).join(", ")}.
              </p>
            )}

            {type && (
              <div className="mt-5 space-y-4">
                <RankRow
                  label={PRIMARY_LABEL[type]}
                  choices={primaryChoices(type)}
                  selected={primary}
                  isEnabled={(r) => typeBids.some((b) => primaryOf(b) === r)}
                  onPick={pickPrimary}
                />
                {HAS_SECONDARY(type) && (
                  <RankRow
                    label={SECONDARY_LABEL[type]!}
                    choices={type === "TWO_PAIR" ? RANKS.filter((r) => primary !== undefined && r < primary) : RANKS.filter((r) => r !== primary)}
                    selected={selected ? secondaryOf(selected) : undefined}
                    isEnabled={(r) => typeBids.some((b) => primaryOf(b) === primary && secondaryOf(b) === r)}
                    onPick={pickSecondary}
                  />
                )}
              </div>
            )}

            <button
              onClick={() => selected && onBid(selected)}
              disabled={!isLegal}
              className="mt-6 min-h-12 w-full rounded-full bg-brass px-6 font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit disabled:opacity-40 sm:w-auto"
            >
              Place bid
            </button>
          </>
        )}
      </div>

      {/* The one bold element: calling BS. */}
      <div className="flex flex-col items-center justify-center gap-3 md:border-l md:border-leather-lit md:pl-10">
        <button
          onClick={onCallBS}
          disabled={!canCallBS}
          className="poker-chip relative grid size-36 place-items-center rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition enabled:hover:-translate-y-0.5 enabled:active:translate-y-0.5"
        >
          <span className={clsx("relative font-display text-4xl leading-none font-extrabold", canCallBS ? "text-bone" : "text-ash")}>
            Call BS
          </span>
        </button>
      </div>
    </section>
  );
}

function RankRow({
  label,
  choices,
  selected,
  isEnabled,
  onPick,
}: {
  label: string;
  choices: readonly Rank[];
  selected: Rank | undefined;
  isEnabled: (r: Rank) => boolean;
  onPick: (r: Rank) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <div className="mb-2 text-sm text-ash">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {choices.map((r) => {
          const enabled = isEnabled(r);
          const on = selected === r;
          return (
            <button
              key={r}
              role="radio"
              aria-checked={on}
              aria-label={rankName(r)}
              onClick={() => onPick(r)}
              disabled={!enabled}
              className={clsx(
                "h-12 w-9 rounded-md font-display text-lg font-extrabold transition",
                on
                  ? "-translate-y-1 bg-bone text-smoke shadow-[0_6px_0_var(--color-brass)]"
                  : enabled
                    ? "bg-bone/85 text-smoke hover:-translate-y-0.5 hover:bg-bone"
                    : "text-ash/50 ring-1 ring-leather-lit",
              )}
            >
              {rankShort(r)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
