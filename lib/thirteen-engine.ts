/**
 * 13, three players, as pure state transitions run by the host (online) or the local simulator.
 * Each action works on a copy of the state and returns the new one.
 *
 * 54 cards (two wild Jokers), 18 each. Whoever leads plays any combination; the others must
 * play the same kind and size but higher, or pass and sit the trick out. A bomb comes down only
 * on 2s (as many as its tier allows) or on a weaker bomb. When everyone else has passed, the
 * last player to play leads again. First to empty their hand wins.
 */
import type { Card } from "@/types/cards";
import type { ActionResult, PlayerSeed } from "@/types/game";
import type { BombTiebreaker, Combo, ThirteenAction, ThirteenPlay, ThirteenPlayer, ThirteenSeat, ThirteenSettings, ThirteenState } from "@/types/thirteen";
import { createDeck, nextRandom, shuffle } from "./cards";
import { beats, comboKey, describeCombo, isBombable, readCombos } from "./thirteen-combos";
import type { GameDefinition } from "./multiplayer/room";

export const THIRTEEN_MIN_PLAYERS = 3;
/** Three play; anyone else at the table watches and waits for a seat. */
export const THIRTEEN_MAX_PLAYERS = 9;
export const THIRTEEN_SEATS = 3;
export const HAND_SIZE = 18;
export const THREE_OF_SPADES = "3S";

export const THIRTEEN_DEFAULTS: ThirteenSettings = { bombAfterPass: true, bombTiebreaker: "natural", threeSpadesEveryHand: false, seatIds: null, winnerStaysOn: false };

type Result = ActionResult<ThirteenState>;
const fail = (state: ThirteenState, error: string): Result => ({ ok: false, error, state });
const succeed = (state: ThirteenState): Result => ({ ok: true, state: { ...state, version: state.version + 1 } });

const TIEBREAKS: BombTiebreaker[] = ["natural", "strict", "challenger"];

export function sanitizeThirteenSettings(s: Partial<ThirteenSettings>): ThirteenSettings {
  const ids = s.seatIds;
  const trio = Array.isArray(ids) && ids.length === THIRTEEN_SEATS && new Set(ids).size === THIRTEEN_SEATS ? (ids as [string, string, string]) : null;
  return {
    bombAfterPass: s.bombAfterPass !== false,
    bombTiebreaker: TIEBREAKS.includes(s.bombTiebreaker as BombTiebreaker) ? (s.bombTiebreaker as BombTiebreaker) : "natural",
    threeSpadesEveryHand: !!s.threeSpadesEveryHand,
    seatIds: trio,
    winnerStaysOn: !!s.winnerStaysOn,
  };
}

const seat = (seed: PlayerSeed, isHost: boolean): ThirteenPlayer => ({
  id: seed.id,
  name: seed.name.trim() || "Player",
  isBot: !!seed.isBot,
  ...(seed.botDifficulty ? { botDifficulty: seed.botDifficulty } : {}),
  isHost,
});

export function createThirteenRoom(params: { roomId: string; host: PlayerSeed; settings?: Partial<ThirteenSettings> }): ThirteenState {
  return {
    mode: "thirteen",
    roomId: params.roomId,
    version: 0,
    phase: "lobby",
    settings: sanitizeThirteenSettings({ ...THIRTEEN_DEFAULTS, ...params.settings }),
    players: [seat(params.host, true)],
    hostId: params.host.id,
    rngState: 0,
    seats: null,
    currentTurnId: null,
    trick: [],
    passStreak: 0,
    openWith3S: false,
    log: [],
    winnerId: null,
    lastWinnerId: null,
  };
}

/** Back to the lobby, keeping who won last (they lead the next hand). */
function resetToLobby(s: ThirteenState): ThirteenState {
  const fresh = createThirteenRoom({ roomId: s.roomId, host: { id: s.hostId, name: "" }, settings: s.settings });
  return { ...fresh, version: s.version, lastWinnerId: s.lastWinnerId, players: s.players.map((p) => ({ ...seat(p, p.id === s.hostId), name: p.name })) };
}

/** Who plays: the host's pick if all three are still here, otherwise the first three seats. */
export function trioOf(s: Pick<ThirteenState, "players" | "settings">): string[] {
  const pick = s.settings.seatIds;
  if (pick && pick.every((id) => s.players.some((p) => p.id === id))) return pick;
  return s.players.slice(0, THIRTEEN_SEATS).map((p) => p.id);
}

/** Winner stays on: whoever held the most cards gives their seat to the next in line round the table. */
export function nextTrio(s: Pick<ThirteenState, "players" | "seats" | "winnerId">): [string, string, string] | null {
  if (!s.seats || !s.winnerId) return null;
  const losers = s.seats.filter((x) => x.id !== s.winnerId);
  // Most cards left goes; on a tie, the later seat.
  const out = losers.reduce((a, b) => (b.hand.length >= a.hand.length ? b : a));
  const staying = new Set(s.seats.map((x) => x.id).filter((id) => id !== out.id));
  const line = s.players.map((p) => p.id).filter((id) => !staying.has(id));
  const incoming = line[(line.indexOf(out.id) + 1) % line.length];
  if (!incoming || incoming === out.id) return null;
  return s.seats.map((x) => (x.id === out.id ? incoming : x.id)) as [string, string, string];
}

// ---------------------------------------------------------------------------
// Judging a play
// ---------------------------------------------------------------------------

export interface PlayContext {
  /** What's on the table to beat; null when leading. */
  top: Combo | null;
  /** The player passed this trick. */
  passed: boolean;
  bombAfterPass: boolean;
  tiebreak: BombTiebreaker;
  /** The hand's first play: it must include the 3♠. */
  needs3S: boolean;
}

export interface Judgement {
  /** Every reading of the cards, strongest first. */
  readings: Combo[];
  /** The readings allowed right now, strongest first. */
  allowed: Combo[];
  /** Why none is allowed. */
  reason: string | null;
}

/** Whether these cards can be played now, and as what. Shared by the rules and the table's preview. */
export function judgePlay(ctx: PlayContext, cards: readonly Card[]): Judgement {
  const readings = readCombos(cards);
  if (cards.length === 0) return { readings, allowed: [], reason: "Pick some cards" };
  if (readings.length === 0) return { readings, allowed: [], reason: "Not a combination" };
  if (ctx.needs3S && !cards.some((c) => c.id === THREE_OF_SPADES)) return { readings, allowed: [], reason: "The first play must include the 3♠" };
  const { top } = ctx;
  if (!top) return { readings, allowed: readings, reason: null };
  const allowed = readings.filter((c) => (!ctx.passed || (ctx.bombAfterPass && c.type === "bomb")) && beats(c, top, ctx.tiebreak));
  if (allowed.length > 0) return { readings, allowed, reason: null };
  if (ctx.passed) return { readings, allowed, reason: ctx.bombAfterPass ? "You passed: only a bomb gets you back in" : "You passed this trick" };
  if (top.type === "bomb") return { readings, allowed, reason: "Only a stronger bomb beats a bomb" };
  if (readings.some((c) => c.type === "bomb")) return { readings, allowed, reason: isBombable(top) ? "This bomb can't beat that many 2s" : "Bombs only come down on 2s or a bomb" };
  return { readings, allowed, reason: `Doesn't beat ${describeCombo(top)}` };
}

const topOf = (s: Pick<ThirteenState, "trick">) => s.trick.at(-1)?.combo ?? null;

export function contextFor(s: Pick<ThirteenState, "trick" | "settings" | "openWith3S"> & { seats: { id: string; passed: boolean }[] | null }, playerId: string): PlayContext {
  return {
    top: topOf(s),
    passed: !!s.seats?.find((x) => x.id === playerId)?.passed,
    bombAfterPass: s.settings.bombAfterPass,
    tiebreak: s.settings.bombTiebreaker,
    needs3S: s.openWith3S,
  };
}

// ---------------------------------------------------------------------------
// Turns and tricks
// ---------------------------------------------------------------------------

const seatOf = (s: ThirteenState, id: string) => s.seats!.find((x) => x.id === id);
const after = (s: ThirteenState, id: string) => s.seats![(s.seats!.findIndex((x) => x.id === id) + 1) % s.seats!.length];

function log(s: ThirteenState, e: Record<string, unknown>) {
  s.log.push({ n: (s.log.at(-1)?.n ?? -1) + 1, ...e } as ThirteenState["log"][number]);
}

/** Everyone else has passed: the last player to play leads a fresh trick. */
function clearTrick(s: ThirteenState) {
  const leader = s.trick.at(-1)!.by;
  log(s, { kind: "clear", leader });
  s.trick = [];
  s.passStreak = 0;
  for (const x of s.seats!) x.passed = false;
  s.currentTurnId = leader;
}

/** Hand the turn on. Anyone who passed is skipped (counting as another pass) unless they may still bomb. */
function advance(s: ThirteenState, fromId: string) {
  let next = after(s, fromId);
  while (s.trick.length > 0 && next.passed && !(s.settings.bombAfterPass && isBombable(topOf(s)!))) {
    s.passStreak += 1;
    if (s.passStreak >= s.seats!.length - 1) return clearTrick(s);
    next = after(s, next.id);
  }
  s.currentTurnId = next.id;
}

function play(state: ThirteenState, playerId: string, cardIds: string[], read?: string): Result {
  if (state.phase !== "playing") return fail(state, "There's no hand being played");
  const me = state.seats?.find((x) => x.id === playerId);
  if (!me) return fail(state, "You're watching this one");
  if (state.currentTurnId !== playerId) return fail(state, "It's not your turn");
  if (new Set(cardIds).size !== cardIds.length) return fail(state, "Each card can only be played once");
  const cards = cardIds.map((id) => me.hand.find((c) => c.id === id));
  if (cards.some((c) => !c)) return fail(state, "That card isn't in your hand");

  const verdict = judgePlay(contextFor(state, playerId), cards as Card[]);
  if (verdict.reason) return fail(state, verdict.reason);
  const combo = read === undefined ? verdict.allowed[0] : verdict.allowed.find((c) => comboKey(c) === read);
  if (!combo) return fail(state, "Those cards can't count that way");

  const s = structuredClone(state);
  const seatNow = seatOf(s, playerId)!;
  const top = topOf(s);
  const entry: ThirteenPlay = { by: playerId, cards: cards as Card[], combo, chop: top && combo.type === "bomb" ? (top.type === "bomb" ? "bomb" : "twos") : null };
  seatNow.hand = seatNow.hand.filter((c) => !cardIds.includes(c.id));
  seatNow.passed = false;
  s.trick.push(entry);
  log(s, { kind: "play", ...entry });
  s.passStreak = 0;
  s.openWith3S = false;

  if (seatNow.hand.length === 0) {
    s.phase = "game_over";
    s.winnerId = playerId;
    s.lastWinnerId = playerId;
    s.currentTurnId = null;
    return succeed(s);
  }
  advance(s, playerId);
  return succeed(s);
}

function pass(state: ThirteenState, playerId: string): Result {
  if (state.phase !== "playing") return fail(state, "There's no hand being played");
  const me = state.seats?.find((x) => x.id === playerId);
  if (!me) return fail(state, "You're watching this one");
  if (state.currentTurnId !== playerId) return fail(state, "It's not your turn");
  if (state.trick.length === 0) return fail(state, "You lead: play anything");
  const s = structuredClone(state);
  seatOf(s, playerId)!.passed = true;
  log(s, { kind: "pass", by: playerId });
  s.passStreak += 1;
  if (s.passStreak >= s.seats!.length - 1) clearTrick(s);
  else advance(s, playerId);
  return succeed(s);
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export function applyThirteenAction(state: ThirteenState, action: ThirteenAction): Result {
  switch (action.type) {
    case "JOIN_ROOM": {
      if (state.phase !== "lobby") return fail(state, "Game already in progress");
      if (state.players.length >= THIRTEEN_MAX_PLAYERS) return fail(state, `Room is full (max ${THIRTEEN_MAX_PLAYERS})`);
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
      const name = action.name.slice(0, 20);
      return succeed({ ...state, players: state.players.map((p) => (p.id === action.playerId ? { ...p, name } : p)) });
    }
    case "UPDATE_SETTINGS": {
      if (state.phase !== "lobby") return fail(state, "Settings are locked once the game starts");
      if (action.playerId !== state.hostId) return fail(state, "Only the host can change settings");
      return succeed({ ...state, settings: sanitizeThirteenSettings({ ...state.settings, ...action.settings }) });
    }
    case "START_GAME": {
      if (state.phase !== "lobby") return fail(state, "Game already started");
      if (action.playerId !== state.hostId) return fail(state, "Only the host can start the game");
      if (state.players.length < THIRTEEN_MIN_PLAYERS) return fail(state, "Thirteen needs three players");
      const s = structuredClone(resetToLobby(state));
      const [, rng] = nextRandom(action.seed >>> 0);
      const { result, rngState } = shuffle(createDeck(true), rng);
      s.rngState = rngState;
      const ids = trioOf(s);
      s.seats = ids.map((id): ThirteenSeat => ({ id, hand: [], passed: false }));
      result.forEach((c, i) => s.seats![i % THIRTEEN_SEATS].hand.push(c));
      // A new table (or the house rule) opens with the 3♠; otherwise last hand's winner leads.
      s.openWith3S = s.settings.threeSpadesEveryHand || !s.lastWinnerId || !ids.includes(s.lastWinnerId);
      s.currentTurnId = s.openWith3S ? s.seats.find((x) => x.hand.some((c) => c.id === THREE_OF_SPADES))!.id : s.lastWinnerId;
      s.phase = "playing";
      return succeed(s);
    }
    case "PLAY":
      return play(state, action.playerId, action.cardIds, action.read);
    case "PASS":
      return pass(state, action.playerId);
    case "RETURN_TO_LOBBY": {
      if (action.playerId !== state.hostId) return fail(state, "Only the host can reset the game");
      const next = resetToLobby(state);
      const trio = state.phase === "game_over" && state.settings.winnerStaysOn ? nextTrio(state) : null;
      return succeed(trio ? { ...next, settings: { ...next.settings, seatIds: trio } } : next);
    }
  }
}

// ---------------------------------------------------------------------------
// Views & legal moves
// ---------------------------------------------------------------------------

export interface ThirteenPublicSeat {
  id: string;
  count: number;
  passed: boolean;
  /** Your own hand; null for anyone else's. */
  hand: Card[] | null;
}

export interface ThirteenView extends Omit<ThirteenState, "rngState" | "seats"> {
  viewerId: string | null;
  godMode: boolean;
  seats: ThirteenPublicSeat[] | null;
}

/** What one player (or spectator) sees: their own hand, everyone's card count, and the table. */
export function getThirteenView(state: ThirteenState, viewer: string | "god"): ThirteenView {
  const godMode = viewer === "god";
  const { rngState: _r, seats, ...rest } = state;
  void _r;
  return {
    ...rest,
    viewerId: godMode ? null : viewer,
    godMode,
    seats: seats?.map((x) => ({ id: x.id, count: x.hand.length, passed: x.passed, hand: godMode || x.id === viewer ? x.hand : null })) ?? null,
  };
}

export interface ThirteenLegal {
  isMyTurn: boolean;
  /** Nothing on the table: play anything. */
  leading: boolean;
  /** Passed this trick: only a bomb (if allowed), or pass again. */
  lockedOut: boolean;
  context: PlayContext | null;
}

export function getThirteenLegal(view: ThirteenView, playerId: string | null): ThirteenLegal {
  const mine = view.phase === "playing" && !!playerId && view.currentTurnId === playerId && !!view.seats?.some((x) => x.id === playerId);
  if (!mine) return { isMyTurn: false, leading: false, lockedOut: false, context: null };
  const context = contextFor(view, playerId!);
  return { isMyTurn: true, leading: view.trick.length === 0, lockedOut: context.passed, context };
}

/** Winner first, then by fewest cards left. */
export function standings(view: Pick<ThirteenView, "seats" | "winnerId">) {
  return [...(view.seats ?? [])].sort((a, b) => (a.id === view.winnerId ? -1 : b.id === view.winnerId ? 1 : a.count - b.count));
}

/** Thirteen as a game the online room can host. */
export const thirteenGame: GameDefinition<ThirteenState, ThirteenAction, ThirteenView> = {
  applyAction: applyThirteenAction,
  getPlayerView: getThirteenView,
  join: (player) => ({ type: "JOIN_ROOM", player }),
  leave: (playerId) => ({ type: "LEAVE_ROOM", playerId }),
  maxPlayers: THIRTEEN_MAX_PLAYERS,
};
