/**
 * BS Poker game loop as pure state transitions.
 *
 * Every function takes a BsPokerState and returns a new one (never mutates), so the
 * same code can run in the browser (local dev simulator) or authoritatively on a
 * server that broadcasts state over Supabase Realtime / PartyKit.
 */
import type { Card } from "@/types/cards";
import type { ActionResult, PlayerSeed } from "@/types/game";
import type {
  Bid,
  BidEntry,
  BsPokerAction,
  BsPokerPlayer,
  BsPokerSettings,
  BsPokerState,
  ShowdownResult,
} from "@/types/bs-poker";
import { createDeck, deckSize, nextRandom, shuffle } from "./cards";
import {
  DEFAULT_SETTINGS,
  HAND_TYPE_PLURAL,
  RESTRICTABLE_HANDS,
  evaluateBid,
  getDisabledHandTypes,
  getLegalBids,
  isBidHigher,
  validateBidShape,
} from "./bs-poker-engine";

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
/** Dealt face up every round, so the pool always holds at least one full 5-card hand. */
export const TABLE_CARD_COUNT = 5;
/**
 * The table is laid out Hold'em style: burn, three cards, burn, one card, burn, one card.
 * `TABLE_RUNS[i]` is how many table cards follow the i-th burn.
 */
export const TABLE_RUNS = [3, 1, 1] as const;
export const BURN_COUNT = TABLE_RUNS.length;

/** Largest hand size the deck can support for this many players, after the table cards. */
export function maxCardsCap(includeJokers: boolean, playerCount: number): number {
  const perPlayer = Math.floor(
    (deckSize(includeJokers) - TABLE_CARD_COUNT - BURN_COUNT) / Math.max(playerCount, MIN_PLAYERS),
  );
  return Math.max(1, Math.min(10, perPlayer));
}

type Result = ActionResult<BsPokerState>;

const fail = (state: BsPokerState, error: string): Result => ({ ok: false, error, state });
const succeed = (state: BsPokerState): Result => ({ ok: true, state: { ...state, version: state.version + 1 } });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const activePlayers = (state: BsPokerState) => state.players.filter((p) => p.status === "active");

export const getPlayer = (state: BsPokerState, id: string | null | undefined) =>
  state.players.find((p) => p.id === id);

/** Next active player clockwise (seat order) after `fromId`. */
export function nextActivePlayerId(state: BsPokerState, fromId: string): string | null {
  const n = state.players.length;
  const start = state.players.findIndex((p) => p.id === fromId);
  if (start === -1) return activePlayers(state)[0]?.id ?? null;
  for (let step = 1; step <= n; step++) {
    const p = state.players[(start + step) % n];
    if (p.status === "active") return p.id;
  }
  return null;
}

/** Clamp settings into a consistent, playable range. */
export function sanitizeSettings(s: BsPokerSettings, playerCount: number): BsPokerSettings {
  const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(v) || lo)));
  // Make sure everyone can be dealt a full hand.
  const maxCards = clampInt(s.maxCards, 1, maxCardsCap(!!s.includeJokers, playerCount));
  return {
    deucesWild: !!s.deucesWild,
    includeJokers: !!s.includeJokers,
    handRules: Object.fromEntries(
      RESTRICTABLE_HANDS.map((type) => {
        const rule = s.handRules?.[type] ?? DEFAULT_SETTINGS.handRules[type];
        const mode = (["enabled", "disabled", "threshold"] as const).includes(rule.mode) ? rule.mode : "enabled";
        return [type, { mode, threshold: clampInt(rule.threshold, 1, maxCards) }];
      }),
    ) as BsPokerSettings["handRules"],
    startingCards: clampInt(s.startingCards, 1, maxCards),
    maxCards,
  };
}

function seatPlayer(seed: PlayerSeed, isHost: boolean, settings: BsPokerSettings): BsPokerPlayer {
  return {
    id: seed.id,
    name: seed.name.trim() || "Player",
    isBot: !!seed.isBot,
    ...(seed.botDifficulty ? { botDifficulty: seed.botDifficulty } : {}),
    isHost,
    cardCount: settings.startingCards,
    hand: [],
    status: "active",
  };
}

/** Shuffle, lay out the table cards, and deal `cardCount` cards to every active player. */
function dealRound(state: BsPokerState, starterId: string): BsPokerState {
  const { result: deck, rngState } = shuffle(createDeck(state.settings.includeJokers), state.rngState);
  // Which deck positions go where is invisible to players (the deck is shuffled), so take
  // burns and table cards off the top and deal hands from the rest.
  const burnCards = deck.slice(0, BURN_COUNT);
  const tableCards = deck.slice(BURN_COUNT, BURN_COUNT + TABLE_CARD_COUNT);
  let cursor = BURN_COUNT + TABLE_CARD_COUNT;
  const players = state.players.map((p) => {
    if (p.status !== "active") return { ...p, hand: [] };
    const hand = deck.slice(cursor, cursor + p.cardCount);
    cursor += p.cardCount;
    return { ...p, hand };
  });
  const disabledHandTypes = getDisabledHandTypes(
    state.settings,
    players.filter((p) => p.status === "active").map((p) => p.cardCount),
  );
  return {
    ...state,
    rngState,
    players,
    phase: "bidding",
    roundStarterId: starterId,
    currentTurnPlayerId: starterId,
    tableCards,
    burnCards,
    currentBid: null,
    bidHistory: [],
    disabledHandTypes,
    showdown: null,
  };
}

// ---------------------------------------------------------------------------
// Public transitions
// ---------------------------------------------------------------------------

export function createRoom(params: {
  roomId: string;
  host: PlayerSeed;
  settings?: Partial<BsPokerSettings>;
}): BsPokerState {
  const settings = sanitizeSettings({ ...DEFAULT_SETTINGS, ...params.settings }, 1);
  return {
    mode: "bs-poker",
    roomId: params.roomId,
    version: 0,
    phase: "lobby",
    settings,
    players: [seatPlayer(params.host, true, settings)],
    hostId: params.host.id,
    round: 0,
    rngState: 0,
    roundStarterId: null,
    currentTurnPlayerId: null,
    currentBid: null,
    bidHistory: [],
    disabledHandTypes: [],
    tableCards: [],
    burnCards: [],
    showdown: null,
    winnerId: null,
  };
}

export function joinRoom(state: BsPokerState, seed: PlayerSeed): Result {
  if (state.phase !== "lobby") return fail(state, "Game already in progress");
  if (state.players.length >= MAX_PLAYERS) return fail(state, `Room is full (max ${MAX_PLAYERS})`);
  if (state.players.some((p) => p.id === seed.id)) return fail(state, "Player already in room");
  const settings = sanitizeSettings(state.settings, state.players.length + 1);
  return succeed({ ...state, settings, players: [...state.players, seatPlayer(seed, false, settings)] });
}

export function leaveRoom(state: BsPokerState, playerId: string): Result {
  if (state.phase !== "lobby") return fail(state, "Players can only leave from the lobby");
  const leaving = getPlayer(state, playerId);
  if (!leaving) return fail(state, "Player not in room");
  const players = state.players.filter((p) => p.id !== playerId);
  if (players.length === 0) return fail(state, "The last player can't leave");
  // Hand host to the next seat if the host leaves.
  const hostId = leaving.isHost ? players[0].id : state.hostId;
  return succeed({ ...state, hostId, players: players.map((p) => ({ ...p, isHost: p.id === hostId })) });
}

export function renamePlayer(state: BsPokerState, playerId: string, name: string): Result {
  if (state.phase !== "lobby") return fail(state, "Names are locked once the game starts");
  if (!getPlayer(state, playerId)) return fail(state, "Player not in room");
  const clean = name.slice(0, 20);
  return succeed({ ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, name: clean } : p)) });
}

export function updateSettings(state: BsPokerState, playerId: string, patch: Partial<BsPokerSettings>): Result {
  if (state.phase !== "lobby") return fail(state, "Settings are locked once the game starts");
  if (playerId !== state.hostId) return fail(state, "Only the host can change settings");
  const settings = sanitizeSettings({ ...state.settings, ...patch }, state.players.length);
  return succeed({ ...state, settings, players: state.players.map((p) => ({ ...p, cardCount: settings.startingCards })) });
}

/** `seed` must come from a real RNG (crypto) on whoever is authoritative — the server in online play. */
export function startGame(state: BsPokerState, playerId: string, seed: number): Result {
  if (state.phase !== "lobby") return fail(state, "Game already started");
  if (playerId !== state.hostId) return fail(state, "Only the host can start the game");
  if (state.players.length < MIN_PLAYERS) return fail(state, `Need at least ${MIN_PLAYERS} players`);
  const settings = sanitizeSettings(state.settings, state.players.length);
  if (state.players.length * settings.maxCards + TABLE_CARD_COUNT + BURN_COUNT > deckSize(settings.includeJokers)) {
    return fail(state, "Not enough cards in the deck for this many players at max hand size");
  }
  const players = state.players.map((p) => ({
    ...p,
    name: p.name.trim() || "Player",
    cardCount: settings.startingCards,
    hand: [],
    status: "active" as const,
    eliminatedInRound: undefined,
  }));
  // Random first bidder.
  const [r, rngState] = nextRandom(seed >>> 0);
  const starter = players[Math.floor(r * players.length)];
  return succeed(dealRound({ ...state, settings, players, rngState, round: 1, winnerId: null }, starter.id));
}

export function placeBid(state: BsPokerState, playerId: string, bid: Bid): Result {
  if (state.phase !== "bidding") return fail(state, "Not in a bidding round");
  if (state.currentTurnPlayerId !== playerId) return fail(state, "It's not your turn");
  const shapeError = validateBidShape(bid);
  if (shapeError) return fail(state, shapeError);
  if (state.disabledHandTypes.includes(bid.type)) return fail(state, `${HAND_TYPE_PLURAL[bid.type]} are banned this round`);
  if (!isBidHigher(bid, state.currentBid?.bid ?? null)) return fail(state, "Bid must be higher than the current bid");
  const entry: BidEntry = { playerId, bid };
  return succeed({
    ...state,
    currentBid: entry,
    bidHistory: [...state.bidHistory, entry],
    currentTurnPlayerId: nextActivePlayerId(state, playerId),
  });
}

export function callBS(state: BsPokerState, playerId: string): Result {
  if (state.phase !== "bidding") return fail(state, "Not in a bidding round");
  if (state.currentTurnPlayerId !== playerId) return fail(state, "It's not your turn");
  if (!state.currentBid) return fail(state, "There's no bid to call yet. Make the first bid.");
  if (state.currentBid.playerId === playerId) return fail(state, "You can't call BS on your own bid");

  const live = activePlayers(state);
  const pool: Card[] = [...state.tableCards, ...live.flatMap((p) => p.hand)];
  const evaluation = evaluateBid(state.currentBid.bid, pool, state.settings, { disabledHandTypes: state.disabledHandTypes });
  const loserId = evaluation.exists ? playerId : state.currentBid.playerId;
  const loser = getPlayer(state, loserId)!;
  const loserBusted = loser.cardCount + 1 > state.settings.maxCards;
  const loserNewCardCount = loserBusted ? loser.cardCount : loser.cardCount + 1;

  const players = state.players.map((p) =>
    p.id !== loserId
      ? p
      : loserBusted
        ? { ...p, status: "eliminated" as const, eliminatedInRound: state.round }
        : { ...p, cardCount: loserNewCardCount },
  );

  const showdown: ShowdownResult = {
    round: state.round,
    callerId: playerId,
    bidderId: state.currentBid.playerId,
    bid: state.currentBid.bid,
    evaluation,
    loserId,
    loserBusted,
    loserNewCardCount,
    revealedHands: Object.fromEntries(live.map((p) => [p.id, p.hand])),
    tableCards: state.tableCards,
  };

  const stillIn = players.filter((p) => p.status === "active");
  const next: BsPokerState = { ...state, players, showdown, currentTurnPlayerId: null };
  if (stillIn.length <= 1) {
    return succeed({ ...next, phase: "game_over", winnerId: stillIn[0]?.id ?? null });
  }
  return succeed({ ...next, phase: "showdown" });
}

/** Loser of the last round opens the next one (or the next seat if they busted). */
export function nextRound(state: BsPokerState, playerId: string): Result {
  if (state.phase !== "showdown" || !state.showdown) return fail(state, "No finished round to advance from");
  if (!getPlayer(state, playerId)) return fail(state, "Player not in room");
  const { loserId, loserBusted } = state.showdown;
  const starterId = loserBusted ? nextActivePlayerId(state, loserId) : loserId;
  if (!starterId) return fail(state, "No active players left");
  return succeed(dealRound({ ...state, round: state.round + 1 }, starterId));
}

export function returnToLobby(state: BsPokerState, playerId: string): Result {
  if (playerId !== state.hostId) return fail(state, "Only the host can reset the game");
  return succeed({
    ...state,
    phase: "lobby",
    round: 0,
    roundStarterId: null,
    currentTurnPlayerId: null,
    currentBid: null,
    bidHistory: [],
    showdown: null,
    winnerId: null,
    disabledHandTypes: [],
    tableCards: [],
    burnCards: [],
    players: state.players.map((p) => ({
      ...p,
      cardCount: state.settings.startingCards,
      hand: [],
      status: "active",
      eliminatedInRound: undefined,
    })),
  });
}

/** Single entry point — what a server route / realtime handler would call. */
export function applyAction(state: BsPokerState, action: BsPokerAction): Result {
  switch (action.type) {
    case "JOIN_ROOM":
      return joinRoom(state, action.player);
    case "LEAVE_ROOM":
      return leaveRoom(state, action.playerId);
    case "RENAME_PLAYER":
      return renamePlayer(state, action.playerId, action.name);
    case "UPDATE_SETTINGS":
      return updateSettings(state, action.playerId, action.settings);
    case "START_GAME":
      return startGame(state, action.playerId, action.seed);
    case "PLACE_BID":
      return placeBid(state, action.playerId, action.bid);
    case "CALL_BS":
      return callBS(state, action.playerId);
    case "NEXT_ROUND":
      return nextRound(state, action.playerId);
    case "RETURN_TO_LOBBY":
      return returnToLobby(state, action.playerId);
  }
}

// ---------------------------------------------------------------------------
// Views (hidden information) & legal actions
// ---------------------------------------------------------------------------

export interface PublicPlayer extends Omit<BsPokerPlayer, "hand"> {
  /** null when this viewer isn't allowed to see the cards. */
  hand: Card[] | null;
}

export interface BsPokerView extends Omit<BsPokerState, "players" | "rngState" | "burnCards"> {
  /** How many face-down cards sit in the burn pile (their faces are never shared). */
  burnCount: number;
  viewerId: string | null;
  godMode: boolean;
  players: PublicPlayer[];
}

/**
 * Redacted state for one viewer. In online play this is what the server sends each
 * client; `rngState` and the burned cards are always stripped: they'd reveal hidden cards.
 */
export function getPlayerView(state: BsPokerState, viewer: string | "god"): BsPokerView {
  const godMode = viewer === "god";
  const reveal = state.phase === "showdown" || state.phase === "game_over";
  const { rngState: _secret, burnCards, players, ...rest } = state;
  void _secret;
  return {
    ...rest,
    burnCount: burnCards.length,
    viewerId: godMode ? null : viewer,
    godMode,
    players: players.map((p) => ({
      ...p,
      hand: godMode || p.id === viewer || (reveal && state.showdown?.revealedHands[p.id]) ? p.hand : null,
    })),
  };
}

export interface LegalActions {
  isMyTurn: boolean;
  canBid: boolean;
  canCallBS: boolean;
  legalBids: Bid[];
}

type TurnInfo = Pick<BsPokerState, "phase" | "currentTurnPlayerId" | "currentBid" | "disabledHandTypes">;

/** Everything a player (or bot) may do right now. Uses only public info. */
export function getLegalActions(state: TurnInfo, playerId: string | null): LegalActions {
  const isMyTurn = state.phase === "bidding" && !!playerId && state.currentTurnPlayerId === playerId;
  const legalBids = isMyTurn ? getLegalBids(state.currentBid?.bid ?? null, state.disabledHandTypes) : [];
  return {
    isMyTurn,
    canBid: legalBids.length > 0,
    canCallBS: isMyTurn && !!state.currentBid && state.currentBid.playerId !== playerId,
    legalBids,
  };
}
