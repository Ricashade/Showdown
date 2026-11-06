"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { Card } from "@/types/cards";
import { RoomLink } from "@/components/ui/RoomTransition";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { cards } from "@/components/rules/sample-cards";
import { DemoBar, Fan, HowToDialog, Panel, Tips } from "@/components/rules/HowToDialog";
import { SuitMeter } from "./SuitMeter";

/** Bouillotte's rules guide and a three-step showdown. */
export function BouillotteHowTo({ onClose }: { onClose: () => void }) {
  return <HowToDialog title="How to play Bouillotte" guide={(showDemo) => <Guide onDemo={showDemo} />} demo={(exit) => <Demo onExit={exit} />} onClose={onClose} />;
}

// ---------------------------------------------------------------------------
// Guide
// ---------------------------------------------------------------------------

const BETTING = [
  "Everyone antes, then the player on the dealer's right may post a carré: a blind bet the size of the pot that buys the last word.",
  "One round of betting, starting left of the dealer. Pass while nobody has opened; after that call, raise, va-tout (all in) or fold.",
  "You can't bet more than your cave. Going va-tout for less makes side pots.",
  "Everyone else folds: the bet wins and nobody shows.",
];

function Guide({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <Panel title="Three cards and the Retourné" className="md:col-span-2">
        <p className="max-w-2xl text-base text-parchment">
          Three to five players and a stripped deck, so nearly every card is dealt. Three cards each, and one more turned face up in the middle for everyone: the Retourné. Last player with chips wins.
        </p>
        <ul className="mt-3 flex flex-wrap gap-x-8 gap-y-3 text-sm text-parchment">
          {(
            [
              ["Three players", "AS KS 9S 8S"],
              ["Four", "AS KS QS 9S 8S"],
              ["Five", "AS KS QS JS 9S 8S"],
            ] as const
          ).map(([label, spec]) => (
            <li key={label} className="flex flex-col gap-1.5">
              {label}
              <Fan spec={spec} />
            </li>
          ))}
        </ul>
        <button onClick={onDemo} className="mt-4 min-h-11 rounded-full bg-brass px-5 text-base font-bold text-smoke hover:bg-brass-lit">
          Play the 30-second demo
        </button>
      </Panel>

      <Panel title="Brélans win first">
        <ul className="space-y-3 text-base text-parchment">
          <li className="flex items-center justify-between gap-3">
            <span>
              <span className="font-bold text-bone">Brélan carré</span>: three of a rank, and the Retourné is the fourth.
            </span>
            <Fan spec="KS KH KD" />
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>
              <span className="font-bold text-bone">Brélan</span>: three of a rank in your hand.
            </span>
            <Fan spec="9S 9H 9D" />
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>
              <span className="font-bold text-bone">Brélan favori</span>: a pair plus the Retourné.
            </span>
            <Fan spec="AS AH" />
          </li>
        </ul>
        <p className="mt-3 text-sm text-ash">Carré beats brélan beats favori, then the higher rank. A brélan that wins pays a bonus from everyone dealt in: 1 chip each, 2 for a carré.</p>
      </Panel>

      <Panel title="No brélan? Le Point">
        <p className="text-base text-parchment">
          Every hand dealt is turned up, folded ones too. Each suit&apos;s points are added across the whole table and the Retourné: A 11, K Q J 10, 9 9, 8 8. The suit with the most wins, and whoever still in holds its highest card takes the pot.
        </p>
        <p className="mt-2 text-sm text-ash">Nobody still in holds that suit? The next suit down decides.</p>
      </Panel>

      <Panel title="Betting" className="md:col-span-2">
        <Tips items={BETTING} />
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo: read A♥ 9♥ K♠ with a Q♥ Retourné → call Vinnie's bet → every hand up, Hearts 48, A♥ sweeps
// ---------------------------------------------------------------------------

const RETOURNE = cards("QH")[0];
const SEATS: { name: string; hand: Card[]; folded: boolean; move: string }[] = [
  { name: "Shark Vinnie", hand: cards("AS 9S 8C"), folded: false, move: "Open 6" },
  { name: "Ice Cold Ivy", hand: cards("KH 8H QD"), folded: true, move: "Fold" },
  { name: "Bot Benny", hand: cards("AD KD 9C"), folded: true, move: "Fold" },
];
const YOU = cards("AH 9H KS");
const TOTALS = { S: 30, H: 48, D: 31, C: 17 };

type Step = "read" | "call" | "showdown";

function Demo({ onExit }: { onExit: () => void }) {
  const [step, setStep] = useState<Step>("read");
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => primaryRef.current?.focus(), [step]);
  const shown = step === "showdown";

  const title = { read: "You hold the Ace of Hearts", call: "Shark Vinnie opens for 6", showdown: "Hearts win Le Point" }[step];
  const hint = {
    read: "A♥ and 9♥ in your hand and the Q♥ turned up: 30 points of Hearts you can see. Unless someone has a brélan, Hearts will likely win Le Point, and nobody can hold a higher Heart than your Ace.",
    call: "Ivy and Benny fold. Call to see a showdown.",
    showdown: "No brélan, so every hand turns up. Ivy folded, but her K♥ and 8♥ still count: Hearts reach 48. Your A♥ is the highest Heart still in. You take the pot of 16.",
  }[step];

  return (
    <div>
      <DemoBar progress={{ read: 0, call: 0.5, showdown: 1 }[step]} onExit={onExit} />
      <h3 aria-live="polite" className="mt-5 font-display text-4xl font-extrabold text-bone">
        {title}
      </h3>
      <p className="mt-1 max-w-3xl text-base text-parchment">{hint}</p>

      <div className="felt mt-4 flex flex-col items-center gap-5 rounded-[2.5rem] px-4 py-6">
        <ul className="flex flex-wrap justify-center gap-x-8 gap-y-4">
          {SEATS.map((s) => (
            <li key={s.name} className={clsx("flex flex-col items-center gap-1.5", s.folded && step !== "read" && "opacity-50")}>
              <div className="flex">
                {s.hand.map((c, i) => (
                  <div key={c.id} className={clsx(i > 0 && "-ml-6")} style={{ transform: `rotate(${(i - 1) * 5}deg)` }}>
                    <PlayingCard card={c} faceUp={shown} size="sm" entrance={false} />
                  </div>
                ))}
              </div>
              <span className="text-sm font-bold text-parchment">{s.name}</span>
              {step !== "read" && <span className="text-xs font-bold text-parchment">{s.move}</span>}
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-6">
          <div className="rounded-2xl bg-black/20 p-2 shadow-[inset_0_0_0_1px_rgba(214,182,127,0.45),0_0_0_5px_rgba(122,92,46,0.35)]">
            <PlayingCard card={RETOURNE} size="md" entrance={false} />
          </div>
          <div className="flex flex-col items-center">
            <span className="text-sm text-bone">Pot</span>
            <span className="font-display text-4xl font-extrabold text-bone tabular-nums">{step === "read" ? 4 : step === "call" ? 10 : 16}</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <p className="rounded-full bg-black/25 px-4 py-1 text-sm text-bone">
            <span className="font-bold">Ace of Hearts</span> · ♥ 30 pts with the Retourné
          </p>
          <div className="flex">
            {YOU.map((c, i) => (
              <div key={c.id} className={clsx(i > 0 && "-ml-5")} style={{ transform: `rotate(${(i - 1) * 5}deg)` }}>
                <PlayingCard card={c} size="lg" entrance={false} highlight={shown && c.id === "AH" ? "match" : null} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {shown && (
        <div className="mt-5 max-w-md">
          <SuitMeter totals={TOTALS} winner="H" />
        </div>
      )}

      <div className="mt-6 flex min-h-14 flex-wrap items-center gap-3">
        {step === "read" && (
          <button ref={primaryRef} onClick={() => setStep("call")} className="min-h-12 rounded-full bg-brass px-7 font-display text-2xl font-bold text-smoke hover:bg-brass-lit">
            Next
          </button>
        )}
        {step === "call" && (
          <>
            <button onClick={() => setStep("read")} className="min-h-12 rounded-full border-2 border-bone/60 px-6 font-display text-2xl font-bold text-bone hover:border-bone">
              Back
            </button>
            <button ref={primaryRef} onClick={() => setStep("showdown")} className="min-h-12 rounded-full bg-bone px-7 font-display text-2xl font-bold text-smoke hover:bg-parchment">
              Call 6
            </button>
          </>
        )}
        {step === "showdown" && (
          <>
            <RoomLink href="/bouillotte/local?bots=1" className="flex min-h-12 items-center rounded-full bg-brass px-7 font-display text-2xl font-bold text-smoke hover:bg-brass-lit">
              Play against bots
            </RoomLink>
            <RoomLink href="/bouillotte" className="flex min-h-12 items-center rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone">
              Play Bouillotte
            </RoomLink>
            <button ref={primaryRef} onClick={() => setStep("read")} className="min-h-12 rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone">
              Replay
            </button>
          </>
        )}
      </div>
    </div>
  );
}
