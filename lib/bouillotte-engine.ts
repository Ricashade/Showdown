/**
 * Bouillotte, three to five players, as pure state transitions run by the host (online) or the
 * local simulator. Each action works on a copy of the state and returns the new one.
 *
 * A stripped deck sized to the table (16, 20 or 24 cards), three cards each and one turned face
 * up in the middle: the Retourné. Antes, an optional blind carré, then one round of betting.
 * At a showdown a brélan (three of a kind) wins; without one, every hand dealt is turned up,
 * folded ones too, and the suit with the most points across the table (Le Point) decides: the
 * highest card of that suit still in the hand takes the pot.
 */
import { cleanName } from "./names";
import type { Card, Rank, StandardCard, Suit } from "@/types/cards";
import { GOD_VIEW, type ActionResult, type PlayerSeed, type ViewerId } from "@/types/game";
import type {
  AnteBy,
  BouillotteAction,
  BouillotteMove,
  BouillottePlayer,
  BouillottePotResult,
  BouillotteResult,
  BouillotteSettings,
  BouillotteState,
  Brelan,
} from "@/types/bouillotte";
import { nextRandom, shuffle, SUITS, seedRng } from "./cards";
import { buildPots } from "./holdem-pots";
import type { GameDefinition } from "./multiplayer/room";

export const BOUILLOTTE_MIN_PLAYERS = 3;
export const BOUILLOTTE_MAX_PLAYERS = 5;
export const HAND_SIZE = 3;
export const STARTING_CHIP_CHOICES = [50, 100, 200, 500] as const;
export const ANTE_CHOICES = [1, 2, 5] as const;
/** Paid to a brélan that wins the main pot, by every other player dealt in. */
export const BRELAN_BONUS = 1;
export const CARRE_BONUS = 2;

export const BOUILLOTTE_DEFAULTS: BouillotteSettings = { startingChips: 100, ante: 1, anteBy: "everyone", allowCarre: true, brelanFavori: true };

type Result = ActionResult<BouillotteState>;
const fail = (state: BouillotteState, error: string): Result => ({ ok: false, error, state });
const succeed = (state: BouillotteState): Result => ({ ok: true, state: { ...state, version: state.version + 1 } });

export function sanitizeBouillotteSettings(s: Partial<BouillotteSettings>): BouillotteSettings {
  const pick = <T extends number>(choices: readonly T[], v: unknown, fallback: T) => (choices.includes(v as T) ? (v as T) : fallback);
  return {
    startingChips: pick(STARTING_CHIP_CHOICES, s.startingChips, 100),
    ante: pick(ANTE_CHOICES, s.ante, 1),
    anteBy: (s.anteBy === "dealer" ? "dealer" : "everyone") as AnteBy,
    allowCarre: s.allowCarre !== false,
    brelanFavori: s.brelanFavori !== false,
  };
}

const seat = (seed: PlayerSeed, isHost: boolean, chips = 0): BouillottePlayer => ({
  id: seed.id,
  name: cleanName(seed.name) ?? "Player",
  isBot: !!seed.isBot,
  ...(seed.botDifficulty ? { botDifficulty: seed.botDifficulty } : {}),
  isHost,
  chips,
  status: "active",
  inHand: false,
  hand: [],
  folded: false,
  allIn: false,
  ante: 0,
  bet: 0,
  acted: false,
  mayRaise: true,
});

export function createBouillotteRoom(params: { roomId: string; host: PlayerSeed; settings?: Partial<BouillotteSettings> }): BouillotteState {
  return {
    mode: "bouillotte",
    roomId: params.roomId,
    version: 0,
    phase: "lobby",
    settings: sanitizeBouillotteSettings({ ...BOUILLOTTE_DEFAULTS, ...params.settings }),
    players: [seat(params.host, true)],
    hostId: params.host.id,
    rngState: seedRng(0),
    handNumber: 0,
    dealerId: null,
    retourne: null,
    stub: [],
    carreSeatId: null,
    carrePosted: false,
    currentBet: 0,
    minRaise: 0,
    currentTurnId: null,
    lastActions: {},
    result: null,
    winnerId: null,
  };
}

function resetToLobby(s: BouillotteState): BouillotteState {
  const fresh = createBouillotteRoom({ roomId: s.roomId, host: { id: s.hostId, name: "" }, settings: s.settings });
  return { ...fresh, version: s.version, players: s.players.map((p) => ({ ...seat(p, p.id === s.hostId), name: p.name })) };
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** Ace high, then K, Q, J, 9, 8 (no 10s and nothing lower in this deck). */
export const RANK_ORDER: readonly Rank[] = [14, 13, 12, 11, 9, 8];
/** What a card is worth toward Le Point. */
export const pointValue = (r: Rank) => (r === 14 ? 11 : r >= 11 ? 10 : r);

/** The ranks in play: A K 9 8 for two or three, plus Q for four, plus J for five. */
export function ranksFor(players: number): Rank[] {
  return players >= 5 ? [14, 13, 12, 11, 9, 8] : players === 4 ? [14, 13, 12, 9, 8] : [14, 13, 9, 8];
}

export function deckFor(players: number): StandardCard[] {
  const short: Record<number, string> = { 14: "A", 13: "K", 12: "Q", 11: "J", 9: "9", 8: "8" };
  return SUITS.flatMap((suit) => ranksFor(players).map((rank) => ({ id: `${short[rank]}${suit}`, kind: "standard" as const, rank, suit })));
}

const std = (c: Card) => c as StandardCard;

/** A brélan in this hand (with the Retourné), or null. */
export function brelanOf(hand: readonly Card[], retourne: Card, favori: boolean): Brelan | null {
  const counts = new Map<Rank, number>();
  for (const c of hand) counts.set(std(c).rank, (counts.get(std(c).rank) ?? 0) + 1);
  const top = std(retourne).rank;
  for (const [rank, n] of counts) if (n === 3) return { kind: rank === top ? "carre" : "natural", rank };
  if (favori && counts.get(top) === 2) return { kind: "favori", rank: top };
  return null;
}

const KIND_ORDER: Record<Brelan["kind"], number> = { carre: 3, natural: 2, favori: 1 };
export const compareBrelans = (a: Brelan, b: Brelan) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.rank - b.rank;

/** Every suit's points across these cards. */
export function suitTotals(cards: readonly Card[]): Record<Suit, number> {
  const out = { S: 0, H: 0, D: 0, C: 0 } as Record<Suit, number>;
  for (const c of cards) out[std(c).suit] += pointValue(std(c).rank);
  return out;
}

/** Suits from the most points down; a tie goes to the suit holding the higher card. */
export function suitsByPoints(totals: Record<Suit, number>, cards: readonly Card[]): Suit[] {
  const best = (suit: Suit) => Math.max(0, ...cards.filter((c) => std(c).suit === suit).map((c) => std(c).rank));
  return [...SUITS].sort((a, b) => totals[b] - totals[a] || best(b) - best(a));
}

/** Le Point: the top suit someone in contention holds, and their highest card in it. */
export function pointWinner(hands: Record<string, readonly Card[]>, contenders: readonly string[], order: readonly Suit[]) {
  for (const suit of order) {
    let best: { id: string; card: StandardCard } | null = null;
    for (const id of contenders) {
      for (const c of hands[id] ?? []) {
        const s = std(c);
        if (s.suit === suit && (!best || s.rank > best.card.rank)) best = { id, card: s };
      }
    }
    if (best) return { winnerId: best.id, suit, cardId: best.card.id };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Seats and turns
// ---------------------------------------------------------------------------

const byId = (s: BouillotteState, id: string) => s.players.find((p) => p.id === id)!;
const dealtIn = (s: BouillotteState) => s.players.filter((p) => p.inHand);

/** The next player round the table after `id` (clockwise) who matches. */
function nextAfter(s: BouillotteState, id: string, ok: (p: BouillottePlayer) => boolean) {
  const n = s.players.length;
  const at = s.players.findIndex((p) => p.id === id);
  for (let k = 1; k <= n; k++) {
    const p = s.players[(at + k) % n];
    if (ok(p)) return p;
  }
  return null;
}

/** The player to the dealer's right: the one before them round the table. */
function rightOf(s: BouillotteState, id: string) {
  const n = s.players.length;
  const at = s.players.findIndex((p) => p.id === id);
  for (let k = 1; k <= n; k++) {
    const p = s.players[(at - k + n) % n];
    if (p.inHand) return p;
  }
  return null;
}

const canAct = (p: BouillottePlayer) => p.inHand && !p.folded && !p.allIn;
const needsToAct = (s: BouillotteState) => (p: BouillottePlayer) => canAct(p) && (!p.acted || p.bet < s.currentBet);
const potTotal = (s: BouillotteState) => s.players.reduce((n, p) => n + p.ante + p.bet, 0);

/** Put chips in: up to what they have. */
function pay(p: BouillottePlayer, amount: number, into: "ante" | "bet") {
  const paid = Math.min(amount, p.chips);
  p.chips -= paid;
  p[into] += paid;
  if (p.chips === 0) p.allIn = true;
  return paid;
}

// ---------------------------------------------------------------------------
// A hand
// ---------------------------------------------------------------------------

function startHand(s: BouillotteState): BouillotteState {
  for (const p of s.players) {
    Object.assign(p, { inHand: p.status === "active", hand: [], folded: false, allIn: false, ante: 0, bet: 0, acted: false, mayRaise: true });
  }
  s.handNumber += 1;
  s.result = null;
  s.lastActions = {};
  s.retourne = null;
  s.stub = [];
  s.currentBet = 0;
  s.carrePosted = false;
  // The deal moves one seat round each hand.
  const first = s.players.find((p) => p.inHand)!;
  const dealer = s.dealerId ? (nextAfter(s, s.dealerId, (p) => p.inHand) ?? first) : first;
  s.dealerId = dealer.id;

  const { ante, anteBy } = s.settings;
  if (anteBy === "dealer") pay(dealer, ante * dealtIn(s).length, "ante");
  else for (const p of dealtIn(s)) pay(p, ante, "ante");
  for (const p of dealtIn(s)) if (p.ante > 0) s.lastActions[p.id] = { move: "ante", amount: p.ante };
  s.minRaise = Math.max(1, ante);

  const carre = rightOf(s, dealer.id);
  if (s.settings.allowCarre && carre && !carre.allIn) {
    s.phase = "carre";
    s.carreSeatId = carre.id;
    s.currentTurnId = carre.id;
    return s;
  }
  s.carreSeatId = null;
  return deal(s);
}

function deal(s: BouillotteState): BouillotteState {
  const players = dealtIn(s);
  const { result, rngState } = shuffle(deckFor(players.length), s.rngState);
  s.rngState = rngState;
  const deck = [...result];
  for (let round = 0; round < HAND_SIZE; round++) for (const p of players) p.hand.push(deck.shift()!);
  s.retourne = deck.shift()!;
  s.stub = deck;
  s.phase = "betting";

  // The carré acts last; otherwise the player left of the dealer starts.
  const from = s.carrePosted ? s.carreSeatId! : s.dealerId!;
  const opener = nextAfter(s, from, canAct);
  if (!opener || players.filter(canAct).length < 2) return showdown(s);
  s.currentTurnId = opener.id;
  return s;
}

/** After a move: the next player who still has to act, or the end of the betting. */
function advance(s: BouillotteState, fromId: string): BouillotteState {
  const live = s.players.filter((p) => p.inHand && !p.folded);
  if (live.length === 1) return settle(s, live.map((p) => p.id), "fold");
  const next = nextAfter(s, fromId, needsToAct(s));
  if (next) {
    s.currentTurnId = next.id;
    return s;
  }
  return showdown(s);
}

function showdown(s: BouillotteState): BouillotteState {
  const live = s.players.filter((p) => p.inHand && !p.folded).map((p) => p.id);
  return settle(s, live, live.length === 1 ? "fold" : "showdown");
}

/** Share out the pots (side pots by what each put in; antes go to the main pot), pay the brélan bonus, and move on. */
function settle(s: BouillotteState, live: string[], how: "fold" | "showdown"): BouillotteState {
  const dealt = dealtIn(s);
  const ret = s.retourne!;
  const won: Record<string, number> = {};
  const give = (id: string, n: number) => {
    byId(s, id).chips += n;
    won[id] = (won[id] ?? 0) + n;
  };

  // Equal antes are layered with the bets; the dealer's ante for the table is dead money in the main pot.
  const equalAntes = s.settings.anteBy === "everyone";
  const { pots, refunds } = buildPots(dealt.map((p) => ({ id: p.id, amount: p.bet + (equalAntes ? p.ante : 0), folded: p.folded })));
  for (const [id, n] of Object.entries(refunds)) byId(s, id).chips += n;
  if (!equalAntes) {
    const dead = dealt.reduce((n, p) => n + p.ante, 0);
    if (pots.length) pots[0].amount += dead;
    else pots.push({ amount: dead, eligibleIds: live });
    const dealer = s.dealerId!;
    if (live.includes(dealer) && !pots[0].eligibleIds.includes(dealer)) pots[0].eligibleIds.push(dealer);
  }

  const hands = Object.fromEntries(dealt.map((p) => [p.id, p.hand]));
  const brelans: Record<string, Brelan> = {};
  if (how === "showdown") {
    for (const id of live) {
      const b = brelanOf(hands[id], ret, s.settings.brelanFavori);
      if (b) brelans[id] = b;
    }
  }
  const allCards = [...dealt.flatMap((p) => p.hand), ret];
  const totals = suitTotals(allCards);
  const order = suitsByPoints(totals, allCards);

  const results: BouillottePotResult[] = [];
  for (const pot of pots) {
    const eligible = pot.eligibleIds.length ? pot.eligibleIds : live;
    if (how === "fold" || eligible.length === 1) {
      results.push({ amount: pot.amount, winnerId: eligible[0], by: "fold" });
      continue;
    }
    const withBrelan = eligible.filter((id) => brelans[id]).sort((a, b) => compareBrelans(brelans[b], brelans[a]));
    if (withBrelan.length) {
      results.push({ amount: pot.amount, winnerId: withBrelan[0], by: "brelan" });
      continue;
    }
    const point = pointWinner(hands, eligible, order)!;
    results.push({ amount: pot.amount, winnerId: point.winnerId, by: "point", suit: point.suit, cardId: point.cardId });
  }
  for (const r of results) give(r.winnerId, r.amount);

  // A brélan that takes the main pot is paid a bonus by everyone else dealt in, folded or not.
  let bonus: BouillotteResult["bonus"] = null;
  const main = results[0];
  if (main?.by === "brelan") {
    const each = brelans[main.winnerId].kind === "carre" ? CARRE_BONUS : BRELAN_BONUS;
    let total = 0;
    for (const p of dealt) {
      if (p.id === main.winnerId) continue;
      const paid = Math.min(each, p.chips);
      p.chips -= paid;
      total += paid;
    }
    give(main.winnerId, total);
    bonus = { to: main.winnerId, each, total };
  }

  const pointCounted = results.some((r) => r.by === "point");
  const revealed: Record<string, Card[]> = {};
  if (how === "showdown") for (const p of dealt) if (pointCounted || live.includes(p.id)) revealed[p.id] = p.hand;

  s.result = { handNumber: s.handNumber, pots: results, won, revealed, brelans, bonus, totals: pointCounted ? totals : null };
  s.currentTurnId = null;
  for (const p of s.players) if (p.chips === 0) p.status = "busted";
  const left = s.players.filter((p) => p.status === "active");
  if (left.length <= 1) {
    s.phase = "game_over";
    s.winnerId = left[0]?.id ?? main.winnerId;
  } else s.phase = "hand_over";
  return s;
}

function bet(state: BouillotteState, playerId: string, move: "check" | "call" | "raise" | "all_in" | "fold", to = 0): Result {
  if (state.phase !== "betting") return fail(state, "There's no betting right now");
  if (state.currentTurnId !== playerId) return fail(state, "It's not your turn");
  const s = structuredClone(state);
  const p = byId(s, playerId);
  const toCall = s.currentBet - p.bet;
  let shown: BouillotteMove = move === "check" ? "pass" : move;

  switch (move) {
    case "check":
      if (toCall > 0) return fail(state, "There's a bet to call");
      break;
    case "fold":
      p.folded = true;
      break;
    case "call":
      if (toCall <= 0) return fail(state, "There's nothing to call");
      pay(p, toCall, "bet");
      shown = p.allIn ? "all_in" : "call";
      break;
    case "raise":
    case "all_in": {
      if (move === "raise" && !Number.isInteger(to)) return fail(state, "Pick an amount");
      const target = move === "all_in" ? p.bet + p.chips : to;
      if (target <= s.currentBet) {
        if (move === "raise") return fail(state, s.currentBet ? "Raise above the bet" : "Open for at least one chip");
        pay(p, target - p.bet, "bet");
        break;
      }
      if (!p.mayRaise) return fail(state, "You can only call or fold");
      const increase = target - s.currentBet;
      const allIn = target - p.bet >= p.chips;
      if (target - p.bet > p.chips) return fail(state, "You don't have that many chips");
      if (increase < s.minRaise && !allIn) return fail(state, `Raise by at least ${s.minRaise}`);
      pay(p, target - p.bet, "bet");
      shown = allIn ? "all_in" : s.currentBet === 0 ? "open" : "raise";
      // A full raise (or any opening bet) reopens the betting for everyone; a short all-in only
      // asks them to call, so whoever already acted can't raise again.
      const full = increase >= s.minRaise || s.currentBet === 0;
      if (increase >= s.minRaise) s.minRaise = increase;
      for (const q of s.players) {
        if (q.id === p.id || !canAct(q)) continue;
        q.mayRaise = full || (q.mayRaise && !q.acted);
        q.acted = false;
      }
      s.currentBet = target;
      break;
    }
  }
  p.acted = true;
  p.mayRaise = false;
  s.lastActions[p.id] = { move: shown, ...(p.bet > 0 && move !== "fold" && move !== "check" ? { amount: p.bet } : {}) };
  return succeed(advance(s, playerId));
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export function applyBouillotteAction(state: BouillotteState, action: BouillotteAction): Result {
  switch (action.type) {
    case "JOIN_ROOM": {
      if (state.phase !== "lobby") return fail(state, "Game already in progress");
      if (state.players.length >= BOUILLOTTE_MAX_PLAYERS) return fail(state, `Room is full (max ${BOUILLOTTE_MAX_PLAYERS})`);
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
      return succeed({ ...state, settings: sanitizeBouillotteSettings({ ...state.settings, ...action.settings }) });
    }
    case "START_GAME": {
      if (state.phase !== "lobby") return fail(state, "Game already started");
      if (action.playerId !== state.hostId) return fail(state, "Only the host can start the game");
      if (state.players.length < BOUILLOTTE_MIN_PLAYERS) return fail(state, "Bouillotte needs three players");
      const s = structuredClone(resetToLobby(state));
      const [, rng] = nextRandom(seedRng(action.seed));
      s.rngState = rng;
      for (const p of s.players) p.chips = s.settings.startingChips;
      return succeed(startHand(s));
    }
    case "CARRE": {
      if (state.phase !== "carre") return fail(state, "There's no carré to post");
      if (action.playerId !== state.carreSeatId) return fail(state, "It's not your carré");
      const s = structuredClone(state);
      if (action.post) {
        const p = byId(s, action.playerId);
        // Blind, before the deal: as much as the antes in the pot.
        const size = Math.max(1, potTotal(s));
        pay(p, size, "bet");
        s.currentBet = p.bet;
        s.minRaise = Math.max(s.minRaise, p.bet);
        s.carrePosted = true;
        s.lastActions[p.id] = { move: "carre", amount: p.bet };
      }
      return succeed(deal(s));
    }
    case "CHECK":
      return bet(state, action.playerId, "check");
    case "CALL":
      return bet(state, action.playerId, "call");
    case "RAISE":
      return bet(state, action.playerId, "raise", action.to);
    case "ALL_IN":
      return bet(state, action.playerId, "all_in");
    case "FOLD":
      return bet(state, action.playerId, "fold");
    case "NEXT_HAND": {
      if (action.playerId !== state.hostId) return fail(state, "Only the host can deal");
      if (state.phase !== "hand_over") return fail(state, "The hand isn't over");
      return succeed(startHand(structuredClone(state)));
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

export interface BouillottePublicPlayer extends Omit<BouillottePlayer, "hand"> {
  /** Your own cards, or anyone's turned up at a showdown; null when face down. */
  hand: Card[] | null;
}

export interface BouillotteView extends Omit<BouillotteState, "rngState" | "stub" | "players"> {
  viewerId: string | null;
  godMode: boolean;
  players: BouillottePublicPlayer[];
  stubCount: number;
  pot: number;
}

/** What one player (or spectator) sees: their own hand, and other hands only once they're turned up. */
export function getBouillotteView(state: BouillotteState, viewer: ViewerId): BouillotteView {
  const godMode = viewer === GOD_VIEW;
  const { rngState: _r, stub, players, ...rest } = state;
  void _r;
  const shown = state.result?.revealed ?? {};
  return {
    ...rest,
    viewerId: godMode ? null : viewer,
    godMode,
    players: players.map((p) => ({ ...p, hand: godMode || p.id === viewer || shown[p.id] ? p.hand : null })),
    stubCount: stub.length,
    pot: potTotal(state),
  };
}

export interface BouillotteLegal {
  isMyTurn: boolean;
  /** Your carré to post or skip, blind. */
  carre: { amount: number } | null;
  canCheck: boolean;
  callAmount: number;
  callIsAllIn: boolean;
  canRaise: boolean;
  /** Nothing has been bet: a raise opens. */
  isOpening: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
}

export function getBouillotteLegal(view: BouillotteView, playerId: string | null): BouillotteLegal {
  const none: BouillotteLegal = { isMyTurn: false, carre: null, canCheck: false, callAmount: 0, callIsAllIn: false, canRaise: false, isOpening: false, minRaiseTo: 0, maxRaiseTo: 0 };
  const p = view.players.find((x) => x.id === playerId);
  if (!p || view.currentTurnId !== playerId) return none;
  if (view.phase === "carre") return { ...none, isMyTurn: true, carre: { amount: Math.min(p.chips, Math.max(1, view.pot)) } };
  if (view.phase !== "betting") return none;
  const toCall = view.currentBet - p.bet;
  const maxRaiseTo = p.bet + p.chips;
  return {
    ...none,
    isMyTurn: true,
    canCheck: toCall <= 0,
    callAmount: Math.min(toCall, p.chips),
    callIsAllIn: toCall >= p.chips && toCall > 0,
    canRaise: p.mayRaise && maxRaiseTo > view.currentBet,
    isOpening: view.currentBet === 0,
    minRaiseTo: Math.min(maxRaiseTo, view.currentBet + view.minRaise),
    maxRaiseTo,
  };
}

/** Bouillotte as a game the online room can host. */
export const bouillotteGame: GameDefinition<BouillotteState, BouillotteAction, BouillotteView> = {
  applyAction: applyBouillotteAction,
  getPlayerView: getBouillotteView,
  join: (player) => ({ type: "JOIN_ROOM", player }),
  leave: (playerId) => ({ type: "LEAVE_ROOM", playerId }),
  maxPlayers: BOUILLOTTE_MAX_PLAYERS,
};
