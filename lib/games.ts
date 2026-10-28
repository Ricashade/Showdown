/** Where each game lives and how its online rooms are named. */
export interface GameInfo {
  title: string;
  path: string;
  /** Room key for a code (see lib/multiplayer/session.ts). */
  roomKey: (code: string) => string;
}

export const BS_POKER: GameInfo = { title: "BS Poker", path: "/bs-poker", roomKey: (code) => code };
export const TEXAS_HOLDEM: GameInfo = { title: "Texas Hold'em", path: "/texas-holdem", roomKey: (code) => `holdem:${code}` };

export const BLACKJACK: GameInfo = { title: "Blackjack", path: "/blackjack", roomKey: (code) => `blackjack:${code}` };

export const GARBAGE: GameInfo = { title: "Garbage", path: "/garbage", roomKey: (code) => `garbage:${code}` };

export type GameId = "bs-poker" | "texas-holdem" | "blackjack" | "garbage";
/** Look-up by id: server pages pass the id, since GameInfo holds a function. */
export const GAMES: Record<GameId, GameInfo> = { "bs-poker": BS_POKER, "texas-holdem": TEXAS_HOLDEM, blackjack: BLACKJACK, garbage: GARBAGE };
