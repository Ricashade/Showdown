"use client";

import { useEffect, useRef } from "react";
import { RoomLink } from "@/components/ui/RoomTransition";
import clsx from "clsx";
import type { Card } from "@/types/cards";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { cards } from "@/components/rules/sample-cards";
import { DemoBar, Fan, HowToDialog, Panel, Tips, useDemoSteps } from "@/components/rules/HowToDialog";

/** Rummy's rules guide and quick demo. */
export function RummyHowTo({ onClose }: { onClose: () => void }) {
  return <HowToDialog title="How to play Rummy" guide={(showDemo) => <Guide onDemo={showDemo} />} demo={(exit) => <Demo onExit={exit} />} onClose={onClose} />;
}

// ---------------------------------------------------------------------------
// Guide
// ---------------------------------------------------------------------------

const TURN = [
  "Draw one card: from the stock, or the top of the discard pile.",
  "Put down any sets or runs you have, and lay off cards on melds already on the table (anyone's).",
  "Discard one card to end your turn.",
];

const SCORING = [
  "Classic: whoever goes out scores the cards left in everyone else's hand. Aces 1, faces 10.",
  "Rummy 500: you score every card you put on the table, minus what's left in your hand.",
  "Go out in one turn without having melded before: Rummy, double points.",
];

function Guide({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <Panel title="Empty your hand" className="md:col-span-2">
        <p className="max-w-2xl text-base text-parchment">Make sets and runs, put them on the table, and get rid of every card. The first to go out ends the round.</p>
        <button onClick={onDemo} className="mt-4 min-h-11 rounded-full bg-brass px-5 text-base font-bold text-smoke hover:bg-brass-lit">
          Watch the 20-second demo
        </button>
      </Panel>

      <Panel title="Sets and runs">
        <ul className="space-y-3">
          <li className="flex items-center justify-between gap-3">
            <Fan spec="7S 7H 7D" />
            <span className="text-right text-base text-bone">
              Set
              <span className="block text-sm text-ash">3 or 4 of a rank</span>
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <Fan spec="4C 5C 6C 7C" />
            <span className="text-right text-base text-bone">
              Run
              <span className="block text-sm text-ash">3+ in a row, one suit</span>
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <Fan spec="AH 2H 3H" />
            <span className="text-right text-base text-bone">
              Aces
              <span className="block text-sm text-ash">Low or high (Q-K-A); the host can allow K-A-2</span>
            </span>
          </li>
        </ul>
      </Panel>

      <Panel title="Your turn">
        <ol className="space-y-2.5">
          {TURN.map((t, i) => (
            <li key={t} className="flex gap-3 text-base text-parchment">
              <span className="w-4 shrink-0 font-display text-xl font-bold text-brass-lit">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Laying off">
        <div className="flex flex-wrap items-center gap-4">
          <Fan spec="KS KD KC" />
          <span aria-hidden className="text-2xl text-brass-lit">+</span>
          <Fan spec="KH" />
        </div>
        <p className="mt-3 text-base text-parchment">Add a card to any meld on the table: the fourth King to a set, or the next card at either end of a run.</p>
      </Panel>

      <Panel title="Rummy 500">
        <Fan spec="4H 9S JD KC" />
        <p className="mt-3 text-base text-parchment">
          The discard pile is spread out. Take any card in it, plus every card on top of it, as long as you play the card you took that turn.
        </p>
      </Panel>

      <Panel title="Scoring" className="md:col-span-2">
        <Tips items={SCORING} />
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo: take the 9♠ → meld 7♠ 8♠ 9♠ → lay off K♥ on the Kings → discard → out
// ---------------------------------------------------------------------------

const [S7, S8, S9, HK, D4] = cards("7S 8S 9S KH 4D");
const KINGS = cards("KS KD KC");

interface DemoStep {
  hand: Card[];
  discard: Card | null;
  run: boolean;
  fourthKing: boolean;
  selected: string[];
  title: string;
  press?: string;
  ms: number;
}

const DEMO: DemoStep[] = [
  { hand: [S7, S8, HK, D4], discard: S9, run: false, fourthKing: false, selected: [], title: "The 9♠ fits your 7♠ 8♠: take it", press: "Take the 9♠", ms: 3500 },
  { hand: [S7, S8, S9, HK, D4], discard: null, run: false, fourthKing: false, selected: ["7S", "8S", "9S"], title: "Pick 7♠ 8♠ 9♠ and meld the run", press: "Meld 3 cards", ms: 4000 },
  { hand: [HK, D4], discard: null, run: true, fourthKing: false, selected: ["KH"], title: "Your K♥ fits the Kings on the table", press: "Lay off here", ms: 4000 },
  { hand: [D4], discard: null, run: true, fourthKing: true, selected: ["4D"], title: "One card left: discard it", press: "Discard 4♦", ms: 3500 },
  { hand: [], discard: D4, run: true, fourthKing: true, selected: [], title: "Your hand is empty: you go out", ms: 0 },
];

function Demo({ onExit }: { onExit: () => void }) {
  const { step, last, next, restart, progress } = useDemoSteps(DEMO);
  const s = DEMO[step];
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => primaryRef.current?.focus(), [step]);

  return (
    <div>
      <DemoBar progress={progress} onExit={onExit} />
      <h3 aria-live="polite" className="mt-5 font-display text-4xl font-extrabold text-bone">
        {s.title}
      </h3>

      <div className="felt mt-6 flex flex-col items-center gap-6 rounded-[2.5rem] px-4 py-6 sm:px-8">
        <div className="flex flex-wrap items-end justify-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <div className={clsx("grid h-20 w-14 place-items-center rounded-lg border border-dashed border-bone/30", step === 0 && "ring-3 ring-brass-lit")}>
              {s.discard && <PlayingCard key={s.discard.id} card={s.discard} size="md" />}
            </div>
            <span className="text-xs text-bone">Discard pile</span>
          </div>
          <div className={clsx("relative flex rounded-xl bg-black/15 p-1.5 pl-6", step === 2 && "ring-3 ring-brass-lit")}>
            {[...KINGS, ...(s.fourthKing ? [HK] : [])].map((c) => (
              <span key={c.id} className="-ml-5">
                <PlayingCard card={c} size="sm" />
              </span>
            ))}
            {step === 2 && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brass-lit px-2 text-xs font-bold whitespace-nowrap text-smoke">+ Lay off here</span>}
          </div>
          {s.run && (
            <div className="flex rounded-xl bg-black/15 p-1.5 pl-6">
              {[S7, S8, S9].map((c) => (
                <span key={c.id} className="-ml-5">
                  <PlayingCard card={c} size="sm" />
                </span>
              ))}
            </div>
          )}
        </div>

        <ul aria-label="Your hand" className="flex min-h-28 items-end pl-8">
          {s.hand.map((c) => (
            <li key={c.id} className="-ml-8">
              <div className={clsx("rounded-lg transition", s.selected.includes(c.id) && "-translate-y-4 ring-3 ring-bone")}>
                <PlayingCard card={c} size="md" />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 flex min-h-14 flex-wrap items-center gap-3">
        {s.press && (
          <button ref={primaryRef} onClick={next} className="min-h-14 rounded-full bg-brass px-8 font-display text-2xl font-bold text-smoke hover:bg-brass-lit">
            {s.press}
          </button>
        )}
        {last && (
          <>
            <RoomLink href="/rummy" className="flex min-h-12 items-center rounded-full bg-brass px-7 font-display text-2xl font-bold text-smoke hover:bg-brass-lit">
              Play Rummy
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
