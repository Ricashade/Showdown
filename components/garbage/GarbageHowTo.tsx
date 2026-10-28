"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { Card } from "@/types/cards";
import { slotLabel } from "@/lib/garbage-engine";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { cards } from "@/components/rules/sample-cards";
import { DemoBar, Fan, HowToDialog, Panel, useDemoSteps } from "@/components/rules/HowToDialog";

/** Garbage's rules guide and quick demo. */
export function GarbageHowTo({ onClose }: { onClose: () => void }) {
  return <HowToDialog title="How to play Garbage" guide={(showDemo) => <Guide onDemo={showDemo} />} demo={(exit) => <Demo onExit={exit} />} onClose={onClose} />;
}

// ---------------------------------------------------------------------------
// Guide
// ---------------------------------------------------------------------------

function MiniGrid({ filled = {} }: { filled?: Record<number, string> }) {
  return (
    <ol className="grid w-max grid-cols-5 gap-1">
      {Array.from({ length: 10 }, (_, i) => (
        <li key={i} className="flex flex-col items-center gap-0.5">
          {filled[i] ? <PlayingCard card={cards(filled[i])[0]} size="sm" entrance={false} /> : <PlayingCard card={null} faceUp={false} size="sm" entrance={false} />}
          <span className="font-display text-xs font-bold text-bone">{slotLabel(i)}</span>
        </li>
      ))}
    </ol>
  );
}

const STEPS = [
  "Draw from the stock, or take the top discard if you can play it.",
  "Put a number in its own slot: Ace in A, 7 in 7.",
  "Pick up the face-down card that was there. That's your next card.",
  "Keep going until you hold a card you can't use. Throw it on the discard pile; your turn ends.",
];

function Guide({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <Panel title="Clear your board" className="md:col-span-2">
        <div className="flex flex-wrap items-center gap-6">
          <MiniGrid filled={{ 0: "AS", 3: "4D", 6: "QH" }} />
          <ul className="max-w-sm space-y-1.5 text-base text-parchment">
            <li>Ten face-down cards: Ace to 5 on top, 6 to 10 below.</li>
            <li>Turn them all face up and you win the round.</li>
            <li>Once someone clears their board, everyone else gets one last turn. Then they turn their cards over and can rearrange them: fill every slot that way and you clear it too.</li>
            <li>Each round you clear, you play with one fewer slot. Clear a one-card board to win the game.</li>
          </ul>
        </div>
        <button onClick={onDemo} className="mt-5 min-h-11 rounded-full bg-brass px-5 text-base font-bold text-smoke hover:bg-brass-lit">
          Watch the 20-second demo
        </button>
      </Panel>

      <Panel title="Chain reaction">
        <ol className="space-y-2.5">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-3 text-base text-parchment">
              <span className="w-4 shrink-0 font-display text-xl font-bold text-brass-lit">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Wild and garbage">
        <ul className="space-y-3">
          <li className="flex items-center justify-between gap-3">
            <Fan spec="QH KS" />
            <span className="text-right text-base text-bone">
              Wild
              <span className="block text-sm text-ash">Any face-down slot</span>
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <Fan spec="JD" />
            <span className="text-right text-base text-bone">
              Garbage
              <span className="block text-sm text-ash">Ends your turn</span>
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <Fan spec="4C 9H" />
            <span className="text-right text-base text-bone">
              Also garbage
              <span className="block text-sm text-ash">A slot you&apos;ve filled, or one you don&apos;t have</span>
            </span>
          </li>
        </ul>
        <p className="mt-3 text-sm text-ash">The host can make Jacks wild instead, or pick each face card.</p>
      </Panel>

      <Panel title="Bumping a wild" className="md:col-span-2">
        <div className="flex flex-wrap items-center gap-4">
          <Fan spec="QH" />
          <span aria-hidden className="text-2xl text-brass-lit">→</span>
          <Fan spec="5S" />
          <p className="max-w-md text-base text-parchment">
            Got the real 5 while a wild sits in slot 5? Put the 5 in and pick the wild back up. Then use it on another face-down slot.
          </p>
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo: draw a 4 → slot 4 → flip a Queen → slot 7 → flip a Jack → discard
// ---------------------------------------------------------------------------

const [FOUR, QUEEN, JACK] = cards("4S QH JD");

interface DemoStep {
  hand: Card | null;
  /** Face-up cards on the board by slot. */
  board: Record<number, Card>;
  /** The slot to tap next, if any. */
  target?: number;
  title: string;
  press?: string;
  discarded?: boolean;
  ms: number;
}

const DEMO: DemoStep[] = [
  { hand: null, board: {}, title: "Your turn: draw from the stock", press: "Draw", ms: 3000 },
  { hand: FOUR, board: {}, target: 3, title: "A 4. It goes in slot 4", press: "Place in slot 4", ms: 4000 },
  { hand: QUEEN, board: { 3: FOUR }, title: "Under it: a Queen, and Queens are wild", ms: 3000 },
  { hand: QUEEN, board: { 3: FOUR }, target: 6, title: "A wild fits any face-down slot. Try 7", press: "Place in slot 7", ms: 4000 },
  { hand: JACK, board: { 3: FOUR, 6: QUEEN }, title: "A Jack: garbage. Nowhere to put it", press: "Discard", ms: 3500 },
  { hand: null, board: { 3: FOUR, 6: QUEEN }, discarded: true, title: "Turn over: two slots filled in one go", ms: 0 },
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
        <div className="flex items-end gap-6">
          <div className="flex flex-col items-center gap-1">
            <div className="card-back h-20 w-14 rounded-lg shadow-md ring-1 ring-black/40" />
            <span className="text-xs text-bone">Stock</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="grid h-20 w-14 place-items-center rounded-lg border border-dashed border-bone/30">
              {s.hand && <PlayingCard key={s.hand.id} card={s.hand} size="md" entrance={false} startFaceDown revealDelay={0.1} isWild={s.hand === QUEEN} />}
            </div>
            <span className="text-xs text-bone">In hand</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className={clsx("grid h-20 w-14 place-items-center rounded-lg border border-dashed border-bone/30", s.press === "Discard" && "ring-3 ring-chip-lit")}>
              {s.discarded && <PlayingCard card={JACK} size="md" />}
            </div>
            <span className="text-xs text-bone">Discard</span>
          </div>
        </div>

        <ol className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {Array.from({ length: 10 }, (_, i) => {
            const shown = s.board[i];
            const target = s.target === i;
            return (
              <li key={i} className="flex flex-col items-center gap-1">
                <button
                  onClick={target ? next : undefined}
                  disabled={!target}
                  aria-label={`Slot ${slotLabel(i)}${shown ? `, ${shown.id}` : ", face down"}`}
                  className={clsx("rounded-lg transition", target && "ring-3 ring-brass-lit shadow-[0_0_18px_rgba(214,182,127,0.75)]")}
                >
                  <PlayingCard key={shown ? shown.id : `down-${i}`} card={shown ?? null} faceUp={!!shown} size="md" isWild={shown === QUEEN} />
                </button>
                <span className={clsx("font-display text-sm font-bold", target ? "text-brass-lit" : "text-bone")}>{slotLabel(i)}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-6 flex min-h-14 flex-wrap items-center gap-3">
        {s.press && (
          <button
            ref={primaryRef}
            onClick={next}
            className={clsx(
              "min-h-14 rounded-full px-8 font-display text-2xl font-bold",
              s.press === "Discard" ? "bg-chip text-bone hover:bg-chip/85" : "bg-brass text-smoke hover:bg-brass-lit",
            )}
          >
            {s.press}
          </button>
        )}
        {last && (
          <>
            <Link href="/garbage" className="flex min-h-12 items-center rounded-full bg-brass px-7 font-display text-2xl font-bold text-smoke hover:bg-brass-lit">
              Play Garbage
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
