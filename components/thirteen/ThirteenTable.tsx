"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { Bomb, Bot, ChevronLeft, ChevronRight } from "lucide-react";
import type { Card } from "@/types/cards";
import type { Combo, ThirteenAction, ThirteenPlay } from "@/types/thirteen";
import { contextFor, judgePlay, type ThirteenLegal, type ThirteenPublicSeat, type ThirteenView } from "@/lib/thirteen-engine";
import { bombOf, chopWords, comboKey, describeCombo, findBombs, type FoundPlay } from "@/lib/thirteen-combos";
import { DIFFICULTY_LABEL } from "@/lib/bot-ai";
import { PlayingCard, cardName } from "@/components/ui/PlayingCard";
import { jokerLabel, jokerLabels, sortHand, type HandSort } from "./words";

type ChopEvent = ThirteenPlay & { n: number };

interface ThirteenTableProps {
  view: ThirteenView;
  /** Whose hand is shown at the bottom (null: watching). */
  focusId: string | null;
  legal: ThirteenLegal;
  actingId: string | null;
  onAction: (action: ThirteenAction) => void;
  connectedIds?: Set<string>;
  /** The bomb that just landed, while its moment lasts. */
  chop: ChopEvent | null;
}

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return wide;
}

export function ThirteenTable({ view, focusId, legal, actingId, onAction, connectedIds, chop }: ThirteenTableProps) {
  const seats = view.seats ?? [];
  const focus = seats.find((x) => x.id === focusId) ?? null;
  const others = focus ? [...seats.slice(seats.indexOf(focus) + 1), ...seats.slice(0, seats.indexOf(focus))] : seats;
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? "";

  // The table jolts when a bomb lands.
  const shake = useAnimationControls();
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (chop && !reduceMotion) void shake.start({ x: [0, -7, 6, -4, 2, 0], transition: { duration: 0.45, ease: "easeOut" } });
  }, [chop?.n, reduceMotion, shake]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.section
      animate={shake}
      aria-label="Table"
      className="felt felt-line relative mx-4 rounded-[2.5rem] px-4 py-6 sm:px-8 md:flex md:h-[calc(100dvh-11.5rem)] md:min-h-fit md:flex-col md:justify-between"
    >
      <ul className="flex flex-wrap items-start justify-center gap-x-3 gap-y-4 sm:justify-between sm:gap-x-10">
        {others.map((x) => (
          <li key={x.id}>
            <Seat seat={x} view={view} disconnected={!!connectedIds && !connectedIds.has(x.id)} />
          </li>
        ))}
      </ul>

      <Pile view={view} name={name} chop={chop} />

      {focus?.hand && (
        <MyHand
          key={focus.id}
          seat={focus}
          view={view}
          legal={legal}
          canAct={legal.isMyTurn && actingId === focus.id}
          onAction={onAction}
          you={focus.id === view.viewerId}
          name={name(focus.id)}
        />
      )}
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------

function Seat({ seat, view, disconnected }: { seat: ThirteenPublicSeat; view: ThirteenView; disconnected: boolean }) {
  const player = view.players.find((p) => p.id === seat.id);
  const isTurn = view.phase === "playing" && view.currentTurnId === seat.id;
  const shown = Math.min(seat.count, 9);
  return (
    <div
      data-seat-of={seat.id}
      className="flex w-36 flex-col items-center gap-2 rounded-3xl px-2 pt-3 pb-2 sm:w-48 sm:px-3"
    >
      <div aria-hidden className="flex h-12 items-end">
        {Array.from({ length: shown }, (_, i) => (
          <div
            key={i}
            className={clsx("card-back h-11 w-8 rounded-[5px] shadow-md ring-1 ring-black/40", i > 0 && "-ml-6")}
            style={{ transform: `rotate(${(i - (shown - 1) / 2) * 4}deg) translateY(${Math.abs(i - (shown - 1) / 2) * 1.5}px)` }}
          />
        ))}
      </div>
      {/* Whose turn it is shows on the seat itself: its name turns brass. */}
      <p className={clsx("flex max-w-full items-center gap-1.5 rounded-full px-3 py-0.5 text-base font-bold transition", isTurn ? "bg-brass text-smoke ring-2 ring-brass-lit" : "text-bone")}>
        {player?.isBot && <Bot className={clsx("size-4 shrink-0", isTurn ? "text-smoke/75" : "text-brass-lit")} aria-label={`${DIFFICULTY_LABEL[player.botDifficulty ?? "medium"]} bot`} />}
        <span className="truncate">{player?.name}</span>
      </p>
      <p className="flex items-baseline gap-2 text-sm text-bone">
        <span className="font-display text-xl font-bold tabular-nums">{seat.count}</span>
        {seat.count === 1 ? "card" : "cards"}
        {seat.passed && <span className="text-ash">· passed</span>}
        {disconnected && <span className="text-ash">· reconnecting…</span>}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The trick in the middle
// ---------------------------------------------------------------------------

function PlayedCards({ play, size }: { play: ThirteenPlay; size: "sm" | "md" }) {
  const labels = jokerLabels(play.cards, play.combo.jokerAs);
  const tight = play.cards.length > 8 ? (size === "md" ? "-ml-9" : "-ml-6") : play.cards.length > 4 ? (size === "md" ? "-ml-6" : "-ml-4") : "-ml-3";
  return (
    <div className="flex justify-center pl-2">
      {play.cards.map((c, i) => (
        <div key={c.id} className={clsx(i > 0 && tight)}>
          <PlayingCard card={c} size={size} wildAs={labels[c.id]} dealDelay={i * 0.03} />
        </div>
      ))}
    </div>
  );
}

function Pile({ view, name, chop }: { view: ThirteenView; name: (id: string) => string; chop: ChopEvent | null }) {
  const top = view.trick.at(-1);
  const under = view.trick.slice(-3, -1);
  return (
    <div className="relative mt-8 mb-6 flex min-h-44 flex-col items-center justify-center gap-3 md:my-2 md:min-h-40">
      {/* Embers under a fresh bomb. */}
      <AnimatePresence>
        {chop && (
          <motion.div
            key={chop.n}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto h-56 max-w-xl -translate-y-1/2 rounded-full"
            style={{ background: "radial-gradient(closest-side, rgba(200, 16, 46, 0.32), rgba(214, 182, 127, 0.12) 55%, transparent)" }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
            transition={{ duration: 0.25 }}
          />
        )}
      </AnimatePresence>

      {top ? (
        <div className="relative grid place-items-center">
          {under.map((p, i) => (
            <div key={`${p.by}-${i}`} aria-hidden className="col-start-1 row-start-1 opacity-35" style={{ transform: `translateY(${(under.length - i) * -14}px) scale(${0.9 - (under.length - 1 - i) * 0.05})` }}>
              <PlayedCards play={p} size="md" />
            </div>
          ))}
          <motion.div
            key={view.log.findLast((e) => e.kind === "play")?.n}
            className="col-start-1 row-start-1"
            initial={top.chop ? { y: -40, scale: 1.12, opacity: 0 } : false}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 520, damping: 22 }}
          >
            <PlayedCards play={top} size="md" />
          </motion.div>
        </div>
      ) : (
        <div className="grid h-20 w-40 place-items-center rounded-2xl border border-dashed border-bone/25" />
      )}
      {top && (
        <p className="relative text-center text-sm text-bone">
          <span className="font-bold">{top.combo.type === "bomb" ? `Tier ${top.combo.tier} · ${describeCombo(top.combo)}` : describeCombo(top.combo)}</span>
          <span className="text-parchment"> · {name(top.by)}</span>
        </p>
      )}

      <AnimatePresence>
        {chop && (
          <motion.div
            key={chop.n}
            role="status"
            className="pointer-events-none absolute inset-x-0 -top-9 z-10 flex justify-center"
            initial={{ opacity: 0, scale: 1.25, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: "spring", stiffness: 420, damping: 20 }}
          >
            <span className="rounded-full bg-chip px-6 py-0.5 font-display text-3xl leading-tight font-extrabold text-bone shadow-[0_6px_30px_rgba(200,16,46,0.45)]">
              Bomb!<span className="sr-only">: {bombOf(chop.combo.tier).name}, tier {chop.combo.tier}</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Your hand
// ---------------------------------------------------------------------------

/** The strongest bomb of each tier in the hand, strongest tier first. */
function bombsByTier(hand: Card[]): FoundPlay[] {
  const seen = new Set<number>();
  return findBombs(hand).filter((b) => (seen.has(b.combo.tier) ? false : (seen.add(b.combo.tier), true)));
}

function MyHand({
  seat,
  view,
  legal,
  canAct,
  onAction,
  you,
  name,
}: {
  seat: ThirteenPublicSeat;
  view: ThirteenView;
  legal: ThirteenLegal;
  canAct: boolean;
  onAction: (a: ThirteenAction) => void;
  you: boolean;
  name: string;
}) {
  const wide = useWide();
  const hand = seat.hand!;
  const [sort, setSort] = useState<HandSort>("rank");
  const [selected, setSelected] = useState<string[]>([]);
  const [readIndex, setReadIndex] = useState(0);

  // Played cards leave the selection.
  const handIds = hand.map((c) => c.id).join();
  useEffect(() => setSelected((sel) => sel.filter((id) => hand.some((c) => c.id === id))), [handIds]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setReadIndex(0), [selected]);

  const sorted = useMemo(() => sortHand(hand, sort), [hand, sort]);
  const bombs = useMemo(() => bombsByTier(hand), [hand]);
  // Preview against the table even before your turn comes round.
  const ctx = legal.context ?? (view.phase === "playing" ? contextFor(view, seat.id) : null);
  const picked = hand.filter((c) => selected.includes(c.id));
  const verdict = ctx && picked.length ? judgePlay(ctx, picked) : null;
  const choices = verdict?.allowed ?? [];
  const chosen: Combo | null = choices.length ? choices[readIndex % choices.length] : null;
  const jokered = chosen && chosen.jokers > 0;
  const chopping = !!chosen && chosen.type === "bomb" && !!ctx?.top;

  const toggle = (id: string) => setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  const play = () => {
    if (!canAct || !chosen) return;
    onAction({ type: "PLAY", playerId: seat.id, cardIds: selected, read: comboKey(chosen) });
  };

  const size = wide ? "lg" : "md";
  const step = wide ? (hand.length > 14 ? -48 : -40) : hand.length > 10 ? -34 : -26;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* The bombs row keeps its height even with none left, so your hand doesn't jump when you play the last. */}
      <div className="flex min-h-10 max-w-full items-center">
        {bombs.length > 0 && (
          <div role="group" aria-label="Bombs in your hand" className="flex max-w-full flex-wrap justify-center gap-2">
            {bombs.slice(0, 6).map((b) => {
              const ids = b.cards.map((c) => c.id);
              const on = ids.length === selected.length && ids.every((id) => selected.includes(id));
              const live = canAct && !!legal.context && judgePlay(legal.context, b.cards).allowed.length > 0;
              return (
                <button
                  key={b.combo.tier}
                  onClick={() => setSelected(on ? [] : ids)}
                  aria-pressed={on}
                  className={clsx(
                    "flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition",
                    on ? "bg-bone text-smoke" : live ? "bg-black/25 text-bone ring-2 ring-brass-lit hover:bg-black/35" : "bg-black/20 text-parchment ring-1 ring-bone/20 hover:text-bone",
                  )}
                >
                  <Bomb className="size-4" aria-hidden />
                  <span className="font-display text-base tabular-nums">Tier {b.combo.tier}</span>
                  <span className="font-normal">{describeCombo(b.combo)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ul aria-label="Your hand" className="flex max-w-full flex-wrap justify-center pt-5" style={{ paddingLeft: -step }}>
        {sorted.map((c, i) => {
          const on = selected.includes(c.id);
          return (
            <li key={c.id} style={{ marginLeft: step }} className="relative">
              <motion.button
                layout
                onClick={() => toggle(c.id)}
                disabled={view.phase !== "playing"}
                aria-pressed={on}
                aria-label={cardName(c, true)}
                animate={{ y: on ? -18 : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 32 }}
                className={clsx("relative block rounded-xl", on && "ring-3 ring-bone")}
              >
                <PlayingCard card={c} size={size} dealDelay={Math.min(i, 17) * 0.025} />
              </motion.button>
            </li>
          );
        })}
      </ul>

      <div className="flex w-full max-w-3xl flex-wrap items-center justify-center gap-3">
        <div role="radiogroup" aria-label="Sort your hand" className="flex gap-1 rounded-full bg-black/25 p-1">
          {(["rank", "suit"] as const).map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={sort === s}
              onClick={() => setSort(s)}
              className={clsx("min-h-9 rounded-full px-3 text-sm font-bold transition", sort === s ? "bg-bone/90 text-smoke" : "text-parchment hover:text-bone")}
            >
              {s === "rank" ? "By rank" : "By suit"}
            </button>
          ))}
        </div>

        <div aria-live="polite" className="flex min-h-10 min-w-0 flex-1 basis-56 items-center justify-center gap-2 text-center">
          {chosen ? (
            <span className={clsx("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold", chosen.type === "bomb" ? "bg-smoke/80 text-bone ring-1 ring-brass" : "bg-black/25 text-bone")}>
              {chosen.type === "bomb" && <Bomb className="size-4 text-brass-lit" aria-hidden />}
              {chosen.type === "bomb" ? `Tier ${chosen.tier} · ${describeCombo(chosen)}` : describeCombo(chosen)}
              {chosen.type === "bomb" && <span className="font-normal text-brass-lit">· {chopWords(chosen.tier)}</span>}
            </span>
          ) : verdict?.reason ? (
            <span className="text-sm text-parchment">{verdict.reason}</span>
          ) : null}
          {jokered && choices.length > 1 && (
            <span className="flex items-center rounded-full bg-black/25 text-sm text-bone" role="group" aria-label="What the Joker counts as">
              <button onClick={() => setReadIndex((i) => i + choices.length - 1)} aria-label="Previous reading" className="grid size-9 place-items-center rounded-full hover:bg-black/30">
                <ChevronLeft className="size-4" />
              </button>
              <span className="px-1 whitespace-nowrap">Joker as {chosen!.jokerAs.map(jokerLabel).join(", ")}</span>
              <button onClick={() => setReadIndex((i) => i + 1)} aria-label="Next reading" className="grid size-9 place-items-center rounded-full hover:bg-black/30">
                <ChevronRight className="size-4" />
              </button>
            </span>
          )}
        </div>

        {/* Pass and Play stay through others' turns, greyed out, so the row doesn't come and go. */}
        {view.phase === "playing" && (
          <div className="flex gap-2">
            <button
              onClick={() => onAction({ type: "PASS", playerId: seat.id })}
              disabled={!canAct || legal.leading}
              className="min-h-12 rounded-full border border-bone/50 px-6 font-display text-xl font-bold text-bone transition hover:border-bone disabled:opacity-40"
            >
              Pass
            </button>
            <button
              onClick={play}
              disabled={!canAct || !chosen}
              className={clsx(
                "min-h-12 rounded-full px-8 font-display text-xl font-bold shadow-lg transition disabled:opacity-40",
                chopping ? "bg-chip text-bone hover:bg-chip/85" : "bg-brass text-smoke hover:bg-brass-lit",
              )}
            >
              Play
            </button>
          </div>
        )}
      </div>

      <p className="flex items-baseline gap-2 text-base text-bone">
        <span className={clsx("rounded-full px-3 py-0.5 font-bold transition", canAct ? "bg-brass text-smoke ring-2 ring-brass-lit" : "")}>{name}</span>
        {you && name !== "You" && <span className="text-sm text-brass-lit">you</span>}
        <span className="text-sm">
          <span className="font-display text-lg font-bold tabular-nums">{hand.length}</span> {hand.length === 1 ? "card" : "cards"}
        </span>
        {seat.passed && <span className="text-sm text-ash">· passed</span>}
      </p>
    </div>
  );
}
