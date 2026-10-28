"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { Card } from "@/types/cards";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { cards } from "@/components/rules/sample-cards";
import { DemoBar, Fan, HowToDialog, Panel, Tips, useDemoSteps } from "@/components/rules/HowToDialog";

/** War's rules guide and quick demo. */
export function WarHowTo({ onClose }: { onClose: () => void }) {
  return <HowToDialog title="How to play War" guide={(showDemo) => <Guide onDemo={showDemo} />} demo={(exit) => <Demo onExit={exit} />} onClose={onClose} />;
}

// ---------------------------------------------------------------------------
// Guide
// ---------------------------------------------------------------------------

const SHORT_STACK = [
  "Not enough cards for a full War? Put down all but your last card, and flip that one.",
  "No cards left to fight a War with: you lose.",
  "When your deck runs out, the cards you've won are shuffled in.",
];

function Guide({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <Panel title="Higher card wins" className="md:col-span-2">
        <p className="max-w-2xl text-base text-parchment">Each player gets half the deck. Both flip the top card; the higher one takes both. Suits don&apos;t matter. Win every card to win the game.</p>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm text-ash">High</span>
          <Fan spec="AS KH QD JC TS 9H 8D 7C 6S 5H 4D 3C 2S" />
          <span className="text-sm text-ash">Low</span>
        </div>
        <button onClick={onDemo} className="mt-4 min-h-11 rounded-full bg-brass px-5 text-base font-bold text-smoke hover:bg-brass-lit">
          Watch the 15-second demo
        </button>
      </Panel>

      <Panel title="A tie means War">
        <div className="flex items-center gap-3">
          <Fan spec="QS" />
          <span className="font-display text-lg font-bold text-bone">=</span>
          <Fan spec="QH" />
        </div>
        <p className="mt-3 text-base text-parchment">
          Each player puts three cards face down and one face up. The higher face-up card takes all ten. Another tie? War again, on top of the pile.
        </p>
      </Panel>

      <Panel title="Running low">
        <Tips items={SHORT_STACK} />
      </Panel>

      <Panel title="Classic or Tactical" className="md:col-span-2">
        <p className="text-base text-parchment">
          Classic is pure luck: you flip the top card every time. In Tactical War you hold three cards and choose which to play, so it pays to save your Aces for a War. The host can also set fewer cards face down in a War, a quicker finish (first to 40, or most cards after 50 battles), and Jokers that beat everything.
        </p>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo: King beats 7 → Queens tie → War → Ace beats 9 → ten cards and the bounty revealed
// ---------------------------------------------------------------------------

const [K, SEVEN, QA, QB, ACE, NINE] = cards("KS 7H QS QH AC 9D");
const MINE_DOWN = cards("3C 8S JD");
const THEIRS_DOWN = cards("AH 5C 2D");

interface DemoStep {
  you: { card: Card; up: boolean }[];
  them: { card: Card; up: boolean }[];
  counts: [number, number];
  title: string;
  banner?: string;
  press?: string;
  ms: number;
}

const up = (c: Card) => ({ card: c, up: true });
const down = (c: Card) => ({ card: c, up: false });

const DEMO: DemoStep[] = [
  { you: [], them: [], counts: [26, 26], title: "Both of you flip at once", press: "Flip", ms: 2500 },
  { you: [up(K)], them: [up(SEVEN)], counts: [27, 25], title: "King beats 7: you take both cards", ms: 2500 },
  { you: [], them: [], counts: [27, 25], title: "Next battle", press: "Flip", ms: 2000 },
  { you: [up(QA)], them: [up(QB)], counts: [27, 25], title: "Two Queens. That's War!", banner: "WAR! 10 cards at stake", press: "Flip for the War", ms: 3500 },
  { you: [up(QA), ...MINE_DOWN.map(down), up(ACE)], them: [up(QB), ...THEIRS_DOWN.map(down), up(NINE)], counts: [27, 25], title: "Three down, one up: Ace beats 9", ms: 2500 },
  {
    you: [up(QA), ...MINE_DOWN.map(up), up(ACE)],
    them: [up(QB), ...THEIRS_DOWN.map(up), up(NINE)],
    counts: [32, 20],
    title: "All ten are yours, and there was an Ace in their bounty",
    ms: 0,
  },
];

function DemoStack({ cards: list }: { cards: { card: Card; up: boolean }[] }) {
  return (
    <div className="flex min-h-24 items-center">
      {list.length === 0 && <div className="h-20 w-14 rounded-lg border border-dashed border-bone/25" />}
      {list.map(({ card, up: faceUp }, i) => (
        <div key={i} className={clsx(i > 0 && (i < list.length - 1 ? "-ml-10 -translate-y-1.5" : "-ml-5"))}>
          <PlayingCard card={card} faceUp={faceUp} size="md" />
        </div>
      ))}
    </div>
  );
}

function Demo({ onExit }: { onExit: () => void }) {
  const { step, last, next, restart, progress } = useDemoSteps(DEMO);
  const s = DEMO[step];
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => primaryRef.current?.focus(), [step]);
  const share = (s.counts[0] / (s.counts[0] + s.counts[1])) * 100;

  return (
    <div>
      <DemoBar progress={progress} onExit={onExit} />
      <h3 aria-live="polite" className="mt-5 font-display text-4xl font-extrabold text-bone">
        {s.title}
      </h3>

      <div className="mt-5 flex items-center gap-3 text-sm font-bold text-bone">
        <span>
          You <span className="font-display text-xl text-brass-lit tabular-nums">{s.counts[0]}</span>
        </span>
        <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-leather">
          <div className="absolute inset-y-0 left-0 rounded-full bg-brass transition-[width] duration-500" style={{ width: `${share}%` }} />
        </div>
        <span>
          <span className="font-display text-xl text-parchment tabular-nums">{s.counts[1]}</span> Them
        </span>
      </div>

      <div className="felt mt-4 flex flex-col items-center gap-4 rounded-[2.5rem] px-4 py-6">
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-12">
          <DemoStack cards={s.you} />
          <DemoStack cards={s.them} />
        </div>
        <div className="flex min-h-11 items-center">
          {s.banner && <p className="rounded-full bg-chip px-5 py-1 font-display text-2xl font-extrabold text-bone">{s.banner}</p>}
        </div>
      </div>

      <div className="mt-6 flex min-h-14 flex-wrap items-center gap-3">
        {s.press && (
          <button
            ref={primaryRef}
            onClick={next}
            className={clsx("min-h-14 rounded-full px-8 font-display text-2xl font-bold", s.banner ? "bg-chip text-bone hover:bg-chip/85" : "bg-brass text-smoke hover:bg-brass-lit")}
          >
            {s.press}
          </button>
        )}
        {last && (
          <>
            <Link href="/war" className="flex min-h-12 items-center rounded-full bg-brass px-7 font-display text-2xl font-bold text-smoke hover:bg-brass-lit">
              Play War
            </Link>
            <button ref={primaryRef} onClick={restart} className="min-h-12 rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone">
              Replay
            </button>
          </>
        )}
      </div>
    </div>
  );
}
