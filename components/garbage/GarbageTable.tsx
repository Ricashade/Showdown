"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { motion } from "framer-motion";
import type { Card } from "@/types/cards";
import type { GarbageAction } from "@/types/garbage";
import { fitsSlot, isWildCard, slotLabel, type GarbageLegal, type GarbagePublicPlayer, type GarbageView } from "@/lib/garbage-engine";
import { DIFFICULTY_LABEL } from "@/lib/bot-ai";
import { cardName, PlayingCard, type CardSize } from "@/components/ui/PlayingCard";

/** Shared-layout id: the same card moving between hand, slot and discard pile glides across. */
const cardKey = (c: Card) => `garbage-${c.id}`;

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

interface GarbageTableProps {
  view: GarbageView;
  /** Whose board is shown big at the bottom. */
  focusId: string | null;
  /** Moves this screen may make (empty when it isn't this player's turn). */
  legal: GarbageLegal;
  actingId: string | null;
  onAction: (action: GarbageAction) => void;
  connectedIds?: Set<string>;
}

export function GarbageTable({ view, focusId, legal, actingId, onAction, connectedIds }: GarbageTableProps) {
  const wide = useWide();
  const focus = view.players.find((p) => p.id === focusId) ?? null;
  const others = view.players.filter((p) => p.id !== focus?.id);
  const canAct = legal.isMyTurn && !!actingId && actingId === focus?.id;
  const canRearrange = legal.canRearrange && !!actingId && actingId === focus?.id;
  // Rearranging: pick a turned-over card, then the one to swap it with.
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => setPicked(null), [view.phase, focusId]);
  const pick = (i: number) => {
    if (picked === null) return setPicked(i);
    if (picked !== i) onAction({ type: "SWAP_REVEALED", playerId: actingId!, from: picked, to: i });
    setPicked(null);
  };

  return (
    <section aria-label="Table" className="felt mx-4 rounded-[2.5rem] px-4 py-6 sm:px-8 sm:py-8">
      {/* With one or two opponents, their boards sit in a column beside yours so it all fits on screen. */}
      <div className={clsx("flex flex-col items-center gap-7", others.length <= 2 && "lg:flex-row lg:items-start lg:justify-center lg:gap-14")}>
        {others.length > 0 && (
          // Everyone else's boards, small, so you can see how close they are.
          <ul className={clsx("flex flex-wrap items-start justify-center gap-x-6 gap-y-5", others.length <= 2 && "lg:flex-col lg:flex-nowrap")}>
            {others.map((p) => (
              <li key={p.id}>
                <MiniBoard player={p} view={view} disconnected={!!connectedIds && !connectedIds.has(p.id)} />
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col items-center gap-6">
          <Middle view={view} legal={legal} canAct={canAct} actingId={actingId} onAction={onAction} />
          {focus && (
            <div className="flex flex-col items-center gap-3">
              <Board
                player={focus}
                view={view}
                size={wide ? "lg" : "md"}
                targets={canAct ? legal.slots : []}
                onPlace={(slot) => onAction({ type: "PLACE", playerId: actingId!, slot })}
                rearrange={canRearrange ? { picked, onPick: pick } : undefined}
              />
              <Nameplate player={focus} view={view} you={focus.id === view.viewerId} disconnected={!!connectedIds && !connectedIds.has(focus.id)} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Draw pile, the card in hand, and the discard pile. */
function Middle({ view, legal, canAct, actingId, onAction }: { view: GarbageView; legal: GarbageLegal; canAct: boolean; actingId: string | null; onAction: (a: GarbageAction) => void }) {
  const top = view.discard[view.discard.length - 1];
  const under = view.discard[view.discard.length - 2];
  const faceCards = view.settings.faceCards;
  const drawable = canAct && legal.mustDraw;
  const takeable = drawable && legal.canTakeDiscard;
  const dumpable = canAct && legal.mustDiscard;
  const active = view.active;
  const flipIn = view.activeFrom?.source === "stock" || view.activeFrom?.source === "slot";
  const holder = view.players.find((p) => p.id === view.currentTurnId);

  return (
    <div className="flex items-end justify-center gap-5 sm:gap-10">
      <div className="flex flex-col items-center gap-1.5">
        <button
          onClick={() => onAction({ type: "DRAW", playerId: actingId!, source: "stock" })}
          disabled={!drawable}
          aria-label={`Draw from the stock, ${view.stockCount} cards`}
          className={clsx("relative h-28 w-20 rounded-xl transition", drawable && "ring-3 ring-brass-lit shadow-[0_0_18px_rgba(214,182,127,0.6)] hover:-translate-y-0.5")}
        >
          <span className="card-back absolute inset-0 translate-x-1 translate-y-1 rounded-xl ring-1 ring-black/40" />
          <span className="card-back absolute inset-0 rounded-xl shadow-md ring-1 ring-black/40" />
        </button>
        <span className="text-xs text-bone tabular-nums">Stock {view.stockCount}</span>
      </div>

      {/* The card in hand: everyone watches the chain. */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="grid h-28 w-20 place-items-center rounded-xl border border-dashed border-bone/30">
          {active && (
            <motion.div key={active.id} layoutId={cardKey(active)} className={clsx("rounded-xl", isWildCard(active, faceCards) ? "shadow-[0_0_24px_rgba(214,182,127,0.85)]" : "shadow-[0_0_18px_rgba(242,235,221,0.35)]")}>
              <PlayingCard card={active} size="lg" entrance={false} startFaceDown={flipIn} revealDelay={0.15} isWild={isWildCard(active, faceCards)} />
            </motion.div>
          )}
        </div>
        <span className="text-xs text-bone">{active && holder ? `${holder.name}'s card` : "In hand"}</span>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <button
          onClick={() => onAction(dumpable ? { type: "DISCARD", playerId: actingId! } : { type: "DRAW", playerId: actingId!, source: "discard" })}
          disabled={!takeable && !dumpable}
          aria-label={dumpable ? "Throw the card in hand on the discard pile" : top ? `Take the ${cardName(top, true)} from the discard pile` : "Discard pile, empty"}
          className={clsx(
            "relative grid h-28 w-20 place-items-center rounded-xl border border-dashed border-bone/30 transition",
            takeable && "ring-3 ring-brass-lit shadow-[0_0_18px_rgba(214,182,127,0.6)] hover:-translate-y-0.5",
            dumpable && "ring-3 ring-chip-lit shadow-[0_0_20px_rgba(200,16,46,0.7)] hover:-translate-y-0.5",
          )}
        >
          {under && (
            <span className="absolute inset-0 rotate-6">
              <PlayingCard card={under} size="lg" entrance={false} />
            </span>
          )}
          {top && (
            <motion.span key={top.id} layoutId={cardKey(top)} className="absolute inset-0">
              <PlayingCard card={top} size="lg" entrance={false} isWild={isWildCard(top, faceCards)} />
            </motion.span>
          )}
        </button>
        <span className={clsx("text-xs", dumpable ? "font-bold text-chip-lit" : "text-bone")}>{dumpable ? "Discard" : "Discard pile"}</span>
      </div>
    </div>
  );
}

/** A player's slots: face-down cards, or what's been placed face up. */
function Board({
  player,
  view,
  size,
  targets,
  onPlace,
  rearrange,
}: {
  player: GarbagePublicPlayer;
  view: GarbageView;
  size: CardSize;
  targets: number[];
  onPlace: (slot: number) => void;
  /** End of round: your turned-over cards can be swapped. */
  rearrange?: { picked: number | null; onPick: (slot: number) => void };
}) {
  const n = player.slots.length;
  const faceCards = view.settings.faceCards;
  // Ace to 5 on top, 6 to 10 below.
  const cols = Math.min(5, n);
  const box = size === "lg" ? "h-28 w-20 rounded-xl" : size === "md" ? "h-20 w-14 rounded-lg" : "h-14 w-10 rounded-md";
  return (
    <ol className={clsx("grid", size === "sm" ? "gap-x-1 gap-y-1" : "gap-x-2 gap-y-3 sm:gap-x-3")} style={{ gridTemplateColumns: `repeat(${cols}, auto)` }} aria-label={`${player.name}'s board`}>
      {player.slots.map((slot, i) => {
        const target = targets.includes(i);
        const label = slotLabel(i);
        const loose = slot.revealed;
        const fits = !!loose && fitsSlot(loose, i, faceCards);
        const movable = !!rearrange && !!loose;
        const picked = movable && rearrange!.picked === i;
        const describe = slot.shown
          ? cardName(slot.shown, true, isWildCard(slot.shown, faceCards))
          : loose
            ? `${cardName(loose, true, isWildCard(loose, faceCards))}, turned over, ${fits ? "fits" : "doesn't fit"}`
            : "face down";
        return (
          <li key={i} className="flex flex-col items-center gap-1">
            <button
              onClick={() => (movable ? rearrange!.onPick(i) : onPlace(i))}
              disabled={!target && !movable}
              aria-label={`Slot ${label}, ${describe}${target ? ". Place here" : movable ? (picked ? ". Picked: choose a card to swap with" : ". Pick to swap") : ""}`}
              aria-pressed={movable ? picked : undefined}
              className={clsx(
                "relative transition",
                box,
                target && "ring-3 ring-brass-lit shadow-[0_0_20px_rgba(214,182,127,0.75)] hover:-translate-y-1",
                movable && "hover:-translate-y-1",
                picked && "-translate-y-2 ring-3 ring-bone shadow-[0_0_20px_rgba(242,235,221,0.6)]",
              )}
            >
              {loose ? (
                <motion.div layoutId={cardKey(loose)} className="absolute inset-0">
                  <PlayingCard key={`rev-${loose.id}`} card={loose} size={size} entrance={false} startFaceDown revealDelay={i * 0.06} isWild={isWildCard(loose, faceCards)} highlight={fits ? "match" : null} dimmed={!fits} />
                </motion.div>
              ) : slot.shown ? (
                <motion.div layoutId={cardKey(slot.shown)} className="absolute inset-0">
                  <PlayingCard card={slot.shown} size={size} entrance={false} isWild={isWildCard(slot.shown, faceCards)} />
                </motion.div>
              ) : slot.faceDown ? (
                <PlayingCard key={`${view.round}-${i}`} card={null} faceUp={false} size={size} dealDelay={i * 0.05} />
              ) : null}
            </button>
            <span className={clsx("font-display font-bold tabular-nums", size === "sm" ? "text-xs" : "text-sm", target || fits ? "text-brass-lit" : "text-bone")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function MiniBoard({ player, view, disconnected }: { player: GarbagePublicPlayer; view: GarbageView; disconnected: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <Board player={player} view={view} size="sm" targets={[]} onPlace={() => {}} />
      <Nameplate player={player} view={view} you={false} disconnected={disconnected} />
    </div>
  );
}

function Nameplate({ player: p, view, you, disconnected }: { player: GarbagePublicPlayer; view: GarbageView; you: boolean; disconnected: boolean }) {
  const isTurn = view.phase === "playing" && view.currentTurnId === p.id;
  const left = p.slots.filter((s) => s.faceDown).length;
  return (
    <div className={clsx("flex min-w-28 flex-col items-center rounded-2xl px-3 py-1.5", isTurn ? "bg-leather-lit ring-2 ring-brass-lit" : "bg-leather")}>
      <div className="flex max-w-40 items-baseline gap-1.5">
        <span data-seat-of={p.id} className={clsx("truncate text-base font-bold", isTurn ? "text-bone" : "text-parchment")}>{p.name}</span>
        {you && <span className="text-xs text-brass-lit">you</span>}
        {p.isBot && <span className="text-xs text-brass-lit">{DIFFICULTY_LABEL[p.botDifficulty ?? "medium"]}</span>}
      </div>
      <span className="text-xs text-parchment tabular-nums">
        {p.finished ? "Board cleared" : view.phase === "reveal" ? (p.revealDone ? "Done" : "Rearranging…") : `${left} of ${p.slots.length} to go`}
      </span>
      {isTurn && p.isBot && <span className="text-xs font-bold text-brass-lit">Thinking…</span>}
      {disconnected && <span className="text-xs text-parchment">Reconnecting…</span>}
    </div>
  );
}
