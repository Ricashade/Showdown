/**
 * Speed, two players at once, as pure state transitions run by the host (online) or the local
 * simulator. There are no turns: moves are applied in the order they reach the host, and the
 * host stamps its own clock (`now`) on each one.
 *
 * Each player has five cards in hand and fifteen in their stock. Cards go onto either middle
 * pile one rank up or down (King, Ace and 2 wrap round). A move made against a pile that has
 * since changed still lands if it fits the new top card; otherwise it's too slow. When nobody
 * can go, a spare turns onto each pile. First to play every card wins.
 */
import { cleanName } from "./names";
import type { Card, Rank } from "@/types/cards";
import { GOD_VIEW, type ActionResult, type PlayerSeed, type ViewerId } from "@/types/game";
import { HAND_SLOTS, type SpeedAction, type SpeedEvent, type SpeedPlayer, type SpeedSettings, type SpeedSide, type SpeedState, type SpeedWinBy } from "@/types/speed";
import { createDeck, nextRandom, shuffle, seedRng } from "./cards";
import type { GameDefinition } from "./multiplayer/room";

export const SPEED_MIN_PLAYERS = 2;
/** Two play; anyone else at the table watches. */
export const SPEED_MAX_PLAYERS = 9;
export const STOCK_SIZE = 15;
export const SPARE_SIZE = 5;
/** 3, 2, 1, Speed. */
export const COUNTDOWN_MS = 3000;
/** The beat between everyone being stuck and the new cards turning over. */
export const STALL_MS = 600;
const CLOCK_SLACK_MS = 150;
const LOG_KEEP = 24;

export const SPEED_DEFAULTS: SpeedSettings = { autoDraw: true, allowSameRank: true, allowDoubles: true, winBy: "empty", duelistIds: null, winnerStaysOn: false };

type Result = ActionResult<SpeedState>;
const fail = (state: SpeedState, error: string): Result => ({ ok: false, error, state });
const succeed = (state: SpeedState): Result => ({ ok: true, state: { ...state, version: state.version + 1 } });

export function sanitizeSpeedSettings(s: Partial<SpeedSettings>): SpeedSettings {
  const pair = Array.isArray(s.duelistIds) && s.duelistIds.length === 2 && s.duelistIds[0] !== s.duelistIds[1] ? (s.duelistIds as [string, string]) : null;
  return {
    autoDraw: s.autoDraw !== false,
    allowSameRank: s.allowSameRank !== false,
    allowDoubles: s.allowDoubles !== false,
    winBy: (s.winBy === "slap" ? "slap" : "empty") as SpeedWinBy,
    duelistIds: pair,
    winnerStaysOn: !!s.winnerStaysOn,
  };
}

const seat = (seed: PlayerSeed, isHost: boolean): SpeedPlayer => ({
  id: seed.id,
  name: cleanName(seed.name) ?? "Player",
  isBot: !!seed.isBot,
  ...(seed.botDifficulty ? { botDifficulty: seed.botDifficulty } : {}),
  isHost,
});

export function createSpeedRoom(params: { roomId: string; host: PlayerSeed; settings?: Partial<SpeedSettings> }): SpeedState {
  return {
    mode: "speed",
    roomId: params.roomId,
    version: 0,
    phase: "lobby",
    settings: sanitizeSpeedSettings({ ...SPEED_DEFAULTS, ...params.settings }),
    players: [seat(params.host, true)],
    hostId: params.host.id,
    rngState: seedRng(0),
    sides: null,
    piles: [[], []],
    spares: [[], []],
    clockAt: null,
    boardAt: 0,
    emptyId: null,
    log: [],
    winnerIds: [],
  };
}

function resetToLobby(s: SpeedState): SpeedState {
  const fresh = createSpeedRoom({ roomId: s.roomId, host: { id: s.hostId, name: "" }, settings: s.settings });
  return { ...fresh, version: s.version, players: s.players.map((p) => ({ ...seat(p, p.id === s.hostId), name: p.name })) };
}

/** Who plays: the host's pick if both are still seated, otherwise the first two seats. */
export function duelistsOf(s: Pick<SpeedState, "players" | "settings">): [string, string] {
  const pick = s.settings.duelistIds;
  if (pick && pick.every((id) => s.players.some((p) => p.id === id))) return pick;
  return [s.players[0]?.id, s.players[1]?.id] as [string, string];
}

/** Winner stays on: they face whoever sits next after the player they beat, round the table. */
export function nextDuel(s: Pick<SpeedState, "players" | "sides" | "winnerIds">): [string, string] | null {
  if (s.winnerIds.length !== 1 || !s.sides) return null;
  const winner = s.winnerIds[0];
  const loser = s.sides.find((x) => x.id !== winner)!.id;
  const line = s.players.map((p) => p.id).filter((id) => id !== winner);
  return line.length ? [winner, line[(line.indexOf(loser) + 1) % line.length]] : null;
}

// ---------------------------------------------------------------------------
// What fits where
// ---------------------------------------------------------------------------

const rankOf = (c: Card): Rank => (c.kind === "standard" ? c.rank : 2);

/** One rank up or down, King to Ace to 2 and round; the same rank too, if the house allows. */
export function fits(card: Card, top: Card, allowSameRank: boolean): boolean {
  const step = (rankOf(card) - rankOf(top) + 13) % 13;
  return step === 1 || step === 12 || (allowSameRank && step === 0);
}

export const cardsLeft = (side: Pick<SpeedSide, "hand" | "stock">) => side.hand.filter(Boolean).length + side.stock.length;

/** Whether this side has a move: a card that fits either pile, or empty slots to draw into. */
export function canGo(side: Pick<SpeedSide, "hand" | "stock">, piles: SpeedState["piles"], settings: SpeedSettings): boolean {
  const tops = piles.map((p) => p.at(-1)).filter((c): c is Card => !!c);
  if (side.hand.some((c) => c && tops.some((t) => fits(c, t, settings.allowSameRank)))) return true;
  return !settings.autoDraw && side.stock.length > 0 && side.hand.some((c) => c === null);
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

const sideOf = (s: SpeedState, id: string) => s.sides?.find((x) => x.id === id);

type Unnumbered = SpeedEvent extends infer E ? (E extends SpeedEvent ? Omit<E, "n"> : never) : never;

function log(s: SpeedState, e: Unnumbered) {
  s.log = [...s.log, { n: (s.log.at(-1)?.n ?? -1) + 1, ...e } as SpeedEvent].slice(-LOG_KEEP);
}

function refill(side: SpeedSide) {
  for (let i = 0; i < HAND_SLOTS; i++) if (side.hand[i] === null && side.stock.length) side.hand[i] = side.stock.pop()!;
}

/** Back to live play, or straight into a stall if nobody can go. */
function resume(s: SpeedState, now: number): SpeedState {
  for (const x of s.sides!) x.flipVote = false;
  s.emptyId = null;
  if (s.sides!.some((x) => canGo(x, s.piles, s.settings))) {
    s.phase = "live";
    s.clockAt = null;
  } else {
    s.phase = "stalled";
    s.clockAt = now + STALL_MS;
  }
  return s;
}

function end(s: SpeedState, winnerIds: string[]): SpeedState {
  s.phase = "game_over";
  s.winnerIds = winnerIds;
  s.clockAt = null;
  return s;
}

/** A spare onto each pile. Spares all gone: everything under the two tops is shuffled into new spares. */
function flip(s: SpeedState, now: number): SpeedState {
  let reshuffled = false;
  if (s.spares[0].length + s.spares[1].length === 0) {
    const under = [...s.piles[0].slice(0, -1), ...s.piles[1].slice(0, -1)];
    if (under.length === 0) {
      // Not a card left to turn: fewest cards wins.
      const least = Math.min(...s.sides!.map(cardsLeft));
      return end(s, s.sides!.filter((x) => cardsLeft(x) === least).map((x) => x.id));
    }
    s.piles = [s.piles[0].slice(-1), s.piles[1].slice(-1)];
    const { result, rngState } = shuffle(under, s.rngState);
    s.rngState = rngState;
    const half = Math.ceil(result.length / 2);
    s.spares = [result.slice(0, half), result.slice(half)];
    reshuffled = true;
  }
  for (const i of [0, 1] as const) {
    const card = s.spares[i].pop() ?? s.spares[1 - i].pop();
    if (card) s.piles[i].push(card);
  }
  s.boardAt = now;
  log(s, { kind: "flip", reshuffled, at: now });
  return resume(s, now);
}

function play(state: SpeedState, a: Extract<SpeedAction, { type: "PLAY" }>, now: number): Result {
  if (state.phase !== "live") return fail(state, state.phase === "stalled" ? "New cards are coming" : "Not yet");
  const me = sideOf(state, a.playerId);
  if (!me) return fail(state, "You're watching this one");
  if (a.pile !== 0 && a.pile !== 1) return fail(state, "There's no such pile");
  const ids = [...new Set(a.cardIds)];
  const cards = ids.map((id) => me.hand.find((c) => c?.id === id));
  if (cards.length === 0 || cards.some((c) => !c)) return fail(state, "That card isn't in your hand");
  const played = cards as Card[];
  if (played.length > 1 && (!state.settings.allowDoubles || played.some((c) => rankOf(c) !== rankOf(played[0])))) return fail(state, "Only cards of one rank go down together");
  const top = state.piles[a.pile].at(-1)!;
  if (!fits(played[0], top, state.settings.allowSameRank)) return fail(state, top.id !== a.expectedTopId ? "Too slow!" : "That doesn't fit");

  const s = structuredClone(state);
  const side = sideOf(s, a.playerId)!;
  side.hand = side.hand.map((c) => (c && ids.includes(c.id) ? null : c));
  s.piles[a.pile].push(...played);
  side.lastPlayAt = now;
  s.boardAt = now;
  log(s, { kind: "play", by: a.playerId, cards: played, pile: a.pile, at: now });
  if (s.settings.autoDraw) refill(side);

  if (cardsLeft(side) === 0) {
    if (s.settings.winBy === "empty") return succeed(end(s, [side.id]));
    s.phase = "slap";
    s.emptyId = side.id;
    s.clockAt = null;
    return succeed(s);
  }
  return succeed(resume(s, now));
}

/** Slapped Speed before the player who went out: they take back the smaller pile (all but its top). */
function slap(state: SpeedState, playerId: string, now: number): Result {
  if (state.phase !== "slap") return fail(state, "Nothing to slap");
  if (!sideOf(state, playerId)) return fail(state, "You're watching this one");
  const s = structuredClone(state);
  const out = s.emptyId!;
  if (playerId === out) return succeed(end(s, [out]));
  const unders = s.piles.map((p) => p.length - 1);
  const choices = ([0, 1] as const).filter((i) => unders[i] > 0).sort((x, y) => unders[x] - unders[y]);
  // Nothing under either pile to take back: going out stands.
  if (choices.length === 0) return succeed(end(s, [out]));
  const i = choices[0];
  const taken = s.piles[i].slice(0, -1);
  s.piles[i] = s.piles[i].slice(-1);
  const { result, rngState } = shuffle(taken, s.rngState);
  s.rngState = rngState;
  const side = sideOf(s, out)!;
  side.stock = result;
  if (s.settings.autoDraw) refill(side);
  log(s, { kind: "caught", by: playerId, caught: out, cards: taken.length, at: now });
  s.boardAt = now;
  return succeed(resume(s, now));
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export function applySpeedAction(state: SpeedState, action: SpeedAction, now = 0): Result {
  switch (action.type) {
    case "JOIN_ROOM": {
      if (state.phase !== "lobby") return fail(state, "Game already in progress");
      if (state.players.length >= SPEED_MAX_PLAYERS) return fail(state, `Room is full (max ${SPEED_MAX_PLAYERS})`);
      if (state.players.some((p) => p.id === action.player.id)) return fail(state, "Player already in room");
      return succeed({ ...state, players: [...state.players, seat(action.player, false)] });
    }
    case "LEAVE_ROOM": {
      if (state.phase !== "lobby") return fail(state, "Players can only leave from the lobby");
      const leaving = state.players.find((p) => p.id === action.playerId);
      if (!leaving) return fail(state, "Player not in room");
      const players = state.players.filter((p) => p.id !== action.playerId);
      if (players.length === 0) return fail(state, "The last player can't leave");
      const hostId = leaving.isHost ? players[0].id : state.hostId;
      return succeed({ ...state, hostId, players: players.map((p) => ({ ...p, isHost: p.id === hostId })) });
    }
    case "RENAME_PLAYER": {
      if (state.phase !== "lobby") return fail(state, "Names are locked once the game starts");
      if (!state.players.some((p) => p.id === action.playerId)) return fail(state, "Player not in room");
      const name = cleanName(action.name);
      if (!name) return fail(state, "Pick a name");
      return succeed({ ...state, players: state.players.map((p) => (p.id === action.playerId ? { ...p, name } : p)) });
    }
    case "UPDATE_SETTINGS": {
      if (state.phase !== "lobby") return fail(state, "Settings are locked once the game starts");
      if (action.playerId !== state.hostId) return fail(state, "Only the host can change settings");
      return succeed({ ...state, settings: sanitizeSpeedSettings({ ...state.settings, ...action.settings }) });
    }
    case "START_GAME": {
      if (state.phase !== "lobby") return fail(state, "Game already started");
      if (action.playerId !== state.hostId) return fail(state, "Only the host can start the game");
      if (state.players.length < SPEED_MIN_PLAYERS) return fail(state, "Speed needs two players");
      const s = structuredClone(resetToLobby(state));
      const [, rng] = nextRandom(seedRng(action.seed));
      const { result, rngState } = shuffle(createDeck(false), rng);
      s.rngState = rngState;
      const deck = [...result];
      const side = (id: string): SpeedSide => {
        const hand = deck.splice(0, HAND_SLOTS);
        return { id, hand, stock: deck.splice(0, STOCK_SIZE), flipVote: false, lastPlayAt: now };
      };
      const [a, b] = duelistsOf(s);
      s.sides = [side(a), side(b)];
      s.spares = [deck.splice(0, SPARE_SIZE), deck.splice(0, SPARE_SIZE)];
      s.piles = [deck.splice(0, 1), deck.splice(0, 1)];
      s.phase = "countdown";
      s.clockAt = now + COUNTDOWN_MS;
      s.boardAt = now;
      return succeed(s);
    }
    case "GO": {
      if (action.playerId !== state.hostId) return fail(state, "Only the host's clock can do that");
      if (state.phase !== "countdown" || now < state.clockAt! - CLOCK_SLACK_MS) return fail(state, "Not yet");
      const s = structuredClone(state);
      s.boardAt = now;
      for (const x of s.sides!) x.lastPlayAt = now;
      return succeed(resume(s, now));
    }
    case "PLAY":
      return play(state, action, now);
    case "DRAW": {
      if (state.phase !== "live") return fail(state, "Not now");
      const me = sideOf(state, action.playerId);
      if (!me) return fail(state, "You're watching this one");
      if (!me.hand.includes(null) || me.stock.length === 0) return fail(state, me.stock.length ? "Your hand is full" : "Your stock is empty");
      const s = structuredClone(state);
      refill(sideOf(s, action.playerId)!);
      return succeed(resume(s, now));
    }
    case "VOTE_FLIP": {
      if (state.phase !== "live") return fail(state, "Not now");
      if (!sideOf(state, action.playerId)) return fail(state, "You're watching this one");
      const s = structuredClone(state);
      const me = sideOf(s, action.playerId)!;
      me.flipVote = !me.flipVote;
      if (s.sides!.every((x) => x.flipVote)) {
        s.phase = "stalled";
        s.clockAt = now + STALL_MS;
      }
      return succeed(s);
    }
    case "FLIP": {
      if (action.playerId !== state.hostId) return fail(state, "Only the host's clock can do that");
      if (state.phase !== "stalled" || now < state.clockAt! - CLOCK_SLACK_MS) return fail(state, "Not yet");
      return succeed(flip(structuredClone(state), now));
    }
    case "SLAP":
      return slap(state, action.playerId, now);
    case "RETURN_TO_LOBBY": {
      if (action.playerId !== state.hostId) return fail(state, "Only the host can reset the game");
      const next = resetToLobby(state);
      const duel = state.phase === "game_over" && state.settings.winnerStaysOn ? nextDuel(state) : null;
      return succeed(duel ? { ...next, settings: { ...next.settings, duelistIds: duel } } : next);
    }
  }
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export interface SpeedPublicSide {
  id: string;
  /** Your own hand; null for the other player's. */
  hand: (Card | null)[] | null;
  /** Which of the five slots hold a card (everyone sees this). */
  filled: boolean[];
  stockCount: number;
  flipVote: boolean;
}

/** How much of each pile anyone needs to see. */
const PILE_SHOWN = 6;

export interface SpeedView extends Omit<SpeedState, "rngState" | "sides" | "piles" | "spares"> {
  viewerId: string | null;
  godMode: boolean;
  sides: [SpeedPublicSide, SpeedPublicSide] | null;
  /** The top few cards of each pile, top last; empty while face down. */
  piles: [Card[], Card[]];
  pileCounts: [number, number];
  spareCounts: [number, number];
}

/** What one player (or spectator) sees: your own hand, the piles, and how many cards everyone has. */
export function getSpeedView(state: SpeedState, viewer: ViewerId): SpeedView {
  const godMode = viewer === GOD_VIEW;
  const { rngState: _r, sides, piles, spares, ...rest } = state;
  void _r;
  const hidden = state.phase === "countdown";
  const pub = (x: SpeedSide): SpeedPublicSide => ({
    id: x.id,
    hand: godMode || x.id === viewer ? x.hand : null,
    filled: x.hand.map((c) => c !== null),
    stockCount: x.stock.length,
    flipVote: x.flipVote,
  });
  return {
    ...rest,
    viewerId: godMode ? null : viewer,
    godMode,
    sides: sides ? [pub(sides[0]), pub(sides[1])] : null,
    piles: hidden ? [[], []] : [piles[0].slice(-PILE_SHOWN), piles[1].slice(-PILE_SHOWN)],
    pileCounts: [piles[0].length, piles[1].length],
    spareCounts: [spares[0].length, spares[1].length],
  };
}

/** Where a card can go right now: the piles it fits. */
export function targetsFor(card: Card, view: Pick<SpeedView, "piles" | "settings">): (0 | 1)[] {
  return ([0, 1] as const).filter((i) => {
    const top = view.piles[i].at(-1);
    return !!top && fits(card, top, view.settings.allowSameRank);
  });
}

/** Speed as a game the online room can host. The host's clock stamps every move. */
export const speedGame: GameDefinition<SpeedState, SpeedAction, SpeedView> = {
  applyAction: (state, action) => applySpeedAction(state, action, Date.now()),
  getPlayerView: getSpeedView,
  join: (player) => ({ type: "JOIN_ROOM", player }),
  leave: (playerId) => ({ type: "LEAVE_ROOM", playerId }),
  maxPlayers: SPEED_MAX_PLAYERS,
};

/** What the table does by itself: end the countdown, or turn new cards over a stall. */
export function speedClock(s: SpeedState): { at: number; action: SpeedAction } | null {
  if (s.clockAt === null) return null;
  if (s.phase === "countdown") return { at: s.clockAt, action: { type: "GO", playerId: s.hostId } };
  if (s.phase === "stalled") return { at: s.clockAt, action: { type: "FLIP", playerId: s.hostId } };
  return null;
}
