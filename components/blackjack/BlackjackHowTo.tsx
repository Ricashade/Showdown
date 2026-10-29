"use client";

import { useEffect, useRef } from "react";
import { RoomLink } from "@/components/ui/RoomTransition";
import clsx from "clsx";
import type { Card } from "@/types/cards";
import { handValue } from "@/lib/blackjack-engine";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { cards } from "@/components/rules/sample-cards";
import { DemoBar, Fan, HowToDialog, Panel, Tips, useDemoSteps } from "@/components/rules/HowToDialog";
import { totalLabel } from "./BlackjackTable";

/** Blackjack's rules guide and quick demo. */
export function BlackjackHowTo({ onClose }: { onClose: () => void }) {
  return <HowToDialog title="How to play Blackjack" guide={(showDemo) => <Guide onDemo={showDemo} />} demo={(exit) => <Demo onExit={exit} />} onClose={onClose} />;
}

// ---------------------------------------------------------------------------
// Guide
// ---------------------------------------------------------------------------

const PAYOUTS = [
  { label: "Win", pays: "1 to 1" },
  { label: "Blackjack", pays: "3 to 2" },
  { label: "Insurance", pays: "2 to 1" },
  { label: "Push (tie)", pays: "Bet back" },
];

const MOVES = [
  { move: "Hit", what: "Take a card." },
  { move: "Stand", what: "Keep your total." },
  { move: "Double", what: "Double the bet, take exactly one card." },
  { move: "Split", what: "Two cards of the same rank become two hands, each with its own bet." },
];

const TIPS = [
  "Hit 11 or less.",
  "Stand on 12–16 when the dealer shows 2–6; hit them against 7 to Ace.",
  "Stand on 17 or more.",
  "Double 11, and 10 unless the dealer shows a 10 or Ace.",
  "Always split Aces and 8s. Never split 10s or 5s.",
  "Skip insurance.",
];

function Guide({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Beat the dealer" className="md:col-span-2">
        <p className="text-base text-parchment">
          Get closer to 21 than the dealer without going over. Everyone plays their own hand against the dealer, not each other.
        </p>
        <button onClick={onDemo} className="mt-4 min-h-11 rounded-full bg-brass px-5 text-base font-bold text-smoke hover:bg-brass-lit">
          Watch the 20-second demo
        </button>
      </Panel>

      <Panel title="Card values">
        <ul className="space-y-3">
          <li className="flex items-center justify-between gap-3">
            <Fan spec="2S 7H TD" />
            <span className="text-base text-bone">Face value</span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <Fan spec="JC QD KS" />
            <span className="text-base text-bone">10</span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <Fan spec="AH" />
            <span className="text-base text-bone">1 or 11</span>
          </li>
        </ul>
      </Panel>

      <Panel title="Soft and hard">
        <ul className="space-y-3">
          <li className="flex items-center justify-between gap-3">
            <Fan spec="AS 6H" />
            <span className="text-right text-base text-bone">
              Soft 17
              <span className="block text-sm text-ash">Ace as 11: a hit can't bust you</span>
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <Fan spec="AS 6H TD" />
            <span className="text-right text-base text-bone">
              Hard 17
              <span className="block text-sm text-ash">Ace back to 1</span>
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <Fan spec="AC KH" />
            <span className="text-right text-base text-bone">Blackjack</span>
          </li>
        </ul>
      </Panel>

      <Panel title="Payouts">
        <table className="w-full text-base">
          <tbody className="divide-y divide-leather-lit">
            {PAYOUTS.map((p) => (
              <tr key={p.label}>
                <td className="py-2 text-bone">{p.label}</td>
                <td className="py-2 text-right font-display text-xl font-bold text-brass-lit">{p.pays}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-ash">The dealer hits soft 17 and stands on hard 17.</p>
      </Panel>

      <Panel title="Your moves">
        <dl className="space-y-2">
          {MOVES.map((m) => (
            <div key={m.move} className="flex gap-3">
              <dt className="w-16 shrink-0 font-display text-xl font-bold text-bone">{m.move}</dt>
              <dd className="text-base text-parchment">{m.what}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="Basic strategy" className="md:col-span-2">
        <Tips items={TIPS} />
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo: deal → hit → stand → dealer busts → payout
// ---------------------------------------------------------------------------

const YOU = cards("9C 3D 8H");
const DEALER = cards("2H QC 4S 9D");
const BET = 50;

interface DemoStep {
  you: number;
  dealer: number;
  hole: boolean;
  title: string;
  /** Which button moves the demo on (it also moves on by itself). */
  press?: "Hit" | "Stand";
  ms: number;
}

const STEPS: DemoStep[] = [
  { you: 2, dealer: 2, hole: false, title: "Two cards each, one of the dealer's face down", ms: 3000 },
  { you: 2, dealer: 2, hole: false, title: "12 against a 2: take a card", press: "Hit", ms: 4000 },
  { you: 3, dealer: 2, hole: false, title: "20. Good enough: stand", press: "Stand", ms: 4000 },
  { you: 3, dealer: 2, hole: true, title: "The dealer turns the hole card", ms: 2200 },
  { you: 3, dealer: 3, hole: true, title: "Under 17, so the dealer must hit", ms: 2200 },
  { you: 3, dealer: 4, hole: true, title: "Dealer busts", ms: 2200 },
  { you: 3, dealer: 4, hole: true, title: `You win ${BET}`, ms: 0 },
];

function Demo({ onExit }: { onExit: () => void }) {
  const { step, last, next, restart, progress } = useDemoSteps(STEPS);
  const s = STEPS[step];
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => primaryRef.current?.focus(), [step]);

  const you = YOU.slice(0, s.you);
  const dealer: (Card | null)[] = DEALER.slice(0, s.dealer).map((c, i) => (i === 1 && !s.hole ? null : c));
  const dealerKnown = dealer.filter((c): c is Card => c !== null);

  return (
    <div>
      <DemoBar progress={progress} onExit={onExit} />

      <h3 aria-live="polite" className="mt-5 font-display text-4xl font-extrabold text-bone">
        {s.title}
      </h3>

      <div className="felt mt-6 rounded-t-[2.5rem] rounded-b-[45%_30%] px-6 pt-6 pb-12">
        <DemoHand label="Dealer" cards={dealer} total={s.hole ? totalLabel(dealerKnown) : String(handValue(dealerKnown).total)} />
        <div className="mt-8">
          <DemoHand label="You" cards={you} total={totalLabel(you)} bet={BET} won={last} />
        </div>
      </div>

      <div className="mt-6 flex min-h-14 flex-wrap items-center gap-3">
        {s.press && (
          <button
            ref={primaryRef}
            onClick={next}
            className={clsx(
              "min-h-14 rounded-full px-8 font-display text-2xl font-bold",
              s.press === "Hit" ? "bg-brass text-smoke hover:bg-brass-lit" : "bg-bone text-smoke hover:bg-parchment",
            )}
          >
            {s.press}
          </button>
        )}
        {last && (
          <>
            <RoomLink href="/blackjack" className="flex min-h-12 items-center rounded-full bg-brass px-7 font-display text-2xl font-bold text-smoke hover:bg-brass-lit">
              Play Blackjack
            </RoomLink>
            <button ref={primaryRef} onClick={restart} className="min-h-12 rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone">
              Replay
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function DemoHand({ label, cards: hand, total, bet, won }: { label: string; cards: (Card | null)[]; total: string; bet?: number; won?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex min-h-20">
        {hand.map((c, i) => (
          <div key={i} className={clsx(i > 0 && "-ml-7")}>
            <PlayingCard card={c} faceUp={c !== null} size="md" dealDelay={i < 2 ? i * 0.3 : 0} />
          </div>
        ))}
      </div>
      <div className={clsx("flex items-center gap-2 rounded-2xl px-4 py-1", won ? "bg-leather ring-2 ring-brass-lit" : "bg-leather")}>
        <span className="text-base font-bold text-bone">{label}</span>
        <span className={clsx("font-display text-xl font-extrabold tabular-nums", total === "Bust" ? "text-chip-lit" : "text-brass-lit")}>{total}</span>
        {bet !== undefined && <span className="text-sm text-parchment">bet {bet}</span>}
        {won && <span className="font-display text-xl font-extrabold text-brass-lit">+{bet}</span>}
      </div>
    </div>
  );
}
