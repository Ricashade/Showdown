import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";
import type { GameId } from "@/lib/games";
import s from "./TableLoader.module.css";

/**
 * The cover while a table is being set: the room goes dark but for a pool of felt under the lamp,
 * where the game deals its own signature move on a loop, over a hairline with a brass glint.
 * Pure CSS transforms and opacity, so it keeps moving even while the table is built behind it.
 * Cards turn over flat (squeezed to their edge and back, like the idle background's cards):
 * 3D card flips can leave the page painting wrong when it's scrolled.
 */
export function TableLoader({ game }: { game: GameId }) {
  return (
    <div role="status" aria-label="Setting up the table" className={s.overlay}>
      <div className={s.inner}>
        <div className={clsx(s.stage, s[STAGE[game]])}>{VIGNETTES[game]()}</div>
        <div aria-hidden className={s.track} />
      </div>
    </div>
  );
}

const SUITS = { s: "♠︎", h: "♥︎", d: "♦︎", c: "♣︎" } as const;

/** A two-sided card: `code` like "As" or "10h". The face sits over the back and fades in as the card turns. */
function Card({ code, small, className, style }: { code: string; small?: boolean; className?: string; style?: CSSProperties }) {
  const suit = code.slice(-1) as keyof typeof SUITS;
  return (
    <div aria-hidden className={clsx(s.card, small && s.small, className)} style={style}>
      <div className={clsx(s.backFace, "card-back")} />
      <div className={clsx(s.face, (suit === "h" || suit === "d") && s.red)}>
        <span className={s.rank}>{code.slice(0, -1)}</span>
        <span className={s.pip}>{SUITS[suit]}</span>
      </div>
    </div>
  );
}

/** Staggers a card; its face's animation reads the same delay. */
const delay = (seconds: number) => ({ "--d": `${seconds}s` }) as CSSProperties;

const STAGE: Record<GameId, string> = {
  "texas-holdem": "holdem",
  "bs-poker": "bs",
  blackjack: "blackjack",
  garbage: "garbage",
  rummy: "rummy",
  war: "war",
  "go-fish": "fish",
};

const VIGNETTES: Record<GameId, () => ReactNode> = {
  // The board: flop, turn, river.
  "texas-holdem": () =>
    ["As", "Kd", "7c", "Qh", "2s"].map((c, i) => (
      <div key={c}>
        <div className={s.slot} style={{ left: i * 52 }} />
        <Card code={c} className={i < 3 ? s.flop : i === 3 ? s.turn : s.river} style={{ left: i * 52, ...delay(i < 3 ? i * 0.08 : 0) }} />
      </div>
    )),
  // A held hand, each card peeked at in turn.
  "bs-poker": () =>
    ["Qd", "8s", "7h", "8d", "Jc"].map((c, i) => (
      <div key={c} className={s.fanSlot} style={{ transform: `rotate(${(i - 2) * 9}deg)` }}>
        <Card code={c} className={s.peek} style={delay(i * 0.2)} />
      </div>
    )),
  // A bet, the up card, then the hole card turns: blackjack.
  blackjack: () => (
    <>
      <div className={clsx("bet-chip", s.chip)} style={{ "--chip-face": "var(--color-brass-deep)" } as CSSProperties} />
      <Card code="Ks" className={s.bjFirst} style={{ left: 74 }} />
      <Card code="Ah" className={s.bjHole} style={{ left: 104 }} />
    </>
  ),
  // The ten-card spread turning up, ace to ten.
  garbage: () =>
    ["Ac", "2d", "3s", "4h", "5c", "6d", "7s", "8h", "9c", "10d"].map((c, i) => (
      <Card key={c} code={c} small className={s.turnUp} style={{ left: (i % 5) * 36, top: Math.floor(i / 5) * 48, ...delay(i * 0.1) }} />
    )),
  // A run built card by card, then laid off.
  rummy: () => ["5h", "6h", "7h", "8h"].map((c, i) => <Card key={c} code={c} className={s.meld} style={{ left: i * 26, ...delay(i * 0.16) }} />),
  // Two cards off two decks; the high one takes the other.
  war: () => (
    <>
      <div className={clsx(s.stack, "card-back")} style={{ left: 0 }} />
      <div className={clsx(s.stack, "card-back")} style={{ left: 192 }} />
      <Card code="As" className={s.warLeft} style={{ left: 0 }} />
      <Card code="9h" className={s.warRight} style={{ left: 192 }} />
    </>
  ),
  // Four sevens from four hands, settling into a book.
  "go-fish": () =>
    (
      [
        ["7s", "0px", "-56px", "-15deg"],
        ["7h", "72px", "0px", "-5deg"],
        ["7d", "0px", "56px", "5deg"],
        ["7c", "-72px", "0px", "15deg"],
      ] as const
    ).map(([c, fx, fy, r], i) => <Card key={c} code={c} className={s.book} style={{ "--fx": fx, "--fy": fy, "--r": r, ...delay(i * 0.2) } as CSSProperties} />),
};
