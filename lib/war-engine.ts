/**
 * War, two duelists, as pure state transitions run by the host (online) or the local simulator.
 * Each action works on a copy of the state and returns the new one.
 *
 * Both players flip; the higher card takes both. A tie is a War: each side puts down face-down
 * bounty cards and one more face up, and the higher one takes the lot. Won cards are shuffled
 * back in when your draw pile runs out, so a game can't loop forever.
 */
import type { Card } from "@/types/cards";
import type { ActionResult, PlayerSeed } from "@/types/game";
import type { Laid, WarAction, WarClash, WarPlayer, WarSettings, WarSide, WarState } from "@/types/war";
import { createDeck, nextRandom, shuffle } from "./cards";
import type { GameDefinition } from "./multiplayer/room";

export const WAR_MIN_PLAYERS = 2;
/** Two play; anyone else at the table watches. */
export const WAR_MAX_PLAYERS = 6;
export const HAND_SIZE = 3;
export const QUICK_MATCH_CARDS = 40;
export const BLITZ_BATTLES = 50;

export const WAR_DEFAULTS: WarSettings = { mode: "classic", bounty: 3, winCondition: "domination", jokers: false, duelistIds: null, winnerStaysOn: false };

type Result = ActionResult<WarState>;
const fail = (state: WarState, error: string): Result => ({ ok: false, error, state });
const succeed = (state: WarState): Result => ({ ok: true, state: { ...state, version: state.version + 1 } });

/** Ace high; Jokers (when in) beat everything. Suits don't count. */
export const warRank = (c: Card) => (c.kind === "joker" ? 15 : c.rank);

export function sanitizeWarSettings(s: Partial<WarSettings>): WarSettings {
  const bounty = s.bounty === 1 || s.bounty === 2 ? s.bounty : 3;
  const winCondition = s.winCondition === "forty" || s.winCondition === "blitz" ? s.winCondition : "domination";
  const pair = Array.isArray(s.duelistIds) && s.duelistIds.length === 2 && s.duelistIds[0] !== s.duelistIds[1] ? (s.duelistIds as [string, string]) : null;
  return { mode: s.mode === "tactical" ? "tactical" : "classic", bounty, winCondition, jokers: !!s.jokers, duelistIds: pair, winnerStaysOn: !!s.winnerStaysOn };
}

const seat = (seed: PlayerSeed, isHost: boolean): WarPlayer => ({
  id: seed.id,
  name: seed.name.trim() || "Player",
  isBot: !!seed.isBot,
  ...(seed.botDifficulty ? { botDifficulty: seed.botDifficulty } : {}),
  isHost,
});

export function createWarRoom(params: { roomId: string; host: PlayerSeed; settings?: Partial<WarSettings> }): WarState {
  return {
    mode: "war",
    roomId: params.roomId,
    version: 0,
    phase: "lobby",
    settings: sanitizeWarSettings({ ...WAR_DEFAULTS, ...params.settings }),
    players: [seat(params.host, true)],
    hostId: params.host.id,
    rngState: 0,
    sides: null,
    stage: "battle",
    table: {},
    wars: 0,
    battles: 0,
    last: null,
    winnerId: null,
  };
}

function resetToLobby(s: WarState): WarState {
  const fresh = createWarRoom({ roomId: s.roomId, host: { id: s.hostId, name: "" }, settings: s.settings });
  return { ...fresh, version: s.version, players: s.players.map((p) => ({ ...seat(p, p.id === s.hostId), name: p.name })) };
}

/** Winner stays on: they face whoever sits next after the player they beat, round the table. */
export function nextDuel(s: Pick<WarState, "players" | "sides" | "winnerId">): [string, string] | null {
  const winner = s.winnerId;
  const loser = s.sides?.find((x) => x.id !== winner)?.id;
  if (!winner || !loser) return null;
  const line = s.players.map((p) => p.id).filter((id) => id !== winner);
  if (line.length === 0) return null;
  return [winner, line[(line.indexOf(loser) + 1) % line.length]];
}

/** Who duels: the host's pick if both are still seated, otherwise the first two seats. */
export function duelistsOf(s: Pick<WarState, "players" | "settings">): [string, string] {
  const pick = s.settings.duelistIds;
  if (pick && pick.every((id) => s.players.some((p) => p.id === id))) return pick;
  return [s.players[0]?.id, s.players[1]?.id] as [string, string];
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** Cards a duelist has, wherever they are (not counting the table). */
export const cardCount = (side: Pick<WarSide, "draw" | "won" | "hand">) => side.draw.length + side.won.length + side.hand.length;

/** An empty draw pile takes the won pile, shuffled. */
function refill(s: WarState, side: WarSide) {
  if (side.draw.length > 0 || side.won.length === 0) return;
  const { result, rngState } = shuffle(side.won, s.rngState);
  s.rngState = rngState;
  side.draw = result;
  side.won = [];
}

function takeTop(s: WarState, side: WarSide): Card | null {
  refill(s, side);
  return side.draw.shift() ?? null;
}

function fillHand(s: WarState, side: WarSide) {
  while (side.hand.length < HAND_SIZE) {
    const c = takeTop(s, side);
    if (!c) break;
    side.hand.push(c);
  }
}

// ---------------------------------------------------------------------------
// Battles
// ---------------------------------------------------------------------------

const sideOf = (s: WarState, id: string) => s.sides?.find((x) => x.id === id);
const other = (s: WarState, id: string) => s.sides!.find((x) => x.id !== id)!;

function endGame(s: WarState, winnerId: string): WarState {
  s.phase = "game_over";
  s.winnerId = winnerId;
  return s;
}

/** Lay one side's cards for this flip. False if they had nothing to put face up. */
function lay(s: WarState, side: WarSide): boolean {
  const laid = (s.table[side.id] ??= []);
  const tactical = s.settings.mode === "tactical";
  const played = tactical ? side.hand.find((c) => c.id === side.playedId) ?? null : null;
  if (tactical) side.hand = side.hand.filter((c) => c.id !== side.playedId);

  if (s.stage === "war") {
    // Bounty face down, keeping back one card to decide it (short stacks put down what they can).
    const spare = side.draw.length + side.won.length + (tactical ? side.hand.length : 0);
    const bounty = Math.min(s.settings.bounty, tactical ? spare : spare - 1);
    for (let i = 0; i < bounty; i++) {
      const c = takeTop(s, side) ?? side.hand.shift()!;
      laid.push({ card: c, faceUp: false });
    }
  }
  const up = tactical ? played : takeTop(s, side);
  if (!up) return false;
  laid.push({ card: up, faceUp: true });
  return true;
}

function settle(s: WarState): WarState {
  const [a, b] = s.sides!;
  for (const side of [a, b]) {
    if (!lay(s, side)) return endGame(s, other(s, side.id).id);
  }
  for (const side of [a, b]) {
    side.ready = false;
    side.playedId = null;
  }
  const up = (side: WarSide) => warRank(s.table[side.id].at(-1)!.card);

  if (up(a) === up(b)) {
    s.stage = "war";
    s.wars += 1;
    if (s.settings.mode === "tactical") for (const side of [a, b]) fillHand(s, side);
    // Nothing left to fight the War with: that side loses.
    for (const side of [a, b]) if (cardCount(side) === 0) return endGame(s, other(s, side.id).id);
    return s;
  }

  const winner = up(a) > up(b) ? a : b;
  const pot = [...s.table[a.id], ...s.table[b.id]].map((l) => l.card);
  winner.won.push(...pot);
  s.battles += 1;
  const laid: WarClash["laid"] = Object.fromEntries(Object.entries(s.table).map(([id, list]) => [id, list.map((l) => ({ card: l.card, faceUp: true, bounty: !l.faceUp }))]));
  s.last = { number: s.battles, laid, wars: s.wars, winnerId: winner.id, cards: pot.length };
  s.table = {};
  s.wars = 0;
  s.stage = "battle";
  if (s.settings.mode === "tactical") for (const side of [a, b]) fillHand(s, side);

  const loser = other(s, winner.id);
  const { winCondition } = s.settings;
  if (cardCount(loser) === 0) return endGame(s, winner.id);
  if (winCondition === "forty" && cardCount(winner) >= QUICK_MATCH_CARDS) return endGame(s, winner.id);
  if (winCondition === "blitz" && s.battles >= BLITZ_BATTLES) {
    const diff = cardCount(a) - cardCount(b);
    return endGame(s, diff > 0 ? a.id : diff < 0 ? b.id : winner.id);
  }
  return s;
}

function commit(state: WarState, playerId: string, cardId?: string): Result {
  if (state.phase !== "playing") return fail(state, "There's no game being played");
  const me = sideOf(state, playerId);
  if (!me) return fail(state, "You're watching this one");
  if (me.ready) return fail(state, "Waiting for the other player");
  const tactical = state.settings.mode === "tactical";
  if (tactical && !cardId) return fail(state, "Pick a card to play");
  if (!tactical && cardId) return fail(state, "In Classic War you just flip");
  if (tactical && !me.hand.some((c) => c.id === cardId)) return fail(state, "That card isn't in your hand");
  const s = structuredClone(state);
  const side = sideOf(s, playerId)!;
  side.ready = true;
  side.playedId = cardId ?? null;
  return succeed(s.sides!.every((x) => x.ready) ? settle(s) : s);
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export function applyWarAction(state: WarState, action: WarAction): Result {
  switch (action.type) {
    case "JOIN_ROOM": {
      if (state.phase !== "lobby") return fail(state, "Game already in progress");
      if (state.players.length >= WAR_MAX_PLAYERS) return fail(state, `Room is full (max ${WAR_MAX_PLAYERS})`);
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
      return succeed({ ...state, settings: sanitizeWarSettings({ ...state.settings, ...action.settings }) });
    }
    case "START_GAME": {
      if (state.phase !== "lobby") return fail(state, "Game already started");
      if (action.playerId !== state.hostId) return fail(state, "Only the host can start the game");
      if (state.players.length < WAR_MIN_PLAYERS) return fail(state, "War needs two players");
      const s = structuredClone(resetToLobby(state));
      const [, rng] = nextRandom(action.seed >>> 0);
      const { result, rngState } = shuffle(createDeck(s.settings.jokers), rng);
      s.rngState = rngState;
      const half = result.length / 2;
      const ids = duelistsOf(s);
      const side = (id: string, cards: Card[]): WarSide => ({ id, draw: cards, won: [], hand: [], ready: false, playedId: null });
      s.sides = [side(ids[0], result.slice(0, half)), side(ids[1], result.slice(half))];
      if (s.settings.mode === "tactical") for (const x of s.sides) fillHand(s, x);
      s.phase = "playing";
      return succeed(s);
    }
    case "FLIP":
      return commit(state, action.playerId);
    case "PLAY":
      return commit(state, action.playerId, action.cardId);
    case "RETURN_TO_LOBBY": {
      if (action.playerId !== state.hostId) return fail(state, "Only the host can reset the game");
      const next = resetToLobby(state);
      const duel = state.phase === "game_over" && state.settings.winnerStaysOn ? nextDuel(state) : null;
      return succeed(duel ? { ...next, settings: { ...next.settings, duelistIds: duel } } : next);
    }
  }
}

// ---------------------------------------------------------------------------
// Views & legal moves
// ---------------------------------------------------------------------------

export interface WarPublicSide {
  id: string;
  /** Total cards they hold (draw, won and hand). */
  count: number;
  drawCount: number;
  wonCount: number;
  /** Your own hand (Tactical); null for the other side's. */
  hand: Card[] | null;
  handCount: number;
  ready: boolean;
}

export interface WarView extends Omit<WarState, "rngState" | "sides" | "table"> {
  viewerId: string | null;
  godMode: boolean;
  sides: [WarPublicSide, WarPublicSide] | null;
  /** Face-down cards on the table are null. */
  table: Record<string, (Card | null)[]>;
}

/** What one player (or spectator) sees: no deck order, no other hand, no face-down bounties. */
export function getWarView(state: WarState, viewer: string | "god"): WarView {
  const godMode = viewer === "god";
  const { rngState: _r, sides, table, ...rest } = state;
  void _r;
  const pub = (x: WarSide): WarPublicSide => ({
    id: x.id,
    count: cardCount(x),
    drawCount: x.draw.length,
    wonCount: x.won.length,
    hand: godMode || x.id === viewer ? x.hand : null,
    handCount: x.hand.length,
    ready: x.ready,
  });
  return {
    ...rest,
    viewerId: godMode ? null : viewer,
    godMode,
    sides: sides ? [pub(sides[0]), pub(sides[1])] : null,
    table: Object.fromEntries(Object.entries(table).map(([id, list]) => [id, list.map((l: Laid) => (l.faceUp ? l.card : null))])),
  };
}

export interface WarLegal {
  /** You're a duelist and haven't committed to this flip yet. */
  canAct: boolean;
  /** Classic: flip. Tactical: pick from `hand`. */
  hand: Card[];
}

export function getWarLegal(view: WarView, playerId: string | null): WarLegal {
  const side = view.sides?.find((x) => x.id === playerId);
  if (!side || view.phase !== "playing" || side.ready) return { canAct: false, hand: [] };
  return { canAct: true, hand: side.hand ?? [] };
}

/** War as a game the online room can host. */
export const warGame: GameDefinition<WarState, WarAction, WarView> = {
  applyAction: applyWarAction,
  getPlayerView: getWarView,
  join: (player) => ({ type: "JOIN_ROOM", player }),
  leave: (playerId) => ({ type: "LEAVE_ROOM", playerId }),
  maxPlayers: WAR_MAX_PLAYERS,
};
