"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import clsx from "clsx";
import { motion, type PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { GAMES, type GameId } from "@/lib/games";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { RoomLink } from "@/components/ui/RoomTransition";
import { cards } from "@/components/rules/sample-cards";
import { BlackjackHowTo } from "@/components/blackjack/BlackjackHowTo";
import { HoldemHowTo } from "@/components/holdem/HoldemHowTo";
import { GarbageHowTo } from "@/components/garbage/GarbageHowTo";
import { RummyHowTo } from "@/components/rummy/RummyHowTo";
import { WarHowTo } from "@/components/war/WarHowTo";
import { GoFishHowTo } from "@/components/gofish/GoFishHowTo";
import { JoinWithCode } from "./JoinWithCode";
import { GAME_ART } from "./game-art";

interface Slide {
  id: GameId;
  /** Face-up cards for the showcase, plus how many face down. */
  show: string;
  hidden: number;
  /** Where "How to play" goes: a page, or a dialog with a guide and demo. */
  howTo: { href: string } | { Dialog: ComponentType<{ onClose: () => void }> };
  /** The button's wording, if not "How to play & demo". */
  howToLabel?: string;
}

const SLIDES: Slide[] = [
  {
    id: "texas-holdem",
    ...GAME_ART["texas-holdem"],
    howTo: { Dialog: HoldemHowTo },
  },
  {
    id: "bs-poker",
    ...GAME_ART["bs-poker"],
    howTo: { href: "/rules" },
  },
  {
    id: "blackjack",
    ...GAME_ART["blackjack"],
    howTo: { Dialog: BlackjackHowTo },
  },
  {
    id: "garbage",
    ...GAME_ART["garbage"],
    howTo: { Dialog: GarbageHowTo },
  },
  {
    id: "rummy",
    ...GAME_ART["rummy"],
    howTo: { Dialog: RummyHowTo },
  },
  {
    id: "war",
    ...GAME_ART["war"],
    howTo: { Dialog: WarHowTo },
  },
  {
    id: "go-fish",
    ...GAME_ART["go-fish"],
    howTo: { Dialog: GoFishHowTo },
    howToLabel: "Learn to play",
  },
];

const SLIDE_KEY = "showdown:menu-slide";

/** How the side games sit: pushed out most of a card's width, smaller and dimmed (darkened, not see-through, so the background stays behind them). */
const PEEK = { x: 92, scale: 0.8, brightness: 0.35 };

/** Where each game sits relative to the current one: 0 in front, −1 / +1 peeking at the sides. */
function offsetOf(i: number, index: number) {
  const n = SLIDES.length;
  let d = (i - index + n) % n;
  if (d > n / 2) d -= n;
  return d;
}

/** The main menu: the current game up front, its neighbours peeking either side. */
export function GameCarousel() {
  const [index, setIndex] = useState(0);
  // No animation until the remembered game is back in front.
  const [settled, setSettled] = useState(false);
  const [dialog, setDialog] = useState<"join" | "howto" | null>(null);
  const slide = SLIDES[index];
  const info = GAMES[slide.id];
  // Last offsets, so a card that wraps round (left peek → right peek) jumps instead of sweeping across.
  const lastOffsets = useRef<Record<string, number>>({});
  useEffect(() => {
    lastOffsets.current = Object.fromEntries(SLIDES.map((s, i) => [s.id, offsetOf(i, index)]));
  }, [index]);

  // Come back to the game you left from.
  useEffect(() => {
    try {
      const saved = SLIDES.findIndex((s) => s.id === sessionStorage.getItem(SLIDE_KEY));
      if (saved > 0) setIndex(saved);
    } catch {
      // Storage blocked: start at the first game.
    }
    const t = setTimeout(() => setSettled(true), 50);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(SLIDE_KEY, slide.id);
    } catch {
      // Not critical.
    }
  }, [slide.id]);

  const go = useCallback((step: number) => setIndex((i) => (i + step + SLIDES.length) % SLIDES.length), []);

  useEffect(() => {
    if (dialog) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [role=tablist]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, go]);

  const onDragEnd = (_: unknown, { offset, velocity }: PanInfo) => {
    if (offset.x < -80 || velocity.x < -500) go(1);
    else if (offset.x > 80 || velocity.x > 500) go(-1);
  };

  const arrow = "grid size-14 shrink-0 place-items-center rounded-full bg-smoke-raised text-bone ring-1 ring-leather-lit transition hover:bg-leather hover:ring-brass sm:size-16";

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden px-4 pt-6 pb-4 sm:px-8">
      <PointerLight />

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-8 sm:gap-12">
        <h1 className="text-center font-display text-7xl leading-[0.8] font-extrabold tracking-tight text-bone sm:text-9xl lg:text-[10rem]">Showdown</h1>

        <section aria-roledescription="carousel" aria-label="Games" className="relative grid w-full max-w-[50rem] place-items-center px-3 md:px-0">
          {SLIDES.map((s, i) => {
            const offset = offsetOf(i, index);
            const front = offset === 0;
            const last = lastOffsets.current[s.id];
            const wrapped = last !== undefined && Math.abs(offset - last) > 1;
            const opacity = Math.abs(offset) <= 1 ? 1 : 0;
            return (
              <motion.div
                key={s.id}
                initial={false}
                animate={{ x: `${offset * PEEK.x}%`, scale: front ? 1 : PEEK.scale, filter: `brightness(${front ? 1 : PEEK.brightness})`, opacity: wrapped ? [0, opacity] : opacity }}
                transition={!settled ? { duration: 0 } : wrapped ? { duration: 0.25 } : { type: "spring", stiffness: 260, damping: 32 }}
                style={{ zIndex: front ? 10 : 0 }}
                drag={front ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.25}
                onDragEnd={front ? onDragEnd : undefined}
                onClick={front ? undefined : () => go(offset)}
                aria-hidden={!front}
                className={clsx("col-start-1 row-start-1 w-full touch-pan-y", !front && "cursor-pointer")}
              >
                <article
                  inert={!front}
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${SLIDES.length}: ${GAMES[s.id].title}`}
                  className="felt rounded-[2.5rem] p-6 sm:p-10"
                >
                  <SlideFace slide={s} onJoin={() => setDialog("join")} onHowTo={() => setDialog("howto")} />
                </article>
              </motion.div>
            );
          })}

          <button onClick={() => go(-1)} aria-label="Previous game" className={clsx(arrow, "absolute top-1/2 left-0 z-20 hidden -translate-x-1/2 -translate-y-1/2 md:grid")}>
            <ChevronLeft className="size-8" />
          </button>
          <button onClick={() => go(1)} aria-label="Next game" className={clsx(arrow, "absolute top-1/2 right-0 z-20 hidden translate-x-1/2 -translate-y-1/2 md:grid")}>
            <ChevronRight className="size-8" />
          </button>
        </section>
      </div>

      <nav aria-label="Choose a game" className="relative mt-4 flex items-center justify-center gap-2 sm:mt-6">
        <button onClick={() => go(-1)} aria-label="Previous game" className={clsx(arrow, "size-12 md:hidden")}>
          <ChevronLeft className="size-6" />
        </button>
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setIndex(i)}
            aria-label={GAMES[s.id].title}
            aria-current={i === index}
            className="grid min-h-11 min-w-11 place-items-center"
          >
            <span className={clsx("block h-2.5 rounded-full transition-all", i === index ? "w-9 bg-brass" : "w-2.5 bg-bone/40 hover:bg-bone/70")} />
          </button>
        ))}
        <button onClick={() => go(1)} aria-label="Next game" className={clsx(arrow, "size-12 md:hidden")}>
          <ChevronRight className="size-6" />
        </button>
      </nav>

      {dialog === "join" && <JoinWithCode onClose={() => setDialog(null)} />}
      {dialog === "howto" && "Dialog" in slide.howTo && <slide.howTo.Dialog onClose={() => setDialog(null)} />}
    </main>
  );
}

/** One game's card: its name, a hand of its cards, and the ways in. */
function SlideFace({ slide, onJoin, onHowTo }: { slide: Slide; onJoin: () => void; onHowTo: () => void }) {
  const info = GAMES[slide.id];
  const secondary = "flex min-h-14 items-center rounded-full border-2 border-bone/60 px-6 text-base font-bold text-bone transition hover:border-bone";
  return (
    <>
      <div className="flex items-center justify-between gap-6">
        <h2 className="min-w-0 font-display text-6xl leading-[0.9] font-extrabold text-bone sm:text-7xl lg:text-8xl">{info.title}</h2>
        <Showcase slide={slide} />
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <RoomLink href={info.path} className="flex min-h-14 items-center rounded-full bg-brass px-8 font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit">
          Play
        </RoomLink>
        <button onClick={onJoin} className={secondary}>
          Join with code
        </button>
        {"Dialog" in slide.howTo ? (
          <button onClick={onHowTo} className={secondary}>
            {slide.howToLabel ?? "How to play & demo"}
          </button>
        ) : (
          <Link href={slide.howTo.href} className={secondary}>
            How to play &amp; demo
          </Link>
        )}
      </div>
    </>
  );
}

/** A soft lamp that drifts after the mouse. Touch screens keep the fixed overhead lamp. */
function PointerLight() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let target = { x: window.innerWidth / 2, y: window.innerHeight * 0.3 };
    let pos = { ...target };
    let frame = 0;
    const paint = () => {
      el.style.setProperty("--lx", `${pos.x}px`);
      el.style.setProperty("--ly", `${pos.y}px`);
    };
    // Ease toward the pointer so the light trails it a little, like a lamp being swung over.
    const step = () => {
      pos = { x: pos.x + (target.x - pos.x) * 0.12, y: pos.y + (target.y - pos.y) * 0.12 };
      paint();
      frame = Math.hypot(target.x - pos.x, target.y - pos.y) > 0.5 ? requestAnimationFrame(step) : 0;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      target = { x: e.clientX, y: e.clientY };
      if (reduce) {
        pos = { ...target };
        paint();
      } else if (!frame) frame = requestAnimationFrame(step);
    };
    paint();
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ background: "radial-gradient(240px circle at var(--lx, 50%) var(--ly, 30%), rgba(214, 182, 127, 0.11), rgba(214, 182, 127, 0.06) 25%, rgba(214, 182, 127, 0.025) 50%, rgba(214, 182, 127, 0.008) 75%, transparent)" }}
    />
  );
}

/** A little hand of the game's cards, fanned. */
function Showcase({ slide }: { slide: Slide }) {
  const faceUp = cards(slide.show);
  const n = faceUp.length + slide.hidden;
  return (
    <div aria-hidden className="hidden shrink-0 pt-2 pr-2 sm:flex [@media(max-height:640px)]:hidden">
      {[...faceUp, ...Array.from({ length: slide.hidden }, () => null)].map((c, i) => (
        <div key={i} className={clsx(i > 0 && "-ml-8")} style={{ transform: `rotate(${(i - (n - 1) / 2) * 8}deg) translateY(${Math.abs(i - (n - 1) / 2) * 6}px)` }}>
          <PlayingCard card={c} faceUp={c !== null} size="lg" dealDelay={0.15 + i * 0.07} />
        </div>
      ))}
    </div>
  );
}
