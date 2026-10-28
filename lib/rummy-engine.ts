/**
 * Rummy (Classic or Rummy 500) as pure state transitions, run by the host (online) or the local
 * simulator. Each action works on a copy of the state and returns the new one.
 *
 * A turn: draw (stock or discard pile), meld and lay off as you like, then discard. Empty your
 * hand and the round ends. Meld rules live in rummy-melds.ts.
 */
import type { Card } from "@/types/cards";
import type { ActionResult, PlayerSeed } from "@/types/game";
import type { Meld, RummyAction, RummyPlayer, RummySettings, RummyState, RummyVariant } from "@/types/rummy";
import { createDeck, nextRandom, rankName, shuffle } from "./cards";
import { cardPoints, handPoints, isPlayable, layOffShape, meldCardPoints, validateMeld } from "./rummy-melds";
import type { GameDefinition } from "./multiplayer/room";

export const RUMMY_MIN_PLAYERS = 2;
export const RUMMY_MAX_PLAYERS = 6;

/** Match target that suits each variant; picked when the host switches variant. */
export const DEFAULT_TARGET: Record<RummyVariant, number> = { classic: 100, rummy500: 500 };
export const TARGET_OPTIONS = [null, 100, 250, 500] as const;

export const RUMMY_DEFAULTS: RummySettings = { variant: "classic", aceRule: "both", targetScore: 100, jokers: false, twoPlayerHand: 10 };

type Result = ActionResult<RummyState>;
const fail = (state: RummyState, error: string): Result => ({ ok: false, error, state });
const succeed = (state: RummyState): Result => ({ ok: true, state: { ...state, version: state.version + 1 } });

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** One deck for up to four players, two for five or six. */
export const decksFor = (players: number) => (players >= 5 ? 2 : 1);
export const handSizeFor = (players: number, settings: RummySettings) => (players === 2 ? settings.twoPlayerHand : 7);

function freshDeck(decks: number, jokers: boolean): Card[] {
  const out: Card[] = [];
  for (let d = 0; d < decks; d++) for (const c of createDeck(jokers)) out.push({ ...c, id: `${c.id}.${d}` });
  return out;
}

export function sanitizeRummySettings(s: Partial<RummySettings>): RummySettings {
  const variant = s.variant === "rummy500" ? "rummy500" : "classic";
  const aceRule = s.aceRule === "low" || s.aceRule === "wrap" ? s.aceRule : "both";
  const targetScore = s.targetScore === null ? null : (TARGET_OPTIONS as readonly (number | null)[]).includes(Number(s.targetScore)) ? Number(s.targetScore) : DEFAULT_TARGET[variant];
  return { variant, aceRule, targetScore, jokers: !!s.jokers, twoPlayerHand: s.twoPlayerHand === 13 ? 13 : 10 };
}

function seat(seed: PlayerSeed, isHost: boolean): RummyPlayer {
  return {
    id: seed.id,
    name: seed.name.trim() || "Player",
    isBot: !!seed.isBot,
    ...(seed.botDifficulty ? { botDifficulty: seed.botDifficulty } : {}),
    isHost,
    hand: [],
    score: 0,
    meldedBefore: false,
    meldedThisTurn: false,
  };
}

export function createRummyRoom(params: { roomId: string; host: PlayerSeed; settings?: Partial<RummySettings> }): RummyState {
  return {
    mode: "rummy",
    roomId: params.roomId,
    version: 0,
    phase: "lobby",
    settings: sanitizeRummySettings({ ...RUMMY_DEFAULTS, ...params.settings }),
    players: [seat(params.host, true)],
    hostId: params.host.id,
    rngState: 0,
    stock: [],
    discard: [],
    melds: [],
    nextMeldId: 1,
    round: 0,
    dealerId: null,
    currentTurnId: null,
    step: "draw",
    mustPlayId: null,
    lastPickup: {},
    result: null,
    winnerId: null,
  };
}

function resetToLobby(s: RummyState): RummyState {
  const fresh = createRummyRoom({ roomId: s.roomId, host: { id: s.hostId, name: "" }, settings: s.settings });
  return { ...fresh, version: s.version, players: s.players.map((p) => ({ ...seat(p, p.id === s.hostId), name: p.name })) };
}

const getPlayer = (s: RummyState, id: string | null | undefined) => s.players.find((p) => p.id === id);
const nextAfter = (s: RummyState, id: string) => s.players[(s.players.findIndex((p) => p.id === id) + 1) % s.players.length];

function deal(s: RummyState, dealerId: string): RummyState {
  s.round += 1;
  const { result, rngState } = shuffle(freshDeck(decksFor(s.players.length), s.settings.jokers), s.rngState);
  s.rngState = rngState;
  s.stock = result;
  const size = handSizeFor(s.players.length, s.settings);
  for (const p of s.players) Object.assign(p, { hand: s.stock.splice(0, size), meldedBefore: false, meldedThisTurn: false });
  s.discard = [s.stock.shift()!];
  s.melds = [];
  s.dealerId = dealerId;
  s.currentTurnId = nextAfter(s, dealerId).id;
  s.step = "draw";
  s.mustPlayId = null;
  s.lastPickup = {};
  s.result = null;
  s.phase = "playing";
  return s;
}

// ---------------------------------------------------------------------------
// Ending a round
// ---------------------------------------------------------------------------

/** Points each player has on the table (Rummy 500 scores them). */
function tablePoints(s: RummyState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of s.melds) for (const c of m.cards) out[m.placedBy[c.id]] = (out[m.placedBy[c.id]] ?? 0) + meldCardPoints(m, c, s.settings.variant);
  return out;
}

function endRound(s: RummyState, winnerId: string | null): RummyState {
  const { variant, targetScore } = s.settings;
  const winner = getPlayer(s, winnerId);
  const rummy = !!winner && !winner.meldedBefore;
  const points: Record<string, number> = {};
  if (variant === "classic") {
    for (const p of s.players) points[p.id] = 0;
    if (winner) points[winner.id] = s.players.filter((p) => p !== winner).reduce((n, p) => n + handPoints(p.hand, variant), 0) * (rummy ? 2 : 1);
  } else {
    const onTable = tablePoints(s);
    for (const p of s.players) points[p.id] = (onTable[p.id] ?? 0) - handPoints(p.hand, variant);
    if (winner && rummy && points[winner.id] > 0) points[winner.id] *= 2;
  }
  for (const p of s.players) p.score += points[p.id];

  s.result = { round: s.round, winnerId, rummy, points, leftover: Object.fromEntries(s.players.map((p) => [p.id, p.hand])) };
  s.currentTurnId = null;
  s.mustPlayId = null;
  const top = Math.max(...s.players.map((p) => p.score));
  if (targetScore === null || top >= targetScore) {
    s.phase = "game_over";
    // Highest score wins; on a tie, whoever went out this round, else seat order.
    const leaders = s.players.filter((p) => p.score === top);
    s.winnerId = (leaders.find((p) => p.id === winnerId) ?? leaders[0]).id;
  } else {
    s.phase = "round_over";
  }
  return s;
}

/** The hand is empty: this player goes out. */
const wentOut = (s: RummyState, p: RummyPlayer) => (p.hand.length === 0 ? endRound(s, p.id) : s);

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

function myTurn(state: RummyState, playerId: string, step: "draw" | "play"): string | null {
  if (state.phase !== "playing") return "There's no round being played";
  if (state.currentTurnId !== playerId) return "It's not your turn";
  if (state.step !== step) return step === "draw" ? "You've already drawn" : "Draw a card first";
  return null;
}

/** Cards from your hand, by id, or null if any isn't there. */
function fromHand(p: RummyPlayer, ids: string[]): Card[] | null {
  if (new Set(ids).size !== ids.length) return null;
  const cards = ids.map((id) => p.hand.find((c) => c.id === id));
  return cards.every(Boolean) ? (cards as Card[]) : null;
}

function placed(s: RummyState, p: RummyPlayer, cards: Card[]) {
  p.hand = p.hand.filter((c) => !cards.some((x) => x.id === c.id));
  p.meldedThisTurn = true;
  if (s.mustPlayId && cards.some((c) => c.id === s.mustPlayId)) s.mustPlayId = null;
}

/** Which discard-pile cards this player may take right now (indices into the pile). */
export function takeableDiscards(variant: RummyVariant, discard: readonly Card[], hand: readonly Card[], melds: readonly Meld[], aceRule: RummySettings["aceRule"]): number[] {
  const top = discard.length - 1;
  if (top < 0) return [];
  if (variant === "classic") return [top];
  // Rummy 500: dig deeper, as long as the card you dig for can be played this turn.
  const out = [top];
  for (let i = top - 1; i >= 0; i--) if (isPlayable(discard[i], [...hand, ...discard.slice(i)], melds, aceRule)) out.unshift(i);
  return out;
}

function drawStock(state: RummyState, playerId: string): Result {
  const err = myTurn(state, playerId, "draw");
  if (err) return fail(state, err);
  const s = structuredClone(state);
  if (s.stock.length === 0) {
    if (s.discard.length <= 1) return succeed(endRound(s, null)); // Nothing left to draw: nobody goes out.
    const top = s.discard.pop()!;
    const { result, rngState } = shuffle(s.discard, s.rngState);
    s.stock = result;
    s.rngState = rngState;
    s.discard = [top];
  }
  getPlayer(s, playerId)!.hand.push(s.stock.shift()!);
  s.step = "play";
  return succeed(s);
}

function drawDiscard(state: RummyState, playerId: string, index: number): Result {
  const err = myTurn(state, playerId, "draw");
  if (err) return fail(state, err);
  const me = getPlayer(state, playerId)!;
  const { variant, aceRule } = state.settings;
  if (!takeableDiscards(variant, state.discard, me.hand, state.melds, aceRule).includes(index)) {
    return fail(state, variant === "classic" ? "Only the top card can be taken" : "You can only dig for a card you can play this turn");
  }
  const s = structuredClone(state);
  const p = getPlayer(s, playerId)!;
  const taken = s.discard.splice(index);
  p.hand.push(...taken);
  s.lastPickup[p.id] = taken[0];
  // Digging past the top card means the card you dug for has to be played this turn.
  s.mustPlayId = taken.length > 1 ? taken[0].id : null;
  s.step = "play";
  return succeed(s);
}

function meld(state: RummyState, playerId: string, cardIds: string[]): Result {
  const err = myTurn(state, playerId, "play");
  if (err) return fail(state, err);
  const cards = fromHand(getPlayer(state, playerId)!, cardIds);
  if (!cards) return fail(state, "Those cards aren't all in your hand");
  const shape = validateMeld(cards, state.settings.aceRule);
  if (!shape) return fail(state, "That's not a set or a run");
  const s = structuredClone(state);
  const p = getPlayer(s, playerId)!;
  s.melds.push({ id: `m${s.nextMeldId++}`, kind: shape.kind, cards: shape.ordered, placedBy: Object.fromEntries(cards.map((c) => [c.id, p.id])) });
  placed(s, p, cards);
  return succeed(wentOut(s, p));
}

function layOff(state: RummyState, playerId: string, cardIds: string[], meldId: string): Result {
  const err = myTurn(state, playerId, "play");
  if (err) return fail(state, err);
  const cards = fromHand(getPlayer(state, playerId)!, cardIds);
  if (!cards || cards.length === 0) return fail(state, "Those cards aren't all in your hand");
  const target = state.melds.find((m) => m.id === meldId);
  if (!target) return fail(state, "That meld isn't on the table");
  const shape = layOffShape(target, cards, state.settings.aceRule);
  if (!shape) return fail(state, `That doesn't fit this ${target.kind}`);
  const s = structuredClone(state);
  const p = getPlayer(s, playerId)!;
  const m = s.melds.find((x) => x.id === meldId)!;
  m.cards = shape.ordered;
  for (const c of cards) m.placedBy[c.id] = p.id;
  placed(s, p, cards);
  return succeed(wentOut(s, p));
}

function discard(state: RummyState, playerId: string, cardId: string): Result {
  const err = myTurn(state, playerId, "play");
  if (err) return fail(state, err);
  if (state.mustPlayId) {
    const card = getPlayer(state, playerId)!.hand.find((c) => c.id === state.mustPlayId);
    return fail(state, `Play the ${card ? cardName(card) : "card"} you dug for first`);
  }
  const s = structuredClone(state);
  const p = getPlayer(s, playerId)!;
  const card = p.hand.find((c) => c.id === cardId);
  if (!card) return fail(state, "That card isn't in your hand");
  p.hand = p.hand.filter((c) => c.id !== cardId);
  s.discard.push(card);
  if (p.hand.length === 0) return succeed(endRound(s, p.id));
  p.meldedBefore ||= p.meldedThisTurn;
  p.meldedThisTurn = false;
  s.currentTurnId = nextAfter(s, p.id).id;
  s.step = "draw";
  return succeed(s);
}

const cardName = (c: Card) => (c.kind === "joker" ? "Joker" : rankName(c.rank));

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export function applyRummyAction(state: RummyState, action: RummyAction): Result {
  switch (action.type) {
    case "JOIN_ROOM": {
      if (state.phase !== "lobby") return fail(state, "Game already in progress");
      if (state.players.length >= RUMMY_MAX_PLAYERS) return fail(state, `Room is full (max ${RUMMY_MAX_PLAYERS})`);
      if (state.players.some((p) => p.id === action.player.id)) return fail(state, "Player already in room");
      return succeed({ ...state, players: [...state.players, seat(action.player, false)] });
    }
    case "LEAVE_ROOM": {
      if (state.phase !== "lobby") return fail(state, "Players can only leave from the lobby");
      const leaving = getPlayer(state, action.playerId);
      if (!leaving) return fail(state, "Player not in room");
      const players = state.players.filter((p) => p.id !== action.playerId);
      if (players.length === 0) return fail(state, "The last player can't leave");
      const hostId = leaving.isHost ? players[0].id : state.hostId;
      return succeed({ ...state, hostId, players: players.map((p) => ({ ...p, isHost: p.id === hostId })) });
    }
    case "RENAME_PLAYER": {
      if (state.phase !== "lobby") return fail(state, "Names are locked once the game starts");
      if (!getPlayer(state, action.playerId)) return fail(state, "Player not in room");
      const name = action.name.slice(0, 20);
      return succeed({ ...state, players: state.players.map((p) => (p.id === action.playerId ? { ...p, name } : p)) });
    }
    case "UPDATE_SETTINGS": {
      if (state.phase !== "lobby") return fail(state, "Settings are locked once the game starts");
      if (action.playerId !== state.hostId) return fail(state, "Only the host can change settings");
      const patch = { ...action.settings };
      // A new variant brings its usual target unless one was picked too.
      if (patch.variant && patch.variant !== state.settings.variant && !("targetScore" in patch)) patch.targetScore = DEFAULT_TARGET[patch.variant];
      return succeed({ ...state, settings: sanitizeRummySettings({ ...state.settings, ...patch }) });
    }
    case "START_GAME": {
      if (state.phase !== "lobby") return fail(state, "Game already started");
      if (action.playerId !== state.hostId) return fail(state, "Only the host can start the game");
      if (state.players.length < RUMMY_MIN_PLAYERS) return fail(state, `Need at least ${RUMMY_MIN_PLAYERS} players`);
      const [r, rngState] = nextRandom(action.seed >>> 0);
      const s = structuredClone(resetToLobby(state));
      s.rngState = rngState;
      return succeed(deal(s, s.players[Math.floor(r * s.players.length)].id));
    }
    case "DRAW_STOCK":
      return drawStock(state, action.playerId);
    case "DRAW_DISCARD":
      return drawDiscard(state, action.playerId, action.index);
    case "MELD":
      return meld(state, action.playerId, action.cardIds);
    case "LAY_OFF":
      return layOff(state, action.playerId, action.cardIds, action.meldId);
    case "DISCARD":
      return discard(state, action.playerId, action.cardId);
    case "NEXT_ROUND": {
      if (state.phase !== "round_over") return fail(state, "The round isn't over yet");
      if (action.playerId !== state.hostId) return fail(state, "Only the host can deal the next round");
      const s = structuredClone(state);
      return succeed(deal(s, nextAfter(s, s.dealerId!).id));
    }
    case "RETURN_TO_LOBBY": {
      if (action.playerId !== state.hostId) return fail(state, "Only the host can reset the game");
      return succeed(resetToLobby(state));
    }
  }
}

// ---------------------------------------------------------------------------
// Views & legal moves
// ---------------------------------------------------------------------------

export interface RummyPublicPlayer extends Omit<RummyPlayer, "hand"> {
  /** Your own hand; null for everyone else's. */
  hand: Card[] | null;
  handCount: number;
}

export interface RummyView extends Omit<RummyState, "players" | "rngState" | "stock"> {
  viewerId: string | null;
  godMode: boolean;
  players: RummyPublicPlayer[];
  stockCount: number;
}

/** What one player may see: their own hand only. The discard pile and melds are public. */
export function getRummyView(state: RummyState, viewer: string | "god"): RummyView {
  const godMode = viewer === "god";
  const { rngState: _r, stock, players, ...rest } = state;
  void _r;
  const roundOver = state.phase === "round_over" || state.phase === "game_over";
  return {
    ...rest,
    viewerId: godMode ? null : viewer,
    godMode,
    stockCount: stock.length,
    players: players.map((p) => ({ ...p, hand: godMode || p.id === viewer || roundOver ? p.hand : null, handCount: p.hand.length })),
  };
}

export interface RummyLegal {
  isMyTurn: boolean;
  mustDraw: boolean;
  /** Discard-pile cards you may take (indices). */
  takeable: number[];
  /** You've drawn: meld, lay off, then discard. */
  canPlay: boolean;
  /** A card you dug for that has to be played before you discard. */
  mustPlayId: string | null;
}

export function getRummyLegal(view: RummyView, playerId: string | null): RummyLegal {
  const none: RummyLegal = { isMyTurn: false, mustDraw: false, takeable: [], canPlay: false, mustPlayId: null };
  const me = view.players.find((p) => p.id === playerId);
  if (!me?.hand || view.phase !== "playing" || view.currentTurnId !== me.id) return none;
  if (view.step === "draw") {
    const { variant, aceRule } = view.settings;
    return { ...none, isMyTurn: true, mustDraw: true, takeable: takeableDiscards(variant, view.discard, me.hand, view.melds, aceRule) };
  }
  return { ...none, isMyTurn: true, canPlay: true, mustPlayId: view.mustPlayId };
}

export { cardPoints };

/** Rummy as a game the online room can host. */
export const rummyGame: GameDefinition<RummyState, RummyAction, RummyView> = {
  applyAction: applyRummyAction,
  getPlayerView: getRummyView,
  join: (player) => ({ type: "JOIN_ROOM", player }),
  leave: (playerId) => ({ type: "LEAVE_ROOM", playerId }),
  maxPlayers: RUMMY_MAX_PLAYERS,
};
