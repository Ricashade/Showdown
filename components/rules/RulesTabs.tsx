"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { Crown, Gavel, Layers, ListOrdered, Megaphone } from "lucide-react";
import type { Bid } from "@/types/bs-poker";
import { bidLabel, HAND_TYPE_LABEL } from "@/lib/bs-poker-engine";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { cards } from "./sample-cards";

const TABS = [
  { id: "goal", label: "The goal", icon: Crown },
  { id: "bidding", label: "How bidding works", icon: Megaphone },
  { id: "calling", label: "Calling BS", icon: Gavel },
  { id: "penalties", label: "Card penalties", icon: Layers },
  { id: "rankings", label: "Hand rankings", icon: ListOrdered },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function RulesTabs() {
  const [active, setActive] = useState<TabId>("goal");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Arrow keys move between tabs, as screen-reader users expect from a tab list.
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const j = (next + TABS.length) % TABS.length;
    setActive(TABS[j].id);
    tabRefs.current[j]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Rules" className="flex flex-wrap gap-1.5">
        {TABS.map((t, i) => {
          const Icon = t.icon;
          const on = active === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={clsx(
                "flex min-h-11 items-center gap-2 rounded-full px-4 text-base font-bold transition",
                on ? "bg-bone text-smoke" : "text-parchment ring-1 ring-leather-lit hover:text-bone hover:ring-brass",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        tabIndex={0}
        className="mt-6 rounded-[2rem] bg-smoke-raised p-6 ring-1 ring-leather-lit sm:p-9"
      >
        {active === "goal" && <Goal />}
        {active === "bidding" && <Bidding />}
        {active === "calling" && <Calling />}
        {active === "penalties" && <Penalties />}
        {active === "rankings" && <Rankings />}
      </div>
    </div>
  );
}

function Panel({ title, lead, children }: { title: string; lead: string; children?: React.ReactNode }) {
  return (
    <>
      <h2 className="font-display text-4xl font-bold text-bone">{title}</h2>
      <p className="mt-2 max-w-prose text-lg text-parchment">{lead}</p>
      {children}
    </>
  );
}

function Hand({ spec, size = "sm" as const }: { spec: string; size?: "sm" | "md" }) {
  return (
    <div className="flex gap-1">
      {cards(spec).map((c) => (
        <PlayingCard key={c.id} card={c} size={size} />
      ))}
    </div>
  );
}

function Goal() {
  return (
    <Panel title="Be the last one standing" lead="Bluff, catch bluffs, and avoid picking up cards. The last player still in wins.">
      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { n: "5 + 1", text: "Five cards go face up on the table. Everyone also gets one hidden card of their own." },
          { n: "+1 card", text: "Lose a round and you hold one more card next round." },
          { n: "Out", text: "Lose while holding the maximum (6 by default) and you're out." },
        ].map((s) => (
          <li key={s.n} className="rounded-2xl bg-smoke p-4 ring-1 ring-leather-lit">
            <p className="font-display text-3xl font-bold text-bone">{s.n}</p>
            <p className="mt-1 text-base text-parchment">{s.text}</p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function Bidding() {
  const ladder: Bid[] = [
    { type: "HIGH_CARD", rank: 9 },
    { type: "PAIR", rank: 4 },
    { type: "PAIR", rank: 13 },
    { type: "TWO_PAIR", high: 13, low: 5 },
  ];
  return (
    <Panel
      title="Bid on everyone's cards"
      lead="A bid names a poker hand you claim is hiding in the five face-up table cards plus everyone's hidden hands, all counted together."
    >
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          <p className="text-base text-bone">On the table, for everyone</p>
          <div className="mt-2">
            <Hand spec="QD 8S 7H 3C JC" />
          </div>
          <p className="mt-4 text-base text-bone">In your hand, just for you</p>
          <div className="mt-2">
            <Hand spec="KS" size="md" />
          </div>
          <p className="mt-3 max-w-sm text-base text-parchment">
            There&apos;s no King on the table, so bidding a pair of Kings bets that another one is in someone
            else&apos;s hand.
          </p>
        </div>
        <div>
          <p className="text-base text-bone">Each bid must beat the last one</p>
          <ol className="mt-3 space-y-2">
            {ladder.map((b, i) => (
              <li key={i} className="flex items-baseline gap-3">
                <span aria-hidden className="text-ash">
                  {i === 0 ? "" : "then"}
                </span>
                <span className="font-display text-2xl font-bold text-bone">{bidLabel(b)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 max-w-sm text-sm text-ash">
            Go up a hand type, or keep the type and raise the ranks. Only the cards the hand needs have to exist, and
            the table cards alone always make some five-card hand.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function Calling() {
  return (
    <Panel
      title="Don't believe it? Call BS"
      lead="On your turn, instead of raising, you can call BS on the last bid. Everyone flips their cards over, and the hand is checked against the table cards plus every hand."
    >
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-smoke p-5 ring-1 ring-leather-lit">
          <p className="font-display text-2xl font-bold text-bone">The hand is there</p>
          <p className="mt-1 text-base text-parchment">The bid was honest. Whoever called BS loses the round.</p>
        </div>
        <div className="rounded-2xl bg-smoke p-5 ring-2 ring-chip">
          <p className="font-display text-2xl font-bold text-chip-lit">The hand isn&apos;t there</p>
          <p className="mt-1 text-base text-parchment">Caught bluffing. Whoever made the bid loses the round.</p>
        </div>
      </div>
      <p className="mt-4 max-w-prose text-sm text-ash">
        If nobody can top a Royal flush, the next player has to call BS.
      </p>
    </Panel>
  );
}

function Penalties() {
  return (
    <Panel
      title="Losing costs you a card"
      lead="The loser holds one more card next round and opens the bidding. The table always has five fresh cards, so every lost round puts more cards in play."
    >
      <div className="mt-6 flex flex-wrap items-end gap-3" aria-label="One card, then two, up to six, then out">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <div key={n} className="flex flex-col items-center gap-1">
            <div className="flex">
              {Array.from({ length: n }, (_, i) => (
                <div key={i} className={clsx(i > 0 && "-ml-7")}>
                  <PlayingCard card={null} faceUp={false} size="sm" />
                </div>
              ))}
            </div>
            <span className="text-sm text-parchment">{n}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-1 pb-0.5">
          <span className="grid h-14 place-items-center px-2 font-display text-3xl font-bold text-chip-lit">Out</span>
          <span className="text-sm text-parchment">lose at 6</span>
        </div>
      </div>
      <p className="mt-4 max-w-prose text-sm text-ash">
        The host can change the starting and maximum hand sizes. With a full table of 8, hands top out at 5 cards.
      </p>
    </Panel>
  );
}

const RANKINGS: { bid: Bid; spec: string }[] = [
  { bid: { type: "HIGH_CARD", rank: 9 }, spec: "9C" },
  { bid: { type: "PAIR", rank: 13 }, spec: "KS KH" },
  { bid: { type: "TWO_PAIR", high: 11, low: 4 }, spec: "JS JD 4H 4C" },
  { bid: { type: "THREE_OF_A_KIND", rank: 7 }, spec: "7S 7H 7D" },
  { bid: { type: "STRAIGHT", high: 8 }, spec: "4H 5C 6D 7S 8H" },
  { bid: { type: "FLUSH", high: 13 }, spec: "KH 9H 7H 4H 3H" },
  { bid: { type: "FULL_HOUSE", trips: 10, pair: 4 }, spec: "TS TH TD 4C 4H" },
  { bid: { type: "FOUR_OF_A_KIND", rank: 14 }, spec: "AS AH AD AC" },
  { bid: { type: "STRAIGHT_FLUSH", high: 14 }, spec: "TS JS QS KS AS" },
];

function Rankings() {
  return (
    <Panel
      title="From lowest to highest"
      lead="Straights and flushes are named by their top card. A King-high flush is five cards of one suit topped by a King."
    >
      <ol className="mt-6 divide-y divide-leather-lit">
        {RANKINGS.map(({ bid, spec }, i) => (
          <li key={bid.type} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-6">
            <span className="flex w-72 shrink-0 items-baseline gap-3">
              <span className="w-6 font-display text-xl font-bold text-ash tabular-nums">{i + 1}</span>
              <span>
                <span className="block font-display text-2xl font-bold text-bone">{HAND_TYPE_LABEL[bid.type]}</span>
                <span className="block text-sm text-parchment">Bid as &ldquo;{bidLabel(bid)}&rdquo;</span>
              </span>
            </span>
            <Hand spec={spec} />
          </li>
        ))}
      </ol>
      <p className="mt-4 max-w-prose text-sm text-ash">
        Hosts can turn on wild cards (2s or Jokers) and can ban straights, flushes or straight flushes, either for the
        whole game or once hands get big.
      </p>
    </Panel>
  );
}
