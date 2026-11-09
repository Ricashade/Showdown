"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import type { Card } from "@/types/cards";
import { fits } from "@/lib/speed-engine";
import { playCardFlip, playThud } from "@/lib/sound-effects";
import { RoomLink } from "@/components/ui/RoomTransition";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { cards } from "@/components/rules/sample-cards";
import { DemoBar, Fan, HowToDialog, Panel, Tips } from "@/components/rules/HowToDialog";

/** Speed's rules guide and a three-step reflex drill. */
export function SpeedHowTo({ onClose }: { onClose: () => void }) {
  return <HowToDialog title="How to play Speed" guide={(showDemo) => <Guide onDemo={showDemo} />} demo={(exit) => <Drill onExit={exit} />} demoLabel="Reflex drill" onClose={onClose} />;
}

// ---------------------------------------------------------------------------
// Guide
// ---------------------------------------------------------------------------

const CONTROLS = [
  "Click a card and it goes on whichever pile it fits (the left one if both).",
  "Keys 1 to 5 play the cards in your hand; hold Shift for the right pile.",
  "Space draws when your hand doesn't refill itself, and slaps Speed.",
  "F asks for new cards.",
];

function Guide({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <Panel title="No turns. Just go." className="md:col-span-2">
        <p className="max-w-2xl text-base text-parchment">
          Two players, both at once. You each get 20 cards: five in your hand, fifteen in your stock. Play cards onto the two piles in the middle as fast as you can; your hand refills from your stock. First to play every card wins.
        </p>
        <button onClick={onDemo} className="mt-4 min-h-11 rounded-full bg-brass px-5 text-base font-bold text-smoke hover:bg-brass-lit">
          Try the reflex drill
        </button>
      </Panel>

      <Panel title="One up or one down">
        <div className="flex flex-wrap items-center gap-3">
          <Fan spec="8D" />
          <span className="text-sm text-ash">on</span>
          <Fan spec="7S" />
          <span className="text-sm text-ash">or</span>
          <Fan spec="6H" />
        </div>
        <p className="mt-3 text-base text-parchment">Suits don&apos;t matter. The ends wrap round: King, Ace and 2 all follow on.</p>
        <div className="mt-2">
          <Fan spec="QS KH AD 2C 3S" />
        </div>
      </Panel>

      <Panel title="Stuck?">
        <p className="text-base text-parchment">
          When neither of you can go, a card turns over from each spare pile onto the middle by itself. You can both ask for new cards sooner, too. Spares run out? The piles are shuffled into new ones.
        </p>
      </Panel>

      <Panel title="House rules">
        <Tips
          items={[
            "Same rank: an 8 can go on an 8 (on unless the host turns it off).",
            "Doubles: two to four of a rank go down in one move.",
            "Slap Speed: out of cards, you still have to slap Speed first. Get beaten to it and you take back the smaller pile.",
            "Or draw from your stock yourself instead of a hand that refills.",
          ]}
        />
      </Panel>

      <Panel title="Fast hands">
        <Tips items={CONTROLS} />
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drill: chain 8-9-10 onto a 7 → an Ace on the King → stuck, flip new cards
// ---------------------------------------------------------------------------

const HAND = cards("8D 9C TS AH 4C");
/** What turns up in each emptied slot, in order. */
const REFILL = cards("6D QS 7H 3S");
const NEW_TOPS = cards("5D JC");
const tiltOf = (i: number) => [-5, 4, -2, 6, -4, 3][i % 6];

type Step = "chain" | "wrap" | "stuck" | "done";

function Drill({ onExit }: { onExit: () => void }) {
  const [step, setStep] = useState<Step>("chain");
  const [hand, setHand] = useState<(Card | null)[]>(HAND);
  const [piles, setPiles] = useState<[Card[], Card[]]>([cards("7S"), cards("KH")]);
  const [refills, setRefills] = useState(0);
  const [miss, setMiss] = useState<{ slot: number; id: number } | null>(null);
  const [chain, setChain] = useState(0);
  const reduceMotion = useReducedMotion();
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => primaryRef.current?.focus(), [step]);

  const restart = () => {
    setStep("chain");
    setHand(HAND);
    setPiles([cards("7S"), cards("KH")]);
    setRefills(0);
    setChain(0);
  };

  const tap = (slot: number) => {
    const card = hand[slot];
    if (!card) return;
    // The drill wants the run on the left first, then the Ace on the King.
    const pile = step === "chain" ? 0 : step === "wrap" ? 1 : null;
    const wanted = step === "chain" ? ["8D", "9C", "TS"].includes(card.id) : step === "wrap" && card.id === "AH";
    if (pile === null || !wanted || !fits(card, piles[pile].at(-1)!, false)) {
      playThud();
      setMiss({ slot, id: Date.now() });
      return;
    }
    const next = [...hand];
    next[slot] = REFILL[refills] ?? null;
    setHand(next);
    setRefills((n) => n + 1);
    setPiles((p) => (pile === 0 ? [[...p[0], card], p[1]] : [p[0], [...p[1], card]]));
    const run = step === "chain" ? chain + 1 : 0;
    setChain(run);
    playCardFlip(run);
    if (step === "chain" && run === 3) setTimeout(() => setStep("wrap"), 900);
    if (step === "wrap") setTimeout(() => setStep("stuck"), 700);
  };

  const flip = () => {
    setPiles((p) => [
      [...p[0], NEW_TOPS[0]],
      [...p[1], NEW_TOPS[1]],
    ]);
    playCardFlip(0);
    setStep("done");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = /^Digit([1-5])$/.exec(e.code);
      if (d) tap(Number(d[1]) - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const title = { chain: "Chain 8, 9, 10 onto the 7", wrap: "Now the Ace on the King", stuck: "Nobody can go", done: "Fresh tops: keep going" }[step];
  const hint = {
    chain: "Click them fast, or press 1, 2, 3. Each one goes on the card before it.",
    wrap: "Kings wrap round to Aces, and Aces to 2s.",
    stuck: "Nothing in your hand fits a 10 or an Ace. Flip new cards from the spares.",
    done: "Your 4 fits the 5, and your Queen fits the Jack.",
  }[step];
  const progress = { chain: 0, wrap: 1 / 3, stuck: 2 / 3, done: 1 }[step];

  return (
    <div>
      <DemoBar progress={progress} onExit={onExit} />
      <h3 aria-live="polite" className="mt-5 font-display text-4xl font-extrabold text-bone">
        {title}
      </h3>
      <p className="mt-1 text-base text-parchment">{hint}</p>

      <div className="felt mt-4 flex flex-col items-center gap-6 rounded-[2.5rem] px-4 py-7">
        <div className="relative flex items-center gap-4 sm:gap-8">
          <DrillSpare count={step === "done" ? 4 : 5} />
          {piles.map((pile, i) => (
            <div key={i} className="relative h-20 w-14">
              {pile.slice(-3).map((c) => (
                <motion.div
                  key={c.id}
                  className="absolute inset-0"
                  initial={pile.length > 1 ? { y: NEW_TOPS.includes(c) ? 0 : 120, x: NEW_TOPS.includes(c) ? (i === 0 ? -80 : 80) : 0, opacity: 0.6, rotate: 12 } : false}
                  animate={{ y: 0, x: 0, opacity: 1, rotate: tiltOf(pile.indexOf(c)) }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                >
                  <PlayingCard card={c} size="md" entrance={false} />
                </motion.div>
              ))}
            </div>
          ))}
          <DrillSpare count={step === "done" ? 4 : 5} />
          <AnimatePresence>
            {step === "wrap" && chain === 3 && (
              <motion.span
                className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-full bg-brass px-3 font-display text-lg font-bold whitespace-nowrap text-smoke"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
              >
                3 in a row
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {step === "stuck" && (
          <button ref={primaryRef} onClick={flip} className="flex min-h-11 items-center gap-2 rounded-full bg-black/25 px-4 text-sm font-bold text-bone ring-2 ring-brass-lit">
            <RefreshCw className="size-4" aria-hidden /> Flip new cards
          </button>
        )}

        <ul aria-label="Your hand" className="flex gap-1.5 sm:gap-2">
          {hand.map((c, i) => (
            <li key={i} className="flex flex-col items-center gap-1">
              {c ? (
                <motion.button
                  key={c.id}
                  onClick={() => tap(i)}
                  disabled={step === "stuck" || step === "done"}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  whileTap={{ scale: 0.94 }}
                  className="block rounded-xl"
                >
                  <motion.span key={miss?.slot === i ? miss.id : "still"} className="block" animate={miss?.slot === i && !reduceMotion ? { x: [0, -7, 6, -4, 0] } : undefined} transition={{ duration: 0.32 }}>
                    <PlayingCard card={c} size="md" entrance={false} />
                  </motion.span>
                </motion.button>
              ) : (
                <div className="h-20 w-14 rounded-lg border border-dashed border-bone/15" />
              )}
              <kbd className="font-display text-sm text-ash">{i + 1}</kbd>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 flex min-h-14 flex-wrap items-center gap-3">
        {step === "done" && (
          <>
            <RoomLink href="/speed/local" className={clsx("flex min-h-12 items-center rounded-full bg-brass px-7 font-display text-2xl font-bold text-smoke hover:bg-brass-lit")}>
              Play against a bot
            </RoomLink>
            <RoomLink href="/speed" className="flex min-h-12 items-center rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone">
              Play Speed
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

function DrillSpare({ count }: { count: number }) {
  return (
    <div className="flex flex-col items-center gap-1" role="img" aria-label={`Spare pile, ${count} cards`}>
      <div className="relative h-14 w-10">
        <div className="card-back absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-md ring-1 ring-black/40" />
        <div className="card-back absolute inset-0 rounded-md shadow-md ring-1 ring-black/40" />
      </div>
      <span className="font-display text-sm text-bone tabular-nums">{count}</span>
    </div>
  );
}
