/**
 * Texas Hold'em (no-limit) as pure state transitions, run by the host (online) or the
 * local simulator. Each action works on a copy of the state and returns the new one.
 */
import type { Card } from "@/types/cards";
import type { ActionResult, PlayerSeed } from "@/types/game";
import type {
  HandResult,
  HoldemAction,
  HoldemMove,
  HoldemPlayer,
  HoldemSettings,
  HoldemState,
  PotResult,
  Street,
} from "@/types/holdem";
import { createDeck, nextRandom, shuffle } from "./cards";
import { bestHand, compareHands, type HandValue } from "./holdem-hand";
import { buildPots, splitPot } from "./holdem-pots";
import type { GameDefinition } from "./multiplayer/room";

export const HOLDEM_MIN_PLAYERS = 2;
export const HOLDEM_MAX_PLAYERS = 9;

export const HOLDEM_DEFAULTS: HoldemSettings = {
  startingChips: 1000,
  smallBlind: 10,
  blindIncrease: { mode: "never", everyHands: 10, multiplier: 2 },
};

/** Choices offered in the lobby. */
export const STARTING_CHIP_OPTIONS = [200, 500, 1000, 2000, 5000, 10000, 25000];
export const SMALL_BLIND_OPTIONS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
export const BLIND_EVERY_OPTIONS = [1, 2, 3, 5, 10, 15, 20, 30];
export const BLIND_MULTIPLIERS = [1.5, 2];

type Result = ActionResult<HoldemState>;
const fail = (state: HoldemState, error: string): Result => ({ ok: false, error, state });
const succeed = (state: HoldemState): Result => ({ ok: true, state: { ...state, version: state.version + 1 } });

// ---------------------------------------------------------------------------
// Settings & blinds
// ---------------------------------------------------------------------------

const clampInt = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(v) || lo)));

export function sanitizeHoldemSettings(s: Partial<HoldemSettings>): HoldemSettings {
  const startingChips = clampInt(s.startingChips ?? HOLDEM_DEFAULTS.startingChips, 20, 1_000_000);
  // Keep at least 10 big blinds in a starting stack.
  const smallBlind = clampInt(s.smallBlind ?? HOLDEM_DEFAULTS.smallBlind, 1, Math.max(1, Math.floor(startingChips / 20)));
  const bi = { ...HOLDEM_DEFAULTS.blindIncrease, ...s.blindIncrease };
  return {
    startingChips,
    smallBlind,
    blindIncrease: {
      mode: bi.mode === "every_n_hands" ? "every_n_hands" : "never",
      everyHands: clampInt(bi.everyHands, 1, 100),
      multiplier: BLIND_MULTIPLIERS.includes(bi.multiplier) ? bi.multiplier : 2,
    },
  };
}

/** Blinds for a given hand number (1-based). */
export function blindsForHand(settings: HoldemSettings, handNumber: number): { small: number; big: number } {
  const { mode, everyHands, multiplier } = settings.blindIncrease;
  const level = mode === "never" ? 0 : Math.floor(Math.max(0, handNumber - 1) / everyHands);
  const small = Math.max(1, Math.round(settings.smallBlind * multiplier ** level));
  return { small, big: small * 2 };
}

/** When the blinds next go up, counted from the hand being played now. */
export function nextBlindRise(settings: HoldemSettings, handNumber: number) {
  if (settings.blindIncrease.mode === "never" || handNumber < 1) return null;
  const { everyHands } = settings.blindIncrease;
  const handsLeft = everyHands - ((handNumber - 1) % everyHands);
  return { handsLeft, ...blindsForHand(settings, handNumber + handsLeft) };
}

// ---------------------------------------------------------------------------
// Seat helpers
// ---------------------------------------------------------------------------

const getPlayer = (s: HoldemState, id: string | null | undefined) => s.players.find((p) => p.id === id);

/** First player after `fromId` (clockwise, not including it) who matches. */
function nextPlayer(s: HoldemState, fromId: string, match: (p: HoldemPlayer) => boolean): HoldemPlayer | undefined {
  const n = s.players.length;
  const start = s.players.findIndex((p) => p.id === fromId);
  for (let step = 1; step <= n; step++) {
    const p = s.players[(start + step + n) % n];
    if (match(p)) return p;
  }
  return undefined;
}

/** Ids in seat order starting just after the button (for odd-chip order). */
function orderFromButton(s: HoldemState, ids: string[]): string[] {
  const n = s.players.length;
  const start = s.players.findIndex((p) => p.id === s.buttonId);
  const out: string[] = [];
  for (let step = 1; step <= n; step++) {
    const p = s.players[(start + step) % n];
    if (ids.includes(p.id)) out.push(p.id);
  }
  return out;
}

const isLive = (p: HoldemPlayer) => p.inHand && !p.folded;
const canAct = (p: HoldemPlayer) => isLive(p) && !p.allIn;

/** Does this player still have to act on this street? */
function needsToAct(s: HoldemState, p: HoldemPlayer): boolean {
  if (!canAct(p)) return false;
  const actors = s.players.filter(canAct);
  if (actors.length === 1) {
    // Everyone else is all in: only act if you're facing a bet you haven't matched.
    const facing = Math.max(0, ...s.players.filter((o) => o.id !== p.id && isLive(o)).map((o) => o.bet));
    return p.bet < facing;
  }
  return !p.hasActed || p.bet < s.currentBet;
}

/** May this player raise right now? (Not after an all-in that wasn't a full raise.) */
function raiseOpen(s: HoldemState, p: HoldemPlayer): boolean {
  return !p.hasActed && s.players.some((o) => o.id !== p.id && canAct(o));
}

// ---------------------------------------------------------------------------
// Hand flow
// ---------------------------------------------------------------------------

function commit(p: HoldemPlayer, amount: number) {
  const pay = Math.min(amount, p.chips);
  p.chips -= pay;
  p.bet += pay;
  p.totalBet += pay;
  if (p.chips === 0) p.allIn = true;
  return pay;
}

function startHand(prev: HoldemState, buttonId: string): HoldemState {
  const s = structuredClone(prev);
  s.handNumber += 1;
  const { small, big } = blindsForHand(s.settings, s.handNumber);
  s.smallBlind = small;
  s.bigBlind = big;
  s.buttonId = buttonId;

  for (const p of s.players) {
    Object.assign(p, { hand: [], inHand: p.status === "active", folded: false, allIn: false, bet: 0, totalBet: 0, hasActed: false });
  }
  const dealtIn = s.players.filter((p) => p.inHand);
  const headsUp = dealtIn.length === 2;
  // Heads-up, the button posts the small blind.
  const sb = headsUp ? getPlayer(s, buttonId)! : nextPlayer(s, buttonId, (p) => p.inHand)!;
  const bb = nextPlayer(s, sb.id, (p) => p.inHand)!;
  s.smallBlindId = sb.id;
  s.bigBlindId = bb.id;

  const { result: deck, rngState } = shuffle(createDeck(false), s.rngState);
  s.rngState = rngState;
  s.burnCards = deck.slice(0, 3);
  s.boardCards = deck.slice(3, 8);
  let cursor = 8;
  for (const p of dealtIn) {
    p.hand = deck.slice(cursor, cursor + 2);
    cursor += 2;
  }

  s.street = "preflop";
  s.boardShown = 0;
  s.burnsShown = 0;
  s.result = null;
  s.lastActions = {};
  commit(sb, small);
  s.lastActions[sb.id] = { playerId: sb.id, move: "small_blind", amount: sb.bet };
  commit(bb, big);
  s.lastActions[bb.id] = { playerId: bb.id, move: "big_blind", amount: bb.bet };
  // A short all-in big blind still sets the price at the full big blind.
  s.currentBet = big;
  s.minRaise = big;
  s.phase = "betting";
  return advance(s, bb.id);
}

/** Hand the turn to the next player who must act, or close the street. */
function advance(s: HoldemState, fromId: string): HoldemState {
  const live = s.players.filter(isLive);
  if (live.length === 1) return awardUncontested(s, live[0]);
  const next = nextPlayer(s, fromId, (p) => needsToAct(s, p));
  if (next) {
    s.currentTurnId = next.id;
    return s;
  }
  return endStreet(s);
}

const NEXT_STREET: Record<Street, { street: Street; shown: number; burns: number } | null> = {
  preflop: { street: "flop", shown: 3, burns: 1 },
  flop: { street: "turn", shown: 4, burns: 2 },
  turn: { street: "river", shown: 5, burns: 3 },
  river: null,
};

function endStreet(s: HoldemState): HoldemState {
  for (const p of s.players) {
    p.bet = 0;
    p.hasActed = false;
  }
  s.currentBet = 0;
  s.minRaise = s.bigBlind;
  const next = NEXT_STREET[s.street];
  if (!next) return showdown(s);
  s.street = next.street;
  s.boardShown = next.shown;
  s.burnsShown = next.burns;
  // Keep folds and all-ins on the seats; clear everything else for the new street.
  s.lastActions = Object.fromEntries(
    Object.entries(s.lastActions).filter(([, a]) => a.move === "fold" || a.move === "all_in"),
  );
  // Post-flop, the first live player left of the button acts first.
  const first = nextPlayer(s, s.buttonId!, (p) => needsToAct(s, p));
  if (first) {
    s.currentTurnId = first.id;
    return s;
  }
  // Nobody can bet (everyone's all in): run out the board.
  return endStreet(s);
}

function awardUncontested(s: HoldemState, winner: HoldemPlayer): HoldemState {
  const total = s.players.reduce((n, p) => n + p.totalBet, 0);
  winner.chips += total;
  const pot: PotResult = { amount: total, eligibleIds: [winner.id], winnerIds: [winner.id], shares: { [winner.id]: total } };
  return finishHand(s, { handNumber: s.handNumber, uncontested: true, pots: [pot], revealed: {}, best: {}, won: { [winner.id]: total } });
}

function showdown(s: HoldemState): HoldemState {
  s.boardShown = 5;
  s.burnsShown = 3;
  const live = s.players.filter(isLive);
  const values = new Map<string, HandValue>(live.map((p) => [p.id, bestHand([...s.boardCards, ...p.hand])]));
  const { pots, refunds } = buildPots(s.players.filter((p) => p.inHand).map((p) => ({ id: p.id, amount: p.totalBet, folded: p.folded })));

  const won: Record<string, number> = {};
  const potResults: PotResult[] = pots.map((pot) => {
    const contenders = pot.eligibleIds.filter((id) => values.has(id));
    let top: HandValue | null = null;
    for (const id of contenders) if (!top || compareHands(values.get(id)!, top) > 0) top = values.get(id)!;
    const winnerIds = orderFromButton(s, contenders.filter((id) => compareHands(values.get(id)!, top!) === 0));
    const shares = splitPot(pot.amount, winnerIds);
    for (const [id, amt] of Object.entries(shares)) {
      getPlayer(s, id)!.chips += amt;
      won[id] = (won[id] ?? 0) + amt;
    }
    return { ...pot, winnerIds, shares };
  });
  for (const [id, amt] of Object.entries(refunds)) getPlayer(s, id)!.chips += amt;

  return finishHand(s, {
    handNumber: s.handNumber,
    uncontested: false,
    pots: potResults,
    revealed: Object.fromEntries(live.map((p) => [p.id, p.hand])),
    best: Object.fromEntries(
      [...values].map(([id, v]) => [id, { label: v.label, cardIds: v.cards.map((c) => c.id) }]),
    ),
    won,
  });
}

function finishHand(s: HoldemState, result: HandResult): HoldemState {
  for (const p of s.players) {
    p.bet = 0;
    if (p.status === "active" && p.chips === 0) {
      p.status = "busted";
      p.bustedInHand = s.handNumber;
    }
  }
  s.result = result;
  s.currentTurnId = null;
  s.currentBet = 0;
  const left = s.players.filter((p) => p.status === "active");
  if (left.length <= 1) {
    s.phase = "game_over";
    s.winnerId = left[0]?.id ?? null;
  } else {
    s.phase = "hand_over";
  }
  return s;
}

// ---------------------------------------------------------------------------
// Betting
// ---------------------------------------------------------------------------

function act(state: HoldemState, playerId: string, move: "fold" | "check" | "call" | "raise" | "all_in", to?: number): Result {
  if (state.phase !== "betting") return fail(state, "There's no hand being played");
  if (state.currentTurnId !== playerId) return fail(state, "It's not your turn");
  const s = structuredClone(state);
  const p = getPlayer(s, playerId)!;
  const toCall = Math.max(0, s.currentBet - p.bet);
  const maxTo = p.bet + p.chips;
  let recorded: HoldemMove = move;

  if (move === "all_in") {
    if (maxTo > s.currentBet && raiseOpen(s, p)) {
      move = "raise";
      to = maxTo;
    } else if (toCall > 0) {
      // Raising isn't possible here, so going all in means calling what you can.
      move = "call";
    } else {
      return fail(state, "There's nothing to call");
    }
  }

  switch (move) {
    case "fold":
      p.folded = true;
      break;
    case "check":
      if (toCall > 0) return fail(state, "You can't check facing a bet");
      break;
    case "call":
      if (toCall === 0) return fail(state, "There's nothing to call");
      commit(p, toCall);
      recorded = p.allIn ? "all_in" : "call";
      break;
    case "raise": {
      if (!raiseOpen(s, p)) return fail(state, "You can only call or fold");
      if (to === undefined || !Number.isInteger(to)) return fail(state, "Pick an amount");
      if (to <= s.currentBet) return fail(state, "A raise has to be more than the current bet");
      if (to > maxTo) return fail(state, "You don't have that many chips");
      const increase = to - s.currentBet;
      const full = increase >= s.minRaise;
      if (!full && to !== maxTo) {
        return fail(state, `The smallest ${s.currentBet === 0 ? "bet" : "raise"} is to ${s.currentBet + s.minRaise}`);
      }
      const opening = s.currentBet === 0;
      commit(p, to - p.bet);
      if (full) {
        s.minRaise = increase;
        // A full raise reopens the betting for everyone else.
        for (const o of s.players) if (o.id !== p.id && canAct(o)) o.hasActed = false;
      }
      s.currentBet = to;
      recorded = p.allIn ? "all_in" : opening ? "bet" : "raise";
      break;
    }
  }
  p.hasActed = true;
  s.lastActions[p.id] = { playerId: p.id, move: recorded, ...(recorded !== "fold" && recorded !== "check" ? { amount: p.bet } : {}) };
  return succeed(advance(s, p.id));
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

function seat(seed: PlayerSeed, isHost: boolean, chips: number): HoldemPlayer {
  return {
    id: seed.id,
    name: seed.name.trim() || "Player",
    isBot: !!seed.isBot,
    ...(seed.botDifficulty ? { botDifficulty: seed.botDifficulty } : {}),
    isHost,
    chips,
    hand: [],
    status: "active",
    inHand: false,
    folded: false,
    allIn: false,
    bet: 0,
    totalBet: 0,
    hasActed: false,
  };
}

export function createHoldemRoom(params: { roomId: string; host: PlayerSeed; settings?: Partial<HoldemSettings> }): HoldemState {
  const settings = sanitizeHoldemSettings({ ...HOLDEM_DEFAULTS, ...params.settings });
  const { small, big } = blindsForHand(settings, 1);
  return {
    mode: "texas-holdem",
    roomId: params.roomId,
    version: 0,
    phase: "lobby",
    settings,
    players: [seat(params.host, true, settings.startingChips)],
    hostId: params.host.id,
    rngState: 0,
    handNumber: 0,
    buttonId: null,
    smallBlindId: null,
    bigBlindId: null,
    smallBlind: small,
    bigBlind: big,
    street: "preflop",
    boardCards: [],
    boardShown: 0,
    burnCards: [],
    burnsShown: 0,
    currentTurnId: null,
    currentBet: 0,
    minRaise: big,
    lastActions: {},
    result: null,
    winnerId: null,
  };
}

function resetToLobby(s: HoldemState): HoldemState {
  const fresh = createHoldemRoom({ roomId: s.roomId, host: { id: s.hostId, name: "" }, settings: s.settings });
  return {
    ...fresh,
    version: s.version,
    players: s.players.map((p) => ({ ...seat(p, p.id === s.hostId, s.settings.startingChips), name: p.name })),
  };
}

export function applyHoldemAction(state: HoldemState, action: HoldemAction): Result {
  switch (action.type) {
    case "JOIN_ROOM": {
      if (state.phase !== "lobby") return fail(state, "Game already in progress");
      if (state.players.length >= HOLDEM_MAX_PLAYERS) return fail(state, `Room is full (max ${HOLDEM_MAX_PLAYERS})`);
      if (state.players.some((p) => p.id === action.player.id)) return fail(state, "Player already in room");
      return succeed({ ...state, players: [...state.players, seat(action.player, false, state.settings.startingChips)] });
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
      const settings = sanitizeHoldemSettings({
        ...state.settings,
        ...action.settings,
        blindIncrease: { ...state.settings.blindIncrease, ...action.settings.blindIncrease },
      });
      const { small, big } = blindsForHand(settings, 1);
      return succeed({
        ...state,
        settings,
        smallBlind: small,
        bigBlind: big,
        players: state.players.map((p) => ({ ...p, chips: settings.startingChips })),
      });
    }
    case "START_GAME": {
      if (state.phase !== "lobby") return fail(state, "Game already started");
      if (action.playerId !== state.hostId) return fail(state, "Only the host can start the game");
      if (state.players.length < HOLDEM_MIN_PLAYERS) return fail(state, `Need at least ${HOLDEM_MIN_PLAYERS} players`);
      const [r, rngState] = nextRandom(action.seed >>> 0);
      const button = state.players[Math.floor(r * state.players.length)];
      const base = resetToLobby(state);
      return succeed(startHand({ ...base, rngState }, button.id));
    }
    case "FOLD":
      return act(state, action.playerId, "fold");
    case "CHECK":
      return act(state, action.playerId, "check");
    case "CALL":
      return act(state, action.playerId, "call");
    case "RAISE":
      return act(state, action.playerId, "raise", action.to);
    case "ALL_IN":
      return act(state, action.playerId, "all_in");
    case "NEXT_HAND": {
      if (state.phase !== "hand_over") return fail(state, "The hand isn't over yet");
      if (action.playerId !== state.hostId) return fail(state, "Only the host can deal the next hand");
      const button = nextPlayer(state, state.buttonId!, (p) => p.status === "active");
      if (!button) return fail(state, "No players left");
      return succeed(startHand(state, button.id));
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

export interface HoldemPublicPlayer extends Omit<HoldemPlayer, "hand"> {
  /** null when this viewer can't see the cards (or the player wasn't dealt in). */
  hand: Card[] | null;
}

export interface HoldemView extends Omit<HoldemState, "players" | "rngState" | "boardCards" | "burnCards"> {
  viewerId: string | null;
  godMode: boolean;
  players: HoldemPublicPlayer[];
  /** The face-up board cards. */
  board: Card[];
  burnCount: number;
}

/** What one player may see. The deck order, the unturned board and the burns never leave the host. */
export function getHoldemView(state: HoldemState, viewer: string | "god"): HoldemView {
  const godMode = viewer === "god";
  const { rngState: _r, boardCards, burnCards: _b, players, ...rest } = state;
  void _r;
  void _b;
  const shown = state.result?.revealed ?? {};
  return {
    ...rest,
    viewerId: godMode ? null : viewer,
    godMode,
    board: boardCards.slice(0, state.boardShown),
    burnCount: state.burnsShown,
    players: players.map((p) => ({
      ...p,
      hand: p.inHand && (godMode || p.id === viewer || shown[p.id]) ? p.hand : null,
    })),
  };
}

export interface HoldemLegal {
  isMyTurn: boolean;
  canCheck: boolean;
  /** Chips it costs to call (capped at your stack). 0 when you can check. */
  callAmount: number;
  callIsAllIn: boolean;
  canRaise: boolean;
  /** Bet or raise to (street totals). */
  minRaiseTo: number;
  maxRaiseTo: number;
  isOpeningBet: boolean;
  /** Everything in the middle, including this street's bets. */
  pot: number;
}

export function getHoldemLegal(view: HoldemView, playerId: string | null): HoldemLegal {
  const me = view.players.find((p) => p.id === playerId);
  const pot = view.players.reduce((n, p) => n + p.totalBet, 0);
  const isMyTurn = view.phase === "betting" && !!me && view.currentTurnId === me.id;
  const none: HoldemLegal = { isMyTurn: false, canCheck: false, callAmount: 0, callIsAllIn: false, canRaise: false, minRaiseTo: 0, maxRaiseTo: 0, isOpeningBet: false, pot };
  if (!isMyTurn || !me) return none;
  const toCall = Math.max(0, view.currentBet - me.bet);
  const maxRaiseTo = me.bet + me.chips;
  const othersCanAct = view.players.some((o) => o.id !== me.id && o.inHand && !o.folded && !o.allIn);
  const canRaise = !me.hasActed && othersCanAct && maxRaiseTo > view.currentBet;
  return {
    isMyTurn,
    canCheck: toCall === 0,
    callAmount: Math.min(toCall, me.chips),
    callIsAllIn: toCall > 0 && me.chips <= toCall,
    canRaise,
    minRaiseTo: Math.min(view.currentBet + view.minRaise, maxRaiseTo),
    maxRaiseTo,
    isOpeningBet: view.currentBet === 0,
    pot,
  };
}

export const holdemActivePlayers = (s: { players: { status: string }[] }) => s.players.filter((p) => p.status === "active");

/** Texas Hold'em as a game the online room can host. */
export const holdemGame: GameDefinition<HoldemState, HoldemAction, HoldemView> = {
  applyAction: applyHoldemAction,
  getPlayerView: getHoldemView,
  join: (player) => ({ type: "JOIN_ROOM", player }),
  leave: (playerId) => ({ type: "LEAVE_ROOM", playerId }),
  maxPlayers: HOLDEM_MAX_PLAYERS,
};
