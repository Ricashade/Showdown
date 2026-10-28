"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import type { Card } from "@/types/cards";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { cards } from "@/components/rules/sample-cards";
import { Fan, HowToDialog, Panel } from "@/components/rules/HowToDialog";

/** Go Fish's rules and a click-through lesson for a first game. */
export function GoFishHowTo({ onClose }: { onClose: () => void }) {
  return (
    <HowToDialog
      title="Learn to play Go Fish"
      demoLabel="Interactive lesson"
      guide={(showDemo) => <Guide onLesson={showDemo} />}
      demo={(exit) => <Lesson onExit={exit} />}
      onClose={onClose}
    />
  );
}

const VS_BOTS = "/go-fish/local?bots=1";

// ---------------------------------------------------------------------------
// Guide
// ---------------------------------------------------------------------------

function Guide({ onLesson }: { onLesson: () => void }) {
  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <Panel title="Collect books" className="md:col-span-2">
        <div className="flex flex-wrap items-center gap-5">
          <Fan spec="TS TH TD TC" />
          <p className="max-w-md text-base text-parchment">
            A book is all four cards of one rank. It goes down in front of you for a point. When all 13 books are made, whoever has the most wins.
          </p>
        </div>
        <button onClick={onLesson} className="mt-5 min-h-12 rounded-full bg-brass px-6 font-display text-xl font-bold text-smoke hover:bg-brass-lit">
          Try the interactive lesson
        </button>
      </Panel>

      <Panel title="The golden rule">
        <div className="flex items-center gap-4">
          <Fan spec="8S" />
          <p className="text-base text-parchment">
            You can only ask for a rank you already hold. Holding an 8? You may ask anyone for 8s. The table only lets you pick ranks in your hand.
          </p>
        </div>
      </Panel>

      <Panel title="Your turn">
        <ol className="space-y-2.5 text-base text-parchment">
          <li className="flex gap-3">
            <span className="w-4 shrink-0 font-display text-xl font-bold text-brass-lit">1</span>
            Pick a player, then a rank from your hand.
          </li>
          <li className="flex gap-3">
            <span className="w-4 shrink-0 font-display text-xl font-bold text-brass-lit">2</span>
            They have some? They hand over every one, and you go again.
          </li>
          <li className="flex gap-3">
            <span className="w-4 shrink-0 font-display text-xl font-bold text-brass-lit">3</span>
            They don&apos;t? &ldquo;Go fish!&rdquo; Draw one card from the pond and your turn ends, unless you drew the rank you asked for. That&apos;s a lucky catch: go again.
          </li>
        </ol>
      </Panel>

      <Panel title="Use your memory">
        <p className="text-base text-parchment">
          Whoever asks for a rank must hold it. If Clara asks for Kings and goes fishing, she still has a King: ask her for it on your turn. The memory helper marks what each player is known to hold.
        </p>
      </Panel>

      <Panel title="Out of cards?">
        <p className="text-base text-parchment">
          Give away your last card, or book it, and you draw from the pond straight away so you can keep asking. Once the pond is empty, a player with no cards sits out.
        </p>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The lesson: steal 10s from Clara for a book, go again, go fish, then how it ends
// ---------------------------------------------------------------------------

type Step = "pickClara" | "pickTens" | "askClara" | "booked" | "pickBenny" | "pickAce" | "askBenny" | "fish" | "drew" | "end";

const STEPS: Step[] = ["pickClara", "pickTens", "askClara", "booked", "pickBenny", "pickAce", "askBenny", "fish", "drew", "end"];

const [T1, T2, ACE, T3, T4, SEVEN] = cards("TS TH AD TD TC 7C");

const COPY: Record<Step, { title: string; body: string }> = {
  pickClara: { title: "Your first ask", body: "Last turn Clara asked for 10s, so she must hold some. You have two 10s too. Click Clara." },
  pickTens: { title: "Now pick the rank", body: "Click your 10s. You can only ask for a rank you already hold." },
  askClara: { title: "Ask her", body: "Clara is picked and so are your 10s." },
  booked: { title: "A book of four 10s!", body: "Clara had to hand over both her 10s. With all four, they go down as a book: +1 point. And a steal means you go again." },
  pickBenny: { title: "Go again", body: "Try Benny this time: click Benny." },
  pickAce: { title: "Ask for Aces", body: "Click your Ace." },
  askBenny: { title: "Ask him", body: "Benny is picked, and so is your Ace." },
  fish: { title: "Go fish!", body: "Benny has no Aces. Click the pond to draw a card." },
  drew: { title: "You drew a 7", body: "Not an Ace, so your turn ends. If you'd drawn the Ace you asked for, that's a lucky catch, and you'd go again." },
  end: {
    title: "How it ends",
    body: "Run out of cards and you draw one from the pond to keep going. When all 13 books are down, whoever has the most wins. Here, that's you.",
  },
};

function Lesson({ onExit }: { onExit: () => void }) {
  const [step, setStep] = useState<Step>("pickClara");
  const at = STEPS.indexOf(step);
  const past = (s: Step) => at >= STEPS.indexOf(s);
  const next = () => setStep(STEPS[Math.min(at + 1, STEPS.length - 1)]);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  // Each step's instructions come back into view; then focus the step's button without scrolling away.
  useEffect(() => {
    copyRef.current?.scrollIntoView({ block: "nearest" });
    primaryRef.current?.focus({ preventScroll: true });
  }, [step]);

  const hand: Card[] = past("drew") ? [ACE, SEVEN] : past("booked") ? [ACE] : [T1, T2, ACE];
  const books = past("booked") ? [cards("TS TH TD TC")] : [];
  const target = step === "askClara" || step === "pickTens" ? "clara" : step === "pickAce" || step === "askBenny" ? "benny" : null;
  const rank = step === "askClara" ? "10" : step === "askBenny" ? "A" : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 gap-1" aria-label={`Step ${at + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span key={s} className={clsx("h-1.5 flex-1 rounded-full", i <= at ? "bg-brass" : "bg-smoke")} />
          ))}
        </div>
        <Link href={VS_BOTS} className="flex min-h-10 items-center rounded-full bg-brass px-4 text-sm font-bold text-smoke hover:bg-brass-lit">
          Start playing vs. bots
        </Link>
        <button onClick={onExit} className="min-h-10 rounded-full bg-bone px-4 text-sm font-bold text-smoke hover:bg-parchment">
          Exit demo
        </button>
      </div>

      <div ref={copyRef} aria-live="polite" className="mt-5 scroll-mt-4">
        <h3 className="font-display text-4xl font-extrabold text-bone">{COPY[step].title}</h3>
        <p className="mt-1 max-w-2xl text-lg text-parchment">{COPY[step].body}</p>
      </div>

      {step === "end" ? (
        <Ending />
      ) : (
        <div className="felt mt-5 flex flex-col items-center gap-5 rounded-[2.5rem] px-4 py-6 sm:px-8">
          <div className="flex flex-wrap justify-center gap-6">
            <Opponent
              name="Clara"
              cards={past("booked") ? 3 : 5}
              bubble="Asked Benny for 10s: go fish"
              hint={step === "pickClara"}
              selected={target === "clara"}
              onClick={step === "pickClara" ? next : undefined}
            />
            <Opponent
              name="Benny"
              cards={4}
              bubble={null}
              goFish={past("fish")}
              hint={step === "pickBenny"}
              selected={target === "benny"}
              onClick={step === "pickBenny" ? next : undefined}
            />
          </div>

          <button
            onClick={step === "fish" ? next : undefined}
            disabled={step !== "fish"}
            aria-label="The pond"
            className={clsx("relative h-20 w-14 rounded-lg transition", step === "fish" && "ring-3 ring-brass-lit shadow-[0_0_20px_rgba(214,182,127,0.75)] hover:-translate-y-1")}
          >
            <span className="card-back absolute inset-0 translate-x-1 -translate-y-1 rounded-lg ring-1 ring-black/40" />
            <span className="card-back absolute inset-0 rounded-lg shadow-md ring-1 ring-black/40" />
            {step === "fish" && <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-bold whitespace-nowrap text-brass-lit">Click to draw</span>}
          </button>

          {books.length > 0 && (
            <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-3">
              <div className="flex rounded-xl bg-black/20 p-1 pl-6">
                {/* The two 10s from Clara glow. */}
                {books[0].map((c) => (
                  <span key={c.id} className="-ml-6">
                    <PlayingCard card={c} size="sm" entrance={false} highlight={c.id === T3.id || c.id === T4.id ? "match" : null} />
                  </span>
                ))}
              </div>
              <span className="font-display text-2xl font-extrabold text-brass-lit">+1 book</span>
            </motion.div>
          )}

          <LessonHand
            hand={hand}
            selected={rank}
            hintRank={step === "pickTens" ? "10" : step === "pickAce" ? "A" : null}
            onPick={step === "pickTens" || step === "pickAce" ? next : undefined}
            drewId={past("drew") ? SEVEN.id : null}
          />
        </div>
      )}

      <div className="mt-6 flex min-h-14 flex-wrap items-center gap-3">
        {(step === "askClara" || step === "askBenny") && (
          <button ref={primaryRef} onClick={next} className="min-h-14 rounded-full bg-brass px-8 font-display text-2xl font-bold text-smoke hover:bg-brass-lit">
            {step === "askClara" ? "Ask Clara for 10s" : "Ask Benny for Aces"}
          </button>
        )}
        {(step === "booked" || step === "drew") && (
          <button ref={primaryRef} onClick={next} className="min-h-14 rounded-full bg-brass px-8 font-display text-2xl font-bold text-smoke hover:bg-brass-lit">
            Next
          </button>
        )}
        {step === "end" && (
          <>
            <Link href={VS_BOTS} className="flex min-h-14 items-center rounded-full bg-brass px-8 font-display text-2xl font-bold text-smoke hover:bg-brass-lit">
              Start playing vs. bots
            </Link>
            <button ref={primaryRef} onClick={() => setStep("pickClara")} className="min-h-12 rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone">
              Replay the lesson
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Opponent({
  name,
  cards: count,
  bubble,
  goFish,
  hint,
  selected,
  onClick,
}: {
  name: string;
  cards: number;
  bubble: string | null;
  goFish?: boolean;
  hint: boolean;
  selected: boolean;
  onClick?: () => void;
}) {
  return (
    <div className="relative flex w-44 flex-col items-center gap-2">
      <AnimatePresence>
        {goFish && (
          <motion.span
            initial={{ scale: 0.4, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 18 }}
            className="absolute -top-4 right-0 z-10 rounded-2xl rounded-br-sm bg-bone px-3 py-1 font-display text-lg font-extrabold text-smoke shadow-lg"
          >
            🐟 Go fish!
          </motion.span>
        )}
      </AnimatePresence>
      <button
        onClick={onClick}
        disabled={!onClick}
        className={clsx(
          "flex w-full flex-col items-center gap-1.5 rounded-3xl p-2 transition",
          hint && "ring-3 ring-brass-lit shadow-[0_0_20px_rgba(214,182,127,0.6)] hover:bg-black/20",
          selected && "bg-black/25 ring-3 ring-brass-lit",
        )}
      >
        <div className="flex h-14 items-end pl-5" aria-hidden>
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="-ml-5">
              <PlayingCard card={null} faceUp={false} size="sm" entrance={false} />
            </div>
          ))}
        </div>
        <span className="flex w-full flex-col items-center rounded-2xl bg-leather px-3 py-1.5">
          <span className="text-base font-bold text-bone">{name}</span>
          <span className="text-xs text-parchment">{count} cards</span>
        </span>
        {hint && <span className="text-xs font-bold text-brass-lit">Click {name}</span>}
      </button>
      {bubble && <p className="w-full rounded-2xl bg-black/30 px-3 py-1.5 text-center text-xs text-bone">“{bubble}”</p>}
    </div>
  );
}

function LessonHand({
  hand,
  selected,
  hintRank,
  onPick,
  drewId,
}: {
  hand: Card[];
  selected: string | null;
  hintRank: string | null;
  onPick?: () => void;
  drewId: string | null;
}) {
  const label = (c: Card) => (c.kind === "standard" ? (c.rank === 14 ? "A" : c.rank === 10 ? "10" : String(c.rank)) : "");
  const groups = new Map<string, Card[]>();
  for (const c of hand) groups.set(label(c), [...(groups.get(label(c)) ?? []), c]);
  return (
    <ul aria-label="Your hand" className="flex flex-wrap items-end justify-center gap-4 pt-3">
      {[...groups].map(([r, list]) => {
        const hint = hintRank === r;
        return (
          <li key={r}>
            <button
              onClick={hint ? onPick : undefined}
              disabled={!hint}
              className={clsx(
                "flex flex-col items-center gap-1.5 rounded-2xl p-1.5 transition",
                hint && "ring-3 ring-brass-lit shadow-[0_0_20px_rgba(214,182,127,0.6)] hover:-translate-y-1",
                selected === r && "-translate-y-3 bg-black/25 ring-3 ring-bone",
              )}
            >
              <div className="flex pl-8">
                {list.map((c) => (
                  <motion.div key={c.id} className="-ml-8" initial={c.id === drewId ? { y: -60, opacity: 0 } : false} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 22 }}>
                    <PlayingCard card={c} size="md" entrance={false} />
                  </motion.div>
                ))}
              </div>
              <span className="rounded-full bg-black/35 px-2 text-xs font-bold text-bone tabular-nums">
                {list.length}/4{list.length < 4 && <span className="text-parchment"> · need {4 - list.length}</span>}
              </span>
              {hint && <span className="text-xs font-bold text-brass-lit">Click</span>}
            </button>
          </li>
        );
      })}
      {hand.length === 0 && <li className="text-sm text-bone">No cards</li>}
    </ul>
  );
}

function Ending() {
  const scores = [
    { name: "You", books: 5 },
    { name: "Clara", books: 4 },
    { name: "Benny", books: 4 },
  ];
  return (
    <div className="felt mt-5 grid gap-6 rounded-[2.5rem] px-6 py-6 sm:grid-cols-2 sm:px-8">
      <div>
        <h4 className="font-display text-2xl font-bold text-bone">Out of cards</h4>
        <div className="mt-3 flex items-center gap-3 text-bone">
          <span className="rounded-xl border border-dashed border-bone/40 px-3 py-6 text-sm">Empty hand</span>
          <span aria-hidden className="text-2xl text-brass-lit">→</span>
          <PlayingCard card={cards("3H")[0]} size="md" startFaceDown revealDelay={0.4} />
          <span className="text-sm text-parchment">Draw from the pond</span>
        </div>
      </div>
      <div>
        <h4 className="font-display text-2xl font-bold text-bone">All 13 books made</h4>
        <ol className="mt-3 divide-y divide-baize-deep border-y border-baize-deep">
          {scores.map((s, i) => (
            <li key={s.name} className="flex items-baseline justify-between py-2">
              <span className={clsx("text-base", i === 0 ? "font-bold text-bone" : "text-bone")}>
                {s.name}
                {i === 0 && <span className="ml-2 text-sm font-bold text-brass-lit">wins</span>}
              </span>
              <span className="text-sm text-bone tabular-nums">{s.books} books</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
