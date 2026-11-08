"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { Bomb } from "lucide-react";
import type { Card } from "@/types/cards";
import { RoomLink } from "@/components/ui/RoomTransition";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { Segmented } from "@/components/ui/controls";
import { cards } from "@/components/rules/sample-cards";
import { DemoBar, HowToDialog, Panel, Tips } from "@/components/rules/HowToDialog";
import { playBombImpact } from "@/lib/sound-effects";
import { BombTable } from "./BombSheet";

/** Thirteen's rules (climbing, Jokers, the bomb ladder) and a three-step demo of a bomb beating a 2. */
export function ThirteenHowTo({ onClose }: { onClose: () => void }) {
  return <HowToDialog title="How to play Thirteen" guide={(showDemo) => <Guide onDemo={showDemo} />} demo={(exit) => <Demo onExit={exit} />} onClose={onClose} />;
}

/** "9S 9D X": cards for the examples, X a Joker. */
function hand(spec: string): Card[] {
  let n = 0;
  return spec
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((t) => (t === "X" ? [{ id: `JK${++n}`, kind: "joker" as const }] : cards(t)));
}

/** A few small cards, overlapped; Jokers can say what they stand for. */
function Mini({ spec, as = {} }: { spec: string; as?: Record<string, string> }) {
  return (
    <div className="flex shrink-0 pb-2">
      {hand(spec).map((c, i) => (
        <div key={c.id} className={clsx(i > 0 && "-ml-5")}>
          <PlayingCard card={c} size="sm" wildAs={as[c.id]} entrance={false} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guide
// ---------------------------------------------------------------------------

type Topic = "climbing" | "jokers" | "bombs";

function Guide({ onDemo }: { onDemo: () => void }) {
  const [topic, setTopic] = useState<Topic>("climbing");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-md">
          <Segmented<Topic>
            label="Topic"
            value={topic}
            options={[
              { value: "climbing", label: "Climbing" },
              { value: "jokers", label: "Jokers" },
              { value: "bombs", label: "Bombs" },
            ]}
            onChange={setTopic}
          />
        </div>
        <button onClick={onDemo} className="min-h-11 rounded-full bg-brass px-5 text-base font-bold text-smoke hover:bg-brass-lit">
          Try the demo
        </button>
      </div>
      {topic === "climbing" ? <Climbing /> : topic === "jokers" ? <Jokers /> : <Bombs />}
    </div>
  );
}

const FOLLOWING = [
  "Play the same kind and size, but higher. A 4-card straight only answers a 4-card straight.",
  "Or pass. Passing sits you out until the trick is over.",
  "When everyone else has passed, whoever played last leads anything.",
  "Equal top cards? The suit of the top card decides.",
];

function Climbing() {
  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <Panel title="Get rid of your 18 cards" className="md:col-span-2">
        <p className="max-w-2xl text-base text-parchment">Three players, 54 cards with two Jokers. The first to empty their hand wins. 3 is the lowest card and 2 the highest.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-sm text-ash">Low</span>
          <Mini spec="3S 4S 5S 6S 7S 8S 9S TS JS QS KS AS 2S" />
          <span className="text-sm text-ash">High</span>
        </div>
        <p className="mt-2 text-base text-parchment">
          Suits break ties: <span className="font-bold text-bone">♠ ♣ <span className="text-card-red">♦ ♥</span></span>, lowest to highest.
        </p>
      </Panel>

      <Panel title="What you can play">
        <ul className="space-y-3 text-base text-parchment">
          {(
            [
              ["A single", "9D"],
              ["A pair", "8S 8H"],
              ["Three of a kind", "QS QH QD"],
              ["A straight, 3 to 11 cards", "6C 7H 8D 9S"],
            ] as const
          ).map(([label, spec]) => (
            <li key={label} className="flex items-center justify-between gap-3">
              {label}
              <Mini spec={spec} />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ash">2s never go in a straight.</p>
      </Panel>

      <Panel title="Following">
        <Tips items={FOLLOWING} />
      </Panel>

      <Panel title="Who starts" className="md:col-span-2">
        <p className="text-base text-parchment">
          The 3♠ opens the first hand, and the first play has to include it. After that, the last hand&apos;s winner leads whatever they like. The host can have the 3♠ open every hand.
        </p>
      </Panel>
    </div>
  );
}

function Jokers() {
  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <Panel title="Any card you need" className="md:col-span-2">
        <p className="max-w-2xl text-base text-parchment">A Joker stands in for one card, any rank, inside a play or a bomb. Pick your cards and the table reads the strongest play they make.</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Mini spec="JS QH KD X" as={{ JK1: "A" }} />
          <p className="max-w-sm text-base text-parchment">J, Q, K and a Joker read as a straight to the Ace. Want 10 to K instead? Switch it beside the Play button.</p>
        </div>
      </Panel>

      <Panel title="Bigger than four">
        <div className="flex flex-wrap items-center gap-3">
          <Mini spec="7S 7C 7D 7H X" as={{ JK1: "7" }} />
        </div>
        <p className="mt-3 text-base text-parchment">With Jokers you can hold five or six of a kind, even five 2s. Two Jokers and a pair already make four of a kind.</p>
      </Panel>

      <Panel title="Ties">
        <p className="text-base text-parchment">A Joker at the top of a play counts below every real suit, so a natural card wins a tie against it.</p>
      </Panel>
    </div>
  );
}

function Bombs() {
  return (
    <div className="grid items-start gap-4">
      <Panel title="Bombs beat 2s">
        <Tips
          items={[
            "A bomb only comes down on 2s or on a weaker bomb. It can lead an empty table too.",
            "Each bomb beats up to a set number of 2s: a single 2, a pair, three…",
            "A higher tier always wins. Same tier: the higher top card.",
            "Same tier and rank: the house rule decides (by default, no Jokers wins).",
            "Passed this trick? You can still bomb back in, unless the host turns it off.",
            "Runs in bombs go 3 to Ace, like straights: no 2s.",
          ]}
        />
      </Panel>
      <Panel title="All seventeen">
        <BombTable />
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo: a 2 goes down → you beat it with four 9s (one a Joker) → a tier 3 bomb tops yours
// ---------------------------------------------------------------------------

const YOUR_HAND = hand("4C 6D 9S 9D 9H JH KS X");
const QUAD = YOUR_HAND.filter((c) => c.id.startsWith("9") || c.kind === "joker").map((c) => c.id);
const TWO = hand("2S");
const IVY = hand("3S 3H 3D 4S 4H 4D");

function Demo({ onExit }: { onExit: () => void }) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const shake = useAnimationControls();
  const reduceMotion = useReducedMotion();
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => primaryRef.current?.focus(), [step, picked.length]);

  const land = (tier: number) => {
    playBombImpact(tier);
    if (!reduceMotion) void shake.start({ x: [0, -7, 6, -4, 2, 0], transition: { duration: 0.45 } });
  };
  const chop = () => {
    setStep(1);
    land(2);
  };
  const counter = () => {
    setStep(2);
    land(3);
  };
  const restart = () => {
    setStep(0);
    setPicked([]);
  };

  const ready = picked.length === QUAD.length;
  const title = ["Shark Vinnie plays a 2♠", "Your four 9s beat the 2", "Ice Cold Ivy tops it with 333 444"][step];
  const hint = [
    ready ? "Tier 2 · Four 9s · beats one 2" : "Tap the bomb above your hand.",
    "Three 9s and a Joker make four of a kind: a tier 2 bomb.",
    "Two triples in a row is tier 3. A higher tier always wins, whatever the cards.",
  ][step];
  const table = step === 0 ? { cards: TWO, as: {}, by: "Shark Vinnie" } : step === 1 ? { cards: YOUR_HAND.filter((c) => QUAD.includes(c.id)), as: { JK1: "9♣" }, by: "You" } : { cards: IVY, as: {}, by: "Ice Cold Ivy" };

  return (
    <div>
      <DemoBar progress={step / 2} onExit={onExit} />
      <h3 aria-live="polite" className="mt-5 font-display text-4xl font-extrabold text-bone">
        {title}
      </h3>
      <p className="mt-1 text-base text-parchment">{hint}</p>

      <motion.div animate={shake} className="felt relative mt-4 flex flex-col items-center gap-5 rounded-[2.5rem] px-4 py-6">
        <div className="relative grid min-h-36 place-items-center pt-8">
          <AnimatePresence>
            {step > 0 && (
              <motion.div
                key={step}
                aria-hidden
                className="pointer-events-none absolute -inset-x-16 -inset-y-6 rounded-full"
                style={{ background: "radial-gradient(closest-side, rgba(200, 16, 46, 0.3), rgba(214, 182, 127, 0.1) 55%, transparent)" }}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: [0, 1, 0.5] }}
                transition={{ duration: 1.4 }}
              />
            )}
          </AnimatePresence>
          <motion.div key={step} className="relative flex" initial={step > 0 ? { y: -36, scale: 1.12, opacity: 0 } : { opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 520, damping: 22 }}>
            {table.cards.map((c, i) => (
              <div key={c.id} className={clsx(i > 0 && "-ml-6")}>
                <PlayingCard card={c} size="md" wildAs={(table.as as Record<string, string>)[c.id]} entrance={false} />
              </div>
            ))}
          </motion.div>
          <AnimatePresence>
            {step > 0 && (
              <motion.span
                key={step}
                className="absolute -top-3 rounded-full bg-chip px-5 py-0.5 font-display text-3xl font-extrabold text-bone shadow-[0_6px_30px_rgba(200,16,46,0.45)]"
                initial={{ opacity: 0, scale: 1.3 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 20 }}
              >
                Bomb!
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <p className="text-sm text-bone">{table.by}</p>

        {step === 0 && (
          <div className="flex flex-col items-center gap-3">
            <button
              ref={ready ? undefined : primaryRef}
              onClick={() => setPicked(ready ? [] : QUAD)}
              aria-pressed={ready}
              className={clsx("flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition", ready ? "bg-bone text-smoke" : "bg-black/25 text-bone ring-2 ring-brass-lit")}
            >
              <Bomb className="size-4" aria-hidden />
              <span className="font-display text-base">Tier 2</span>
              <span className="font-normal">Four 9s</span>
            </button>
            <div className="flex pl-6">
              {YOUR_HAND.map((c) => (
                <motion.div key={c.id} className="-ml-6" animate={{ y: picked.includes(c.id) ? -16 : 0 }}>
                  <PlayingCard card={c} size="md" entrance={false} />
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      <div className="mt-6 flex min-h-14 flex-wrap items-center gap-3">
        {step === 0 && (
          <button ref={ready ? primaryRef : undefined} onClick={chop} disabled={!ready} className="min-h-14 rounded-full bg-chip px-8 font-display text-2xl font-bold text-bone hover:bg-chip/85 disabled:opacity-40">
            Play
          </button>
        )}
        {step === 1 && (
          <button ref={primaryRef} onClick={counter} className="min-h-14 rounded-full bg-brass px-8 font-display text-2xl font-bold text-smoke hover:bg-brass-lit">
            Next
          </button>
        )}
        {step === 2 && (
          <>
            <RoomLink href="/thirteen/local" className="flex min-h-12 items-center rounded-full bg-brass px-7 font-display text-2xl font-bold text-smoke hover:bg-brass-lit">
              Play against bots
            </RoomLink>
            <RoomLink href="/thirteen" className="flex min-h-12 items-center rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone">
              Play Thirteen
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
