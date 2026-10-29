"use client";

import { useEffect, useRef } from "react";
import { RoomLink } from "@/components/ui/RoomTransition";
import clsx from "clsx";
import { bestHand } from "@/lib/holdem-hand";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { cards } from "@/components/rules/sample-cards";
import { DemoBar, HowToDialog, Panel, Tips, useDemoSteps } from "@/components/rules/HowToDialog";
import { HandRankingsList } from "./HandRankings";

/** Texas Hold'em's rules guide and quick demo. */
export function HoldemHowTo({ onClose }: { onClose: () => void }) {
  return <HowToDialog title="How to play Texas Hold'em" guide={(showDemo) => <Guide onDemo={showDemo} />} demo={(exit) => <Demo onExit={exit} />} onClose={onClose} />;
}

// ---------------------------------------------------------------------------
// Guide
// ---------------------------------------------------------------------------

const STREETS = [
  { name: "Blinds", what: "The two players left of the button put in forced bets, so there's something to win." },
  { name: "Preflop", what: "Two cards each, face down. First round of betting." },
  { name: "Flop", what: "Three cards face up in the middle, shared by everyone. Betting." },
  { name: "Turn", what: "A fourth shared card. Betting." },
  { name: "River", what: "The fifth and last. Final betting." },
  { name: "Showdown", what: "Best five cards out of your two and the five on the board win the pot." },
];

const MOVES = [
  { move: "Fold", what: "Give up the hand and what you've put in." },
  { move: "Check", what: "Pass, when nobody has bet." },
  { move: "Call", what: "Match the bet." },
  { move: "Raise", what: "Bet more than everyone else. No limit: any amount up to your chips." },
  { move: "All in", what: "Every chip you have." },
];

const TIPS = [
  "Big pairs and Ace-King are the best starts: raise them.",
  "Play fewer hands early, more near the button, where you act last.",
  "Raise or fold before the flop more often than you call.",
  "Fold weak unsuited hands like King-4 or 9-3.",
  "Suited cards next to each other, like 9♠ 8♠, can win big pots cheaply.",
  "Four cards to a flush or straight on the board should slow you down.",
];

function Guide({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <Panel title="Win the pot" className="md:col-span-2">
        <p className="text-base text-parchment">
          Make the best five-card hand from your two cards and the five shared ones, or bet so that everyone else folds. Lose all your chips and you&apos;re out; the last player with chips wins.
        </p>
        <button onClick={onDemo} className="mt-4 min-h-11 rounded-full bg-brass px-5 text-base font-bold text-smoke hover:bg-brass-lit">
          Watch the 20-second demo
        </button>
      </Panel>

      <Panel title="A hand, step by step">
        <ol className="space-y-2.5">
          {STREETS.map((s, i) => (
            <li key={s.name} className="flex gap-3">
              <span className="w-5 shrink-0 font-display text-xl font-bold text-brass-lit tabular-nums">{i + 1}</span>
              <span className="text-base text-parchment">
                <span className="font-bold text-bone">{s.name}.</span> {s.what}
              </span>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Hand rankings">
        <HandRankingsList />
      </Panel>

      <Panel title="Your moves">
        <dl className="space-y-2">
          {MOVES.map((m) => (
            <div key={m.move} className="flex gap-3">
              <dt className="w-20 shrink-0 font-display text-xl font-bold text-bone">{m.move}</dt>
              <dd className="text-base text-parchment">{m.what}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="Ties and side pots">
        <p className="text-base text-parchment">
          Equal hands split the pot. A player who&apos;s all in can only win what they matched from each opponent; bets beyond that go to a side pot the others play for.
        </p>
      </Panel>

      <Panel title="Starting hands" className="md:col-span-2">
        <Tips items={TIPS} />
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo: blinds → call a raise → flop → call → turn → bet → showdown
// ---------------------------------------------------------------------------

const YOU = cards("AH QH");
const AVA = cards("KD QD");
const BOARD = cards("QC 7D 2H AC 5S");
const at = (shown: number) => bestHand([...YOU, ...BOARD.slice(0, shown)]).label;
const POT = 580;

interface DemoStep {
  board: number;
  pot: number;
  title: string;
  /** What you do to move on (the demo also moves on by itself). */
  press?: string;
  showdown?: boolean;
  ms: number;
}

const STEPS: DemoStep[] = [
  { board: 0, pot: 30, title: "Blinds in, two cards each", ms: 3000 },
  { board: 0, pot: 80, title: "Ava raises to 60. Ace-Queen of hearts is worth a call", press: "Call 40", ms: 4000 },
  { board: 3, pot: 120, title: `The flop gives you a ${at(3).toLowerCase()}`, ms: 3000 },
  { board: 3, pot: 200, title: "Ava bets 80. You have top pair: call", press: "Call 80", ms: 4000 },
  { board: 4, pot: 280, title: `The turn: ${at(4).toLowerCase()}. Ava checks, so bet`, press: "Bet 150", ms: 4000 },
  { board: 5, pot: POT, title: "Ava calls. The river, and you both check", ms: 3000 },
  { board: 5, pot: POT, title: `Two pair beats Ava's pair. You win ${POT}`, showdown: true, ms: 0 },
];

function Demo({ onExit }: { onExit: () => void }) {
  const { step, last, next, restart, progress } = useDemoSteps(STEPS);
  const s = STEPS[step];
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => primaryRef.current?.focus(), [step]);
  const yours = bestHand([...YOU, ...BOARD]);
  const winning = new Set(s.showdown ? yours.cards.map((c) => c.id) : []);

  return (
    <div>
      <DemoBar progress={progress} onExit={onExit} />

      <h3 aria-live="polite" className="mt-5 font-display text-4xl font-extrabold text-bone">
        {s.title}
      </h3>

      <div className="felt mt-6 flex flex-col items-center gap-5 rounded-[3rem] px-6 py-7">
        <DemoSeat name="Ava" hand={AVA} faceUp={!!s.showdown} label={s.showdown ? bestHand([...AVA, ...BOARD]).label : undefined} winning={winning} />
        <div className="flex flex-col items-center gap-2">
          <ul aria-label="Board" className="flex gap-1.5">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i}>
                {i < s.board ? (
                  <PlayingCard card={BOARD[i]} size="sm" dealDelay={s.board === 3 ? i * 0.12 : 0} highlight={winning.has(BOARD[i].id) ? "match" : null} dimmed={!!s.showdown && !winning.has(BOARD[i].id)} />
                ) : (
                  <div className="h-14 w-10 rounded-md border border-dashed border-bone/25" />
                )}
              </li>
            ))}
          </ul>
          <p className="font-display text-2xl font-extrabold text-bone tabular-nums">Pot {s.pot}</p>
        </div>
        <DemoSeat name="You" hand={YOU} faceUp label={s.showdown ? yours.label : undefined} winning={winning} won={!!s.showdown} />
      </div>

      <div className="mt-6 flex min-h-14 flex-wrap items-center gap-3">
        {s.press && (
          <button ref={primaryRef} onClick={next} className="min-h-14 rounded-full bg-brass px-8 font-display text-2xl font-bold text-smoke hover:bg-brass-lit">
            {s.press}
          </button>
        )}
        {last && (
          <>
            <RoomLink href="/texas-holdem" className="flex min-h-12 items-center rounded-full bg-brass px-7 font-display text-2xl font-bold text-smoke hover:bg-brass-lit">
              Play Texas Hold&apos;em
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

function DemoSeat({ name, hand, faceUp, label, winning, won }: { name: string; hand: typeof YOU; faceUp: boolean; label?: string; winning: Set<string>; won?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex">
        {hand.map((c, i) => (
          <div key={c.id} className={clsx(i > 0 && "-ml-4")}>
            <PlayingCard card={c} faceUp={faceUp} size="md" dealDelay={i * 0.15} highlight={winning.has(c.id) ? "match" : null} dimmed={winning.size > 0 && !winning.has(c.id)} />
          </div>
        ))}
      </div>
      <div className={clsx("flex flex-col rounded-2xl px-4 py-1.5", won ? "bg-leather ring-2 ring-brass-lit" : "bg-leather")}>
        <span className="text-base font-bold text-bone">{name}</span>
        {label && <span className="text-sm text-brass-lit">{label}</span>}
      </div>
    </div>
  );
}
