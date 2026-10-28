/**
 * Blackjack against an automated dealer, as pure state transitions run by the host (online)
 * or the local simulator. Each action works on a copy of the state and returns the new one.
 *
 * Time comes in from outside (`now`), so the reducer stays pure: the host stamps its own clock
 * on every action, and a driver on the host fires TIME_UP / DEALER_STEP / NEXT_ROUND when due.
 */
import type { Card } from "@/types/cards";
import type { ActionResult, PlayerSeed } from "@/types/game";
import type {
  BlackjackAction,
  BlackjackHand,
  BlackjackPlayer,
  BlackjackSettings,
  BlackjackState,
  HandOutcome,
  RoundResult,
} from "@/types/blackjack";
import { createDeck, shuffle } from "./cards";
import type { GameDefinition } from "./multiplayer/room";

export const BLACKJACK_MIN_PLAYERS = 1;
export const BLACKJACK_MAX_PLAYERS = 7;

export const MIN_BET = 10;
/** Quick-bet chips. */
export const CHIP_VALUES = [10, 25, 50, 100] as const;
/** Most hands one player can split into. */
export const MAX_HANDS = 4;
/** Each decision on your turn; after this you stand. */
export const TURN_SECONDS = 30;
/** How long the round's results stay up before the next betting round. */
export const SETTLE_MS = 7000;

export const BLACKJACK_DEFAULTS: BlackjackSettings = { startingChips: 1000, decks: 6, betSeconds: 15 };

/** Choices offered in the lobby. */
export const STARTING_CHIP_OPTIONS = [250, 500, 1000, 2500, 5000, 10000];
export const DECK_OPTIONS = [1, 2, 4, 6, 8];
export const BET_SECONDS_OPTIONS = [10, 15, 20, 30];

type Result = ActionResult<BlackjackState>;
const fail = (state: BlackjackState, error: string): Result => ({ ok: false, error, state });
const succeed = (state: BlackjackState): Result => ({ ok: true, state: { ...state, version: state.version + 1 } });

// ---------------------------------------------------------------------------
// Card values
// ---------------------------------------------------------------------------

/** Aces count 11 here (handValue drops them to 1 as needed); faces are 10. */
export function cardValue(card: Card): number {
  if (card.kind === "joker") return 0;
  if (card.rank === 14) return 11;
  return Math.min(card.rank, 10);
}

/** Best total for a hand. `soft` means an Ace is still counting 11. */
export function handValue(cards: readonly Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = cardValue(c);
    if (v === 11) aces++;
    total += v;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

/** Two cards making 21. */
export const isTwoCard21 = (cards: readonly Card[]) => cards.length === 2 && handValue(cards).total === 21;

/** A natural: 21 on the first two cards of a hand that wasn't split. */
export const isNatural = (hand: Pick<BlackjackHand, "cards" | "fromSplit">) => !hand.fromSplit && isTwoCard21(hand.cards);

export const isBust = (cards: readonly Card[]) => handValue(cards).total > 21;

/** The dealer hits soft 17 and stands on hard 17. */
export function dealerShouldHit(cards: readonly Card[]): boolean {
  const { total, soft } = handValue(cards);
  return total < 17 || (total === 17 && soft);
}

/** Same rank, e.g. 8–8 (a King and a Queen don't split). */
export function isPair(cards: readonly Card[]): boolean {
  const [a, b] = cards;
  return cards.length === 2 && a.kind === "standard" && b.kind === "standard" && a.rank === b.rank;
}

const isAce = (c: Card) => c.kind === "standard" && c.rank === 14;

// ---------------------------------------------------------------------------
// The shoe
// ---------------------------------------------------------------------------

/** `decks` fresh decks; card ids stay unique across decks ("KS.0", "KS.1"…). */
export function createShoe(decks: number): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) for (const c of createDeck(false)) shoe.push({ ...c, id: `${c.id}.${d}` });
  return shoe;
}

function newShoe(s: BlackjackState) {
  const { result, rngState } = shuffle(createShoe(s.settings.decks), s.rngState);
  s.shoe = result;
  s.rngState = rngState;
  // Reshuffle once three quarters of the shoe is gone.
  s.cutCard = Math.floor(result.length / 4);
}

function draw(s: BlackjackState): Card {
  // Only a crowded single-deck table runs dry mid-round.
  if (s.shoe.length === 0) newShoe(s);
  return s.shoe.shift()!;
}

// ---------------------------------------------------------------------------
// Settings & seats
// ---------------------------------------------------------------------------

const clampInt = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(v) || lo)));

export function sanitizeBlackjackSettings(s: Partial<BlackjackSettings>): BlackjackSettings {
  return {
    startingChips: clampInt(s.startingChips ?? BLACKJACK_DEFAULTS.startingChips, 100, 1_000_000),
    decks: DECK_OPTIONS.includes(Number(s.decks)) ? Number(s.decks) : BLACKJACK_DEFAULTS.decks,
    betSeconds: BET_SECONDS_OPTIONS.includes(Number(s.betSeconds)) ? Number(s.betSeconds) : BLACKJACK_DEFAULTS.betSeconds,
  };
}

function seat(seed: PlayerSeed, isHost: boolean, chips: number): BlackjackPlayer {
  return {
    id: seed.id,
    name: seed.name.trim() || "Player",
    isBot: !!seed.isBot,
    ...(seed.botDifficulty ? { botDifficulty: seed.botDifficulty } : {}),
    isHost,
    chips,
    status: "active",
    bet: 0,
    lastBet: 0,
    hands: [],
    insurance: null,
  };
}

export function createBlackjackRoom(params: { roomId: string; host: PlayerSeed; settings?: Partial<BlackjackSettings> }): BlackjackState {
  const settings = sanitizeBlackjackSettings({ ...BLACKJACK_DEFAULTS, ...params.settings });
  return {
    mode: "blackjack",
    roomId: params.roomId,
    version: 0,
    phase: "lobby",
    settings,
    players: [seat(params.host, true, settings.startingChips)],
    hostId: params.host.id,
    rngState: 0,
    shoe: [],
    cutCard: 0,
    dealer: { cards: [], holeRevealed: false },
    roundNumber: 0,
    currentTurnId: null,
    currentHand: 0,
    deadline: null,
    result: null,
  };
}

function resetToLobby(s: BlackjackState): BlackjackState {
  const fresh = createBlackjackRoom({ roomId: s.roomId, host: { id: s.hostId, name: "" }, settings: s.settings });
  return {
    ...fresh,
    version: s.version,
    players: s.players.map((p) => ({ ...seat(p, p.id === s.hostId, s.settings.startingChips), name: p.name })),
  };
}

const getPlayer = (s: BlackjackState, id: string | null | undefined) => s.players.find((p) => p.id === id);

// ---------------------------------------------------------------------------
// Round flow
// ---------------------------------------------------------------------------

function beginBetting(s: BlackjackState, now: number): BlackjackState {
  s.phase = "betting";
  s.roundNumber += 1;
  s.dealer = { cards: [], holeRevealed: false };
  s.currentTurnId = null;
  s.currentHand = 0;
  s.result = null;
  for (const p of s.players) Object.assign(p, { hands: [], bet: 0, insurance: null });
  s.deadline = now + s.settings.betSeconds * 1000;
  return s;
}

const insuranceCost = (hand: BlackjackHand) => Math.floor(hand.bet / 2);

function deal(s: BlackjackState, now: number): BlackjackState {
  if (s.shoe.length <= s.cutCard) newShoe(s);
  const dealtIn = s.players.filter((p) => p.status === "active" && p.bet > 0);
  for (const p of dealtIn) {
    p.chips -= p.bet;
    p.lastBet = p.bet;
    p.hands = [{ cards: [], bet: p.bet, doubled: false, fromSplit: false, done: false }];
  }
  for (const p of s.players) p.bet = 0;

  // One card each and one to the dealer, twice round. The dealer's second card is the hole card.
  for (let pass = 0; pass < 2; pass++) {
    for (const p of dealtIn) p.hands[0].cards.push(draw(s));
    s.dealer.cards.push(draw(s));
  }
  for (const p of dealtIn) if (isNatural(p.hands[0])) p.hands[0].done = true;

  if (isAce(s.dealer.cards[0])) {
    let anyone = false;
    for (const p of s.players) {
      const hand = p.hands[0];
      const can = !!hand && insuranceCost(hand) >= 1 && p.chips >= insuranceCost(hand);
      p.insurance = can ? null : 0;
      anyone ||= can;
    }
    if (anyone) {
      s.phase = "insurance";
      s.deadline = now + s.settings.betSeconds * 1000;
      return s;
    }
  }
  return peekOrPlay(s, now);
}

/** With an Ace or a ten showing, the dealer checks for blackjack before anyone plays. */
function peekOrPlay(s: BlackjackState, now: number): BlackjackState {
  if (cardValue(s.dealer.cards[0]) >= 10 && isTwoCard21(s.dealer.cards)) {
    s.dealer.holeRevealed = true;
    return settle(s, now);
  }
  return advance(s, now);
}

/** First unfinished hand in seat order, or null when everyone's done. */
function nextHand(s: BlackjackState): { playerId: string; hand: number } | null {
  for (const p of s.players) {
    const h = p.hands.findIndex((hand) => !hand.done);
    if (h >= 0) return { playerId: p.id, hand: h };
  }
  return null;
}

/** Hand the turn to the next unfinished hand, or over to the dealer. */
function advance(s: BlackjackState, now: number): BlackjackState {
  const next = nextHand(s);
  if (next) {
    s.phase = "playing";
    s.currentTurnId = next.playerId;
    s.currentHand = next.hand;
    s.deadline = now + TURN_SECONDS * 1000;
    return s;
  }
  s.phase = "dealer";
  s.currentTurnId = null;
  s.currentHand = 0;
  s.deadline = null;
  return s;
}

/** Hands the dealer still has to beat (not bust, not already paid as a natural). */
const liveHands = (s: BlackjackState) => s.players.flatMap((p) => p.hands).filter((h) => !isBust(h.cards) && !isNatural(h));

function dealerStep(s: BlackjackState, now: number): BlackjackState {
  if (!s.dealer.holeRevealed) s.dealer.holeRevealed = true;
  else s.dealer.cards.push(draw(s));
  const done = liveHands(s).length === 0 || !dealerShouldHit(s.dealer.cards);
  return done ? settle(s, now) : s;
}

function outcomeOf(hand: BlackjackHand, dealer: { total: number; bust: boolean; blackjack: boolean }): { outcome: HandOutcome; payout: number } {
  const natural = isNatural(hand);
  if (dealer.blackjack) return natural ? { outcome: "push", payout: hand.bet } : { outcome: "lose", payout: 0 };
  if (natural) return { outcome: "blackjack", payout: hand.bet + Math.floor(hand.bet * 1.5) };
  const { total } = handValue(hand.cards);
  if (total > 21) return { outcome: "bust", payout: 0 };
  if (dealer.bust || total > dealer.total) return { outcome: "win", payout: hand.bet * 2 };
  if (total === dealer.total) return { outcome: "push", payout: hand.bet };
  return { outcome: "lose", payout: 0 };
}

function settle(s: BlackjackState, now: number): BlackjackState {
  const { total } = handValue(s.dealer.cards);
  const dealer = { total, bust: total > 21, blackjack: isTwoCard21(s.dealer.cards) };
  const net: Record<string, number> = {};
  const insuranceWon: Record<string, number> = {};

  for (const p of s.players) {
    if (p.hands.length === 0) continue;
    let back = 0;
    let staked = 0;
    for (const hand of p.hands) {
      Object.assign(hand, outcomeOf(hand, dealer), { done: true });
      back += hand.payout!;
      staked += hand.bet;
    }
    const insurance = p.insurance ?? 0;
    if (insurance > 0 && dealer.blackjack) {
      insuranceWon[p.id] = insurance * 3;
      back += insurance * 3;
    }
    p.chips += back;
    net[p.id] = back - staked - insurance;
  }

  for (const p of s.players) {
    if (p.status === "active" && p.chips < MIN_BET) {
      p.status = "busted";
      p.bustedInRound = s.roundNumber;
    }
  }

  s.result = { roundNumber: s.roundNumber, dealerTotal: total, dealerBust: dealer.bust, dealerBlackjack: dealer.blackjack, net, insuranceWon };
  s.currentTurnId = null;
  s.currentHand = 0;
  const anyoneLeft = s.players.some((p) => p.status === "active");
  s.phase = anyoneLeft ? "settled" : "game_over";
  s.deadline = anyoneLeft ? now + SETTLE_MS : null;
  return s;
}

// ---------------------------------------------------------------------------
// Player moves
// ---------------------------------------------------------------------------

type Move = "hit" | "stand" | "double" | "split";

function play(state: BlackjackState, playerId: string, move: Move, now: number): Result {
  if (state.phase !== "playing") return fail(state, "There's no hand being played");
  if (state.currentTurnId !== playerId) return fail(state, "It's not your turn");
  const s = structuredClone(state);
  const p = getPlayer(s, playerId)!;
  const hand = p.hands[s.currentHand];

  switch (move) {
    case "hit": {
      hand.cards.push(draw(s));
      if (handValue(hand.cards).total >= 21) hand.done = true;
      break;
    }
    case "stand":
      hand.done = true;
      break;
    case "double": {
      if (hand.cards.length !== 2) return fail(state, "You can only double on your first two cards");
      if (p.chips < hand.bet) return fail(state, "You don't have enough chips to double");
      p.chips -= hand.bet;
      hand.bet *= 2;
      hand.doubled = true;
      hand.cards.push(draw(s));
      hand.done = true;
      break;
    }
    case "split": {
      if (!isPair(hand.cards)) return fail(state, "You can only split two cards of the same rank");
      if (p.hands.length >= MAX_HANDS) return fail(state, `You can split into at most ${MAX_HANDS} hands`);
      if (p.chips < hand.bet) return fail(state, "You don't have enough chips to split");
      p.chips -= hand.bet;
      const aces = isAce(hand.cards[0]);
      const split = hand.cards.map((c): BlackjackHand => {
        const cards = [c, draw(s)];
        // Split Aces get one card each.
        return { cards, bet: hand.bet, doubled: false, fromSplit: true, done: aces || handValue(cards).total === 21 };
      });
      p.hands.splice(s.currentHand, 1, ...split);
      break;
    }
  }
  return succeed(advance(s, now));
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

/** A little slack for timers that fire a hair early. */
const TIMER_SLACK_MS = 250;

export function applyBlackjackAction(state: BlackjackState, action: BlackjackAction, now = 0): Result {
  switch (action.type) {
    case "JOIN_ROOM": {
      if (state.phase !== "lobby") return fail(state, "Game already in progress");
      if (state.players.length >= BLACKJACK_MAX_PLAYERS) return fail(state, `Room is full (max ${BLACKJACK_MAX_PLAYERS})`);
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
      const settings = sanitizeBlackjackSettings({ ...state.settings, ...action.settings });
      return succeed({ ...state, settings, players: state.players.map((p) => ({ ...p, chips: settings.startingChips })) });
    }
    case "START_GAME": {
      if (state.phase !== "lobby") return fail(state, "Game already started");
      if (action.playerId !== state.hostId) return fail(state, "Only the host can start the game");
      if (state.players.length < BLACKJACK_MIN_PLAYERS) return fail(state, `Need at least ${BLACKJACK_MIN_PLAYERS} player`);
      const s = structuredClone(resetToLobby(state));
      s.rngState = action.seed >>> 0;
      newShoe(s);
      return succeed(beginBetting(s, now));
    }
    case "PLACE_BET": {
      if (state.phase !== "betting") return fail(state, "Bets are closed");
      const p = getPlayer(state, action.playerId);
      if (!p || p.status !== "active") return fail(state, "You're not in this round");
      const amount = action.amount;
      if (!Number.isInteger(amount) || amount < 0) return fail(state, "Pick an amount");
      if (amount > 0 && amount < MIN_BET) return fail(state, `The smallest bet is ${MIN_BET}`);
      if (amount > p.chips) return fail(state, "You don't have that many chips");
      const s = structuredClone(state);
      getPlayer(s, p.id)!.bet = amount;
      // Everyone's in: no need to wait out the timer.
      const allIn = s.players.filter((x) => x.status === "active").every((x) => x.bet > 0);
      return succeed(allIn ? deal(s, now) : s);
    }
    case "INSURANCE": {
      if (state.phase !== "insurance") return fail(state, "Insurance isn't on offer");
      const p = getPlayer(state, action.playerId);
      if (!p || p.insurance !== null) return fail(state, "You've already decided");
      const s = structuredClone(state);
      const me = getPlayer(s, p.id)!;
      const cost = insuranceCost(me.hands[0]);
      me.insurance = action.take ? cost : 0;
      me.chips -= me.insurance;
      return succeed(s.players.every((x) => x.insurance !== null) ? peekOrPlay(s, now) : s);
    }
    case "HIT":
      return play(state, action.playerId, "hit", now);
    case "STAND":
      return play(state, action.playerId, "stand", now);
    case "DOUBLE":
      return play(state, action.playerId, "double", now);
    case "SPLIT":
      return play(state, action.playerId, "split", now);
    case "TIME_UP": {
      if (action.playerId !== state.hostId) return fail(state, "Only the host's clock can do that");
      if (state.deadline === null || now < state.deadline - TIMER_SLACK_MS) return fail(state, "There's still time");
      const s = structuredClone(state);
      if (s.phase === "betting") {
        // Nobody bet: keep the table open for another round of betting.
        if (!s.players.some((p) => p.bet > 0)) {
          s.deadline = now + s.settings.betSeconds * 1000;
          return succeed(s);
        }
        return succeed(deal(s, now));
      }
      if (s.phase === "insurance") {
        for (const p of s.players) if (p.insurance === null) p.insurance = 0;
        return succeed(peekOrPlay(s, now));
      }
      if (s.phase === "playing") return play(state, state.currentTurnId!, "stand", now);
      return fail(state, "Nothing is timed right now");
    }
    case "DEALER_STEP": {
      if (action.playerId !== state.hostId) return fail(state, "Only the host's table can do that");
      if (state.phase !== "dealer") return fail(state, "It's not the dealer's turn");
      return succeed(dealerStep(structuredClone(state), now));
    }
    case "NEXT_ROUND": {
      if (action.playerId !== state.hostId) return fail(state, "Only the host can deal the next round");
      if (state.phase !== "settled") return fail(state, "The round isn't over yet");
      return succeed(beginBetting(structuredClone(state), now));
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

export interface BlackjackView extends Omit<BlackjackState, "rngState" | "shoe" | "dealer"> {
  viewerId: string | null;
  godMode: boolean;
  /** The hole card is null until the dealer turns it over. */
  dealer: { cards: (Card | null)[]; holeRevealed: boolean };
  /** Cards left in the shoe. */
  shoeCount: number;
}

/**
 * What one player may see. Every player's cards are face up in blackjack; the shoe order and
 * the dealer's hole card never leave the host (not even in the simulator's "Everyone" view).
 */
export function getBlackjackView(state: BlackjackState, viewer: string | "god"): BlackjackView {
  const godMode = viewer === "god";
  const { rngState: _r, shoe, dealer, ...rest } = state;
  void _r;
  return {
    ...rest,
    viewerId: godMode ? null : viewer,
    godMode,
    dealer: { cards: dealer.cards.map((c, i) => (i === 1 && !dealer.holeRevealed ? null : c)), holeRevealed: dealer.holeRevealed },
    shoeCount: shoe.length,
  };
}

/** The dealer's total from the cards showing. */
export function dealerShowing(view: Pick<BlackjackView, "dealer">) {
  return handValue(view.dealer.cards.filter((c): c is Card => c !== null));
}

export interface BlackjackLegal {
  /** Betting is open and you have chips to bet. */
  canBet: boolean;
  maxBet: number;
  /** You still have to answer the insurance offer. */
  insuranceOffer: number | null;
  isMyTurn: boolean;
  canHit: boolean;
  canStand: boolean;
  canDouble: boolean;
  canSplit: boolean;
}

export function getBlackjackLegal(view: BlackjackView, playerId: string | null): BlackjackLegal {
  const me = view.players.find((p) => p.id === playerId);
  const none: BlackjackLegal = { canBet: false, maxBet: 0, insuranceOffer: null, isMyTurn: false, canHit: false, canStand: false, canDouble: false, canSplit: false };
  if (!me || me.status !== "active") return none;
  if (view.phase === "betting") return { ...none, canBet: me.chips >= MIN_BET, maxBet: me.chips };
  if (view.phase === "insurance") return { ...none, insuranceOffer: me.insurance === null ? Math.floor(me.hands[0].bet / 2) : null };
  const isMyTurn = view.phase === "playing" && view.currentTurnId === me.id;
  const hand = me.hands[view.currentHand];
  if (!isMyTurn || !hand) return none;
  const firstTwo = hand.cards.length === 2;
  return {
    ...none,
    isMyTurn,
    canHit: true,
    canStand: true,
    canDouble: firstTwo && me.chips >= hand.bet,
    canSplit: isPair(hand.cards) && me.hands.length < MAX_HANDS && me.chips >= hand.bet,
  };
}

/** Blackjack as a game the online room can host. The host's clock stamps every move. */
export const blackjackGame: GameDefinition<BlackjackState, BlackjackAction, BlackjackView> = {
  applyAction: (state, action) => applyBlackjackAction(state, action, Date.now()),
  getPlayerView: getBlackjackView,
  join: (player) => ({ type: "JOIN_ROOM", player }),
  leave: (playerId) => ({ type: "LEAVE_ROOM", playerId }),
  maxPlayers: BLACKJACK_MAX_PLAYERS,
};

// ---------------------------------------------------------------------------
// The host's clock
// ---------------------------------------------------------------------------

/** Pause between the dealer's cards. */
const DEALER_STEP_MS = 900;

/** What the table does by itself next, and when (ms timestamp). */
export function blackjackClock(s: BlackjackState): { at: number; action: BlackjackAction } | null {
  const host = s.hostId;
  switch (s.phase) {
    case "betting":
    case "insurance":
    case "playing":
      return s.deadline === null ? null : { at: s.deadline, action: { type: "TIME_UP", playerId: host } };
    case "dealer":
      return { at: Date.now() + DEALER_STEP_MS, action: { type: "DEALER_STEP", playerId: host } };
    case "settled":
      return s.deadline === null ? null : { at: s.deadline, action: { type: "NEXT_ROUND", playerId: host } };
    default:
      return null;
  }
}
