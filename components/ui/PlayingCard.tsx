"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import clsx from "clsx";
import type { Card } from "@/types/cards";
import { isRedSuit, rankName, rankShort, suitName, suitSymbol } from "@/lib/cards";

export type CardSize = "sm" | "md" | "lg";
export type CardHighlight = "match" | "partial" | null;

const SIZE: Record<CardSize, { box: string; corner: string; pip: string }> = {
  sm: { box: "w-10 h-14 rounded-md", corner: "text-xs", pip: "text-lg" },
  md: { box: "w-14 h-20 rounded-lg", corner: "text-sm", pip: "text-2xl" },
  lg: { box: "w-20 h-28 rounded-xl", corner: "text-lg", pip: "text-4xl" },
};

interface PlayingCardProps {
  /** null renders a generic face-down card (we don't know what it is). */
  card: Card | null;
  faceUp?: boolean;
  size?: CardSize;
  highlight?: CardHighlight;
  isWild?: boolean;
  /** e.g. "9♥" — what a wild is standing in for at showdown. */
  wildAs?: string;
  dimmed?: boolean;
  /** Seconds — staggers the small drop-in animation. */
  dealDelay?: number;
  /** Skip the drop-in (the card is flying in from the deck instead). */
  entrance?: boolean;
  /** Mount face-down and flip to `faceUp` after `revealDelay` seconds (a freshly dealt card). */
  startFaceDown?: boolean;
  revealDelay?: number;
}

export function cardName(card: Card | null, faceUp: boolean, isWild = false): string {
  if (!card || !faceUp) return "Face-down card";
  if (card.kind === "joker") return "Joker, wild";
  return `${rankName(card.rank)} of ${suitName(card.suit)}${isWild ? ", wild" : ""}`;
}

export function PlayingCard({
  card,
  faceUp = true,
  size = "md",
  highlight = null,
  isWild = false,
  wildAs,
  dimmed = false,
  dealDelay = 0,
  entrance = true,
  startFaceDown = false,
  revealDelay = 0,
}: PlayingCardProps) {
  const s = SIZE[size];
  const showFront = faceUp && card !== null;
  const label = cardName(card, faceUp, isWild) + (wildAs && showFront ? `, counting as ${wildAs}` : "");

  // Turning over, done flat: the card squeezes to its edge and the other side shows from there.
  // (A real 3D flip can leave the whole page painting wrong after a scroll in Chromium.)
  // 0 is face up, 1 face down.
  const reduceMotion = useReducedMotion();
  const side = useMotionValue(showFront && !startFaceDown ? 0 : 1);
  const width = useTransform(side, (v) => Math.max(0.04, Math.abs(Math.cos(v * Math.PI))));
  const front = useTransform(side, (v) => (v < 0.5 ? 1 : 0));
  // A freshly dealt card waits for its reveal, however often the effect re-runs.
  const revealAt = useRef(startFaceDown ? performance.now() + revealDelay * 1000 : 0);
  useEffect(() => {
    const controls = animate(side, showFront ? 0 : 1, {
      duration: reduceMotion ? 0 : 0.5,
      ease: [0.4, 0, 0.2, 1],
      delay: Math.max(0, revealAt.current - performance.now()) / 1000,
    });
    return () => controls.stop();
  }, [showFront, side, reduceMotion]);

  return (
    <motion.div
      role="img"
      aria-label={label}
      initial={entrance ? { opacity: 0, y: -16 } : false}
      animate={{ opacity: dimmed ? 0.4 : 1, y: 0 }}
      transition={{ delay: dealDelay, type: "spring", stiffness: 300, damping: 26 }}
      className={clsx("relative shrink-0", s.box)}
    >
      <motion.div aria-hidden className="relative size-full" style={{ scaleX: width }}>
        <div className={clsx("card-back absolute inset-0 shadow-md ring-1 ring-black/40", s.box)}>
          <div className="absolute inset-1 rounded-[inherit] border border-bone/25" />
        </div>
        <motion.div
          className={clsx(
            "absolute inset-0 overflow-hidden bg-bone shadow-md",
            s.box,
            highlight === "match" && "ring-3 ring-brass-lit shadow-[0_0_16px_rgba(214,182,127,0.7)]",
            highlight === "partial" && "outline-2 outline-offset-2 outline-dashed outline-ash",
          )}
          style={{ opacity: front }}
        >
          {card && <CardFace card={card} size={size} isWild={isWild} />}
        </motion.div>
      </motion.div>

      {wildAs && showFront && (
        <div
          aria-hidden
          className="absolute -bottom-2.5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-brass-lit px-1.5 text-xs font-bold whitespace-nowrap text-smoke shadow"
        >
          as {wildAs}
        </div>
      )}
    </motion.div>
  );
}

function CardFace({ card, size, isWild }: { card: Card; size: CardSize; isWild: boolean }) {
  const s = SIZE[size];
  if (card.kind === "joker") {
    return (
      <div className="flex size-full flex-col items-center justify-center text-leather">
        <span className={s.pip}>★</span>
        {size !== "sm" && <span className="font-display text-sm font-bold">Joker</span>}
      </div>
    );
  }
  return (
    <div className={clsx("relative size-full", isRedSuit(card.suit) ? "text-card-red" : "text-smoke")}>
      <div className={clsx("absolute top-0.5 left-1 font-display leading-none font-extrabold", s.corner)}>
        <div>{rankShort(card.rank)}</div>
        <div className="font-sans">{suitSymbol(card.suit)}</div>
      </div>
      <div className={clsx("absolute inset-0 flex items-center justify-center", s.pip)}>{suitSymbol(card.suit)}</div>
      {isWild && <div className="absolute right-0.5 bottom-0 text-xs leading-tight text-brass-deep">★</div>}
    </div>
  );
}
