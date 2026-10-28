/**
 * Go Fish as pure state transitions, run by the host (online) or the local simulator. Each action
 * works on a copy of the state and returns the new one.
 *
 * On your turn, ask someone for a rank you hold. They hand over every card of it and you go
 * again, or they say "Go fish!" and you draw from the pond. Four of a kind (two, in the pairs
 * variant) makes a book. When every card is booked, most books wins.
 */
import type { Card, Rank } from "@/types/cards";
import type { ActionResult, PlayerSeed } from "@/types/game";
import type { GoFishAction, GoFishEvent, GoFishPlayer, GoFishSettings, GoFishState } from "@/types/gofish";
import { createDeck, nextRandom, shuffle } from "./cards";
import type { GameDefinition } from "./multiplayer/room";

export const GOFISH_MIN_PLAYERS = 2;
export const GOFISH_MAX_PLAYERS = 6;

export const GOFISH_DEFAULTS: GoFishSettings = { luckyCatch: true, bookSize: 4, refill: 1, memoryHelper: true };

/** Seven cards each for two or three players, five for more. */
export const handSizeFor = (players: number) => (players <= 3 ? 7 : 5);

type Result = ActionResult<GoFishState>;
const fail = (state: GoFishState, error: string): Result => ({ ok: false, error, state });
const succeed = (state: GoFishState): Result => ({ ok: true, state: { ...state, version: state.version + 1 } });

/** Go Fish ranks: no Jokers, so every card has one. */
export const rankOf = (c: Card): Rank => (c.kind === "standard" ? c.rank : 2);

export function sanitizeGoFishSettings(s: Partial<GoFishSettings>): GoFishSettings {
  return {
    luckyCatch: s.luckyCatch ?? GOFISH_DEFAULTS.luckyCatch,
    bookSize: s.bookSize === 2 ? 2 : 4,
    refill: s.refill === 5 ? 5 : 1,
    memoryHelper: s.memoryHelper ?? GOFISH_DEFAULTS.memoryHelper,
  };
}

const seat = (seed: PlayerSeed, isHost: boolean): GoFishPlayer => ({
  id: seed.id,
  name: seed.name.trim() || "Player",
  isBot: !!seed.isBot,
  ...(seed.botDifficulty ? { botDifficulty: seed.botDifficulty } : {}),
  isHost,
  hand: [],
  books: [],
});

export function createGoFishRoom(params: { roomId: string; host: PlayerSeed; settings?: Partial<GoFishSettings> }): GoFishState {
  return {
    mode: "go-fish",
    roomId: params.roomId,
    version: 0,
    phase: "lobby",
    settings: sanitizeGoFishSettings({ ...GOFISH_DEFAULTS, ...params.settings }),
    players: [seat(params.host, true)],
    hostId: params.host.id,
    rngState: 0,
    pond: [],
    currentTurnId: null,
    log: [],
    winnerIds: [],
    winnerId: null,
  };
}

function resetToLobby(s: GoFishState): GoFishState {
  const fresh = createGoFishRoom({ roomId: s.roomId, host: { id: s.hostId, name: "" }, settings: s.settings });
  return { ...fresh, version: s.version, players: s.players.map((p) => ({ ...seat(p, p.id === s.hostId), name: p.name })) };
}

const getPlayer = (s: GoFishState, id: string | null | undefined) => s.players.find((p) => p.id === id);
const countOf = (hand: Card[], rank: Rank) => hand.filter((c) => rankOf(c) === rank).length;

// ---------------------------------------------------------------------------
// Books, refills, turns
// ---------------------------------------------------------------------------

/** An event before it's numbered (Omit on each kind of event, not on the union). */
type NewEvent = GoFishEvent extends infer E ? (E extends GoFishEvent ? Omit<E, "n"> : never) : never;

function log(s: GoFishState, e: NewEvent) {
  s.log.push({ ...e, n: s.log.length + 1 } as GoFishEvent);
}

/** Lay down every complete book in this hand. */
function makeBooks(s: GoFishState, p: GoFishPlayer) {
  const size = s.settings.bookSize;
  for (const rank of [...new Set(p.hand.map(rankOf))]) {
    while (countOf(p.hand, rank) >= size) {
      let left = size;
      p.hand = p.hand.filter((c) => !(rankOf(c) === rank && left-- > 0));
      p.books.push(rank);
      log(s, { kind: "book", playerId: p.id, rank });
    }
  }
}

/** An empty hand draws from the pond (and may book what it draws). */
function refill(s: GoFishState, p: GoFishPlayer) {
  if (p.hand.length > 0 || s.pond.length === 0) return;
  const drawn = s.pond.splice(0, s.settings.refill);
  p.hand.push(...drawn);
  log(s, { kind: "refill", playerId: p.id, count: drawn.length });
  makeBooks(s, p);
  refill(s, p);
}

const everythingBooked = (s: GoFishState) => s.pond.length === 0 && s.players.every((p) => p.hand.length === 0);

function finish(s: GoFishState): GoFishState {
  const most = Math.max(...s.players.map((p) => p.books.length));
  s.winnerIds = s.players.filter((p) => p.books.length === most).map((p) => p.id);
  s.winnerId = s.winnerIds.length === 1 ? s.winnerIds[0] : null;
  s.phase = "game_over";
  s.currentTurnId = null;
  return s;
}

/** Can this player take a turn: cards to ask with, and someone to ask. */
const canAsk = (s: GoFishState, p: GoFishPlayer) => p.hand.length > 0 && s.players.some((o) => o.id !== p.id && o.hand.length > 0);

/** Play passes to the next player (from `fromId`, or that player again if `stay`) who can ask. */
function nextTurn(s: GoFishState, fromId: string, stay: boolean): GoFishState {
  if (everythingBooked(s)) return finish(s);
  const n = s.players.length;
  const start = s.players.findIndex((p) => p.id === fromId);
  for (let step = stay ? 0 : 1; step <= n; step++) {
    const p = s.players[(start + step) % n];
    refill(s, p);
    if (canAsk(s, p)) {
      s.currentTurnId = p.id;
      return s;
    }
  }
  // Nobody can ask: whatever's left is already in books.
  return finish(s);
}

function ask(state: GoFishState, playerId: string, targetId: string, rank: Rank): Result {
  if (state.phase !== "playing") return fail(state, "There's no game being played");
  if (state.currentTurnId !== playerId) return fail(state, "It's not your turn");
  if (targetId === playerId) return fail(state, "Ask someone else");
  const me = getPlayer(state, playerId)!;
  const them = getPlayer(state, targetId);
  if (!them) return fail(state, "That player isn't at the table");
  if (them.hand.length === 0) return fail(state, `${them.name} has no cards`);
  if (countOf(me.hand, rank) === 0) return fail(state, "You can only ask for a rank you hold");

  const s = structuredClone(state);
  const asker = getPlayer(s, playerId)!;
  const target = getPlayer(s, targetId)!;
  const handed = target.hand.filter((c) => rankOf(c) === rank);

  if (handed.length > 0) {
    target.hand = target.hand.filter((c) => rankOf(c) !== rank);
    asker.hand.push(...handed);
    log(s, { kind: "ask", askerId: asker.id, targetId: target.id, rank, got: handed.length, fished: false, lucky: false, shown: null, again: true });
    makeBooks(s, asker);
    refill(s, target);
    refill(s, asker);
    return succeed(nextTurn(s, asker.id, true));
  }

  // Go fish!
  const drawn = s.pond.shift();
  const lucky = !!drawn && s.settings.luckyCatch && rankOf(drawn) === rank;
  if (drawn) asker.hand.push(drawn);
  log(s, { kind: "ask", askerId: asker.id, targetId: target.id, rank, got: 0, fished: !!drawn, lucky, shown: lucky ? drawn! : null, again: lucky });
  makeBooks(s, asker);
  refill(s, asker);
  return succeed(nextTurn(s, asker.id, lucky));
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export function applyGoFishAction(state: GoFishState, action: GoFishAction): Result {
  switch (action.type) {
    case "JOIN_ROOM": {
      if (state.phase !== "lobby") return fail(state, "Game already in progress");
      if (state.players.length >= GOFISH_MAX_PLAYERS) return fail(state, `Room is full (max ${GOFISH_MAX_PLAYERS})`);
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
      return succeed({ ...state, settings: sanitizeGoFishSettings({ ...state.settings, ...action.settings }) });
    }
    case "START_GAME": {
      if (state.phase !== "lobby") return fail(state, "Game already started");
      if (action.playerId !== state.hostId) return fail(state, "Only the host can start the game");
      if (state.players.length < GOFISH_MIN_PLAYERS) return fail(state, `Need at least ${GOFISH_MIN_PLAYERS} players`);
      const s = structuredClone(resetToLobby(state));
      const [r, rng] = nextRandom(action.seed >>> 0);
      const { result, rngState } = shuffle(createDeck(false), rng);
      s.rngState = rngState;
      s.pond = result;
      const size = handSizeFor(s.players.length);
      for (const p of s.players) p.hand = s.pond.splice(0, size);
      for (const p of s.players) makeBooks(s, p);
      s.phase = "playing";
      return succeed(nextTurn(s, s.players[Math.floor(r * s.players.length)].id, true));
    }
    case "ASK":
      return ask(state, action.playerId, action.targetId, action.rank);
    case "RETURN_TO_LOBBY": {
      if (action.playerId !== state.hostId) return fail(state, "Only the host can reset the game");
      return succeed(resetToLobby(state));
    }
  }
}

// ---------------------------------------------------------------------------
// Memory: what everyone has shown they hold
// ---------------------------------------------------------------------------

/**
 * Ranks each player is known to hold, from the public record: asking for a rank shows you have
 * it, and so does taking cards of it. Handing it over, saying "Go fish" to it, or booking it means
 * you don't any more. `lastAsks` limits it to the most recent asks (short memory).
 */
export function knownRanks(events: readonly GoFishEvent[], lastAsks = Infinity): Record<string, Set<Rank>> {
  let asks = 0;
  const from = (() => {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].kind === "ask" && ++asks > lastAsks) return i + 1;
    return 0;
  })();
  const known: Record<string, Set<Rank>> = {};
  const holds = (id: string) => (known[id] ??= new Set());
  for (const e of events.slice(from)) {
    if (e.kind === "ask") {
      holds(e.targetId).delete(e.rank);
      holds(e.askerId).add(e.rank);
    } else if (e.kind === "book") {
      holds(e.playerId).delete(e.rank);
    }
  }
  return known;
}

// ---------------------------------------------------------------------------
// Views & legal moves
// ---------------------------------------------------------------------------

export interface GoFishPublicPlayer extends Omit<GoFishPlayer, "hand"> {
  /** Your own hand; null for everyone else's. */
  hand: Card[] | null;
  handCount: number;
}

export interface GoFishView extends Omit<GoFishState, "players" | "rngState" | "pond"> {
  viewerId: string | null;
  godMode: boolean;
  players: GoFishPublicPlayer[];
  pondCount: number;
}

export function getGoFishView(state: GoFishState, viewer: string | "god"): GoFishView {
  const godMode = viewer === "god";
  const { rngState: _r, pond, players, ...rest } = state;
  void _r;
  return {
    ...rest,
    viewerId: godMode ? null : viewer,
    godMode,
    pondCount: pond.length,
    players: players.map((p) => ({ ...p, hand: godMode || p.id === viewer ? p.hand : null, handCount: p.hand.length })),
  };
}

export interface GoFishLegal {
  isMyTurn: boolean;
  /** Players you may ask (they have cards). */
  targets: string[];
  /** Ranks you may ask for (you hold them). */
  ranks: Rank[];
}

export function getGoFishLegal(view: GoFishView, playerId: string | null): GoFishLegal {
  const me = view.players.find((p) => p.id === playerId);
  if (!me?.hand || view.phase !== "playing" || view.currentTurnId !== me.id) return { isMyTurn: false, targets: [], ranks: [] };
  return {
    isMyTurn: true,
    targets: view.players.filter((p) => p.id !== me.id && p.handCount > 0).map((p) => p.id),
    ranks: [...new Set(me.hand.map(rankOf))],
  };
}

/** Go Fish as a game the online room can host. */
export const goFishGame: GameDefinition<GoFishState, GoFishAction, GoFishView> = {
  applyAction: applyGoFishAction,
  getPlayerView: getGoFishView,
  join: (player) => ({ type: "JOIN_ROOM", player }),
  leave: (playerId) => ({ type: "LEAVE_ROOM", playerId }),
  maxPlayers: GOFISH_MAX_PLAYERS,
};
