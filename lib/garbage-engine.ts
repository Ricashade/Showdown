/**
 * Garbage (also called Trash) as pure state transitions, run by the host (online) or the
 * local simulator. Each action works on a copy of the state and returns the new one.
 *
 * Everyone has a row of face-down slots, Ace to 10. Play a card into its own slot, pick up the
 * card that was there, and keep going until you hold one you can't use. Clear your board and
 * you get one fewer slot next round; the first to clear a one-slot board wins.
 */
import type { Card } from "@/types/cards";
import type { ActionResult, PlayerSeed } from "@/types/game";
import type {
  FaceCard,
  FaceCardPreset,
  FaceRole,
  GarbageAction,
  GarbagePlayer,
  GarbageSettings,
  GarbageSlot,
  GarbageState,
} from "@/types/garbage";
import { createDeck, nextRandom, shuffle } from "./cards";
import type { GameDefinition } from "./multiplayer/room";

export const GARBAGE_MIN_PLAYERS = 2;
export const GARBAGE_MAX_PLAYERS = 6;
export const STARTING_SLOTS = 10;

export const FACE_PRESETS: Record<Exclude<FaceCardPreset, "custom">, Record<FaceCard, FaceRole>> = {
  "queens-kings": { J: "dead", Q: "wild", K: "wild" },
  jacks: { J: "wild", Q: "dead", K: "dead" },
};

export const GARBAGE_DEFAULTS: GarbageSettings = {
  faceCardPreset: "queens-kings",
  faceCards: FACE_PRESETS["queens-kings"],
  lastTurn: true,
};

type Result = ActionResult<GarbageState>;
const fail = (state: GarbageState, error: string): Result => ({ ok: false, error, state });
const succeed = (state: GarbageState): Result => ({ ok: true, state: { ...state, version: state.version + 1 } });

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

const FACE: Record<number, FaceCard> = { 11: "J", 12: "Q", 13: "K" };

/** What a card does: the slot number it belongs in (Ace = 1), a wild, or garbage. */
export function cardRole(card: Card, faceCards: Record<FaceCard, FaceRole>): number | FaceRole {
  if (card.kind === "joker") return "dead";
  if (card.rank === 14) return 1;
  if (card.rank <= 10) return card.rank;
  return faceCards[FACE[card.rank]];
}

export const isWildCard = (card: Card, faceCards: Record<FaceCard, FaceRole>) => cardRole(card, faceCards) === "wild";

/** Slot label: A, 2 … 10. */
export const slotLabel = (i: number) => (i === 0 ? "A" : String(i + 1));

/**
 * Slots (0-based) this card can go into on this board. A wild fills any face-down slot; a
 * number goes in its own slot if that's still face down or only holds a wild.
 */
export function legalSlots(slots: readonly Pick<GarbagePublicSlot, "faceDown" | "shown">[], card: Card, faceCards: Record<FaceCard, FaceRole>): number[] {
  const role = cardRole(card, faceCards);
  if (role === "dead") return [];
  if (role === "wild") return slots.flatMap((slot, i) => (slot.faceDown ? [i] : []));
  const slot = slots[role - 1];
  if (!slot) return [];
  return slot.faceDown || (slot.shown && isWildCard(slot.shown, faceCards)) ? [role - 1] : [];
}

/** A slot as everyone sees it: face down, or showing the card placed there. */
export interface GarbagePublicSlot {
  faceDown: boolean;
  shown: Card | null;
  /** Turned over at the end of the round; swappable while rearranging. */
  revealed: Card | null;
}

const publicSlots = (slots: GarbageSlot[]): GarbagePublicSlot[] => slots.map((slot) => ({ faceDown: slot.hidden !== null, shown: slot.shown, revealed: slot.revealed }));

/** Decks in play: one for two players, two for three or more so the draw pile lasts. */
export const decksFor = (players: number) => (players >= 3 ? 2 : 1);

function freshDeck(decks: number): Card[] {
  const out: Card[] = [];
  for (let d = 0; d < decks; d++) for (const c of createDeck(false)) out.push({ ...c, id: `${c.id}.${d}` });
  return out;
}

/** Top of the draw pile. An empty pile is rebuilt from the discards, all but the top card. */
function drawFromStock(s: GarbageState): Card | null {
  if (s.stock.length === 0 && s.discard.length > 1) {
    const top = s.discard.pop()!;
    const { result, rngState } = shuffle(s.discard, s.rngState);
    s.stock = result;
    s.rngState = rngState;
    s.discard = [top];
  }
  return s.stock.shift() ?? null;
}

// ---------------------------------------------------------------------------
// Settings & seats
// ---------------------------------------------------------------------------

export function sanitizeGarbageSettings(s: Partial<GarbageSettings>): GarbageSettings {
  const preset: FaceCardPreset = s.faceCardPreset === "jacks" || s.faceCardPreset === "custom" ? s.faceCardPreset : "queens-kings";
  const role = (v: unknown, fallback: FaceRole): FaceRole => (v === "wild" || v === "dead" ? v : fallback);
  const base = GARBAGE_DEFAULTS.faceCards;
  const faceCards =
    preset === "custom"
      ? { J: role(s.faceCards?.J, base.J), Q: role(s.faceCards?.Q, base.Q), K: role(s.faceCards?.K, base.K) }
      : { ...FACE_PRESETS[preset] };
  return { faceCardPreset: preset, faceCards, lastTurn: s.lastTurn ?? GARBAGE_DEFAULTS.lastTurn };
}

function seat(seed: PlayerSeed, isHost: boolean): GarbagePlayer {
  return {
    id: seed.id,
    name: seed.name.trim() || "Player",
    isBot: !!seed.isBot,
    ...(seed.botDifficulty ? { botDifficulty: seed.botDifficulty } : {}),
    isHost,
    target: STARTING_SLOTS,
    slots: [],
    finished: false,
    revealDone: false,
  };
}

export function createGarbageRoom(params: { roomId: string; host: PlayerSeed; settings?: Partial<GarbageSettings> }): GarbageState {
  return {
    mode: "garbage",
    roomId: params.roomId,
    version: 0,
    phase: "lobby",
    settings: sanitizeGarbageSettings({ ...GARBAGE_DEFAULTS, ...params.settings }),
    players: [seat(params.host, true)],
    hostId: params.host.id,
    rngState: 0,
    stock: [],
    discard: [],
    round: 0,
    starterId: null,
    currentTurnId: null,
    active: null,
    activeFrom: null,
    lastLap: null,
    result: null,
    winnerId: null,
  };
}

function resetToLobby(s: GarbageState): GarbageState {
  const fresh = createGarbageRoom({ roomId: s.roomId, host: { id: s.hostId, name: "" }, settings: s.settings });
  return { ...fresh, version: s.version, players: s.players.map((p) => ({ ...seat(p, p.id === s.hostId), name: p.name })) };
}

const getPlayer = (s: GarbageState, id: string | null | undefined) => s.players.find((p) => p.id === id);

function nextAfter(s: GarbageState, id: string): GarbagePlayer {
  const i = s.players.findIndex((p) => p.id === id);
  return s.players[(i + 1) % s.players.length];
}

// ---------------------------------------------------------------------------
// Round flow
// ---------------------------------------------------------------------------

function dealRound(s: GarbageState, starterId: string): GarbageState {
  s.round += 1;
  const { result, rngState } = shuffle(freshDeck(decksFor(s.players.length)), s.rngState);
  s.rngState = rngState;
  s.stock = result;
  for (const p of s.players) {
    p.finished = false;
    p.revealDone = false;
    p.slots = s.stock.splice(0, p.target).map((hidden) => ({ hidden, shown: null, revealed: null }));
  }
  // One card face up starts the discard pile.
  s.discard = [s.stock.shift()!];
  s.phase = "playing";
  s.starterId = starterId;
  s.currentTurnId = starterId;
  s.active = null;
  s.activeFrom = null;
  s.lastLap = null;
  s.result = null;
  return s;
}

const boardDone = (p: GarbagePlayer) => p.slots.every((slot) => slot.hidden === null);

/** The card in hand goes on the discard pile and play moves on (or the round ends). */
function endTurn(s: GarbageState): GarbageState {
  const p = getPlayer(s, s.currentTurnId)!;
  if (s.active) s.discard.push(s.active);
  s.active = null;
  s.activeFrom = null;

  if (p.finished && p.target === 1) {
    s.phase = "game_over";
    s.winnerId = p.id;
    s.currentTurnId = null;
    s.result = { round: s.round, finisherIds: [p.id], revealClearIds: [], nextTargets: Object.fromEntries(s.players.map((x) => [x.id, x.target])) };
    return s;
  }

  if (s.lastLap) {
    s.lastLap = s.lastLap.filter((id) => id !== p.id);
  } else if (p.finished) {
    if (!s.settings.lastTurn) return endRound(s);
    // Everyone else, in turn order, gets one more go.
    const order: string[] = [];
    for (let q = nextAfter(s, p.id); q.id !== p.id; q = nextAfter(s, q.id)) order.push(q.id);
    s.lastLap = order;
  }

  if (s.lastLap) {
    if (s.lastLap.length === 0) return startReveal(s);
    s.currentTurnId = s.lastLap[0];
    return s;
  }
  s.currentTurnId = nextAfter(s, p.id).id;
  return s;
}

/** After the last lap: everyone still playing turns their face-down cards over. */
function startReveal(s: GarbageState): GarbageState {
  s.currentTurnId = null;
  s.lastLap = null;
  for (const p of s.players) {
    p.revealDone = p.finished;
    for (const slot of p.slots) {
      if (slot.hidden) {
        slot.revealed = slot.hidden;
        slot.hidden = null;
      }
    }
  }
  if (s.players.every((p) => p.revealDone)) return endRound(s, []);
  s.phase = "reveal";
  return s;
}

/** Does this card belong in slot `i`: its own number, or a wild? */
export const fitsSlot = (card: Card, i: number, faceCards: Record<FaceCard, FaceRole>) => {
  const role = cardRole(card, faceCards);
  return role === "wild" || role === i + 1;
};

/** Every revealed card is in a slot it fits: the board is full. */
export const revealComplete = (slots: readonly { revealed: Card | null }[], faceCards: Record<FaceCard, FaceRole>) =>
  slots.some((slot) => slot.revealed) && slots.every((slot, i) => !slot.revealed || fitsSlot(slot.revealed, i, faceCards));

/**
 * The best way to lay out revealed cards: each number in its own slot (one copy), wilds in the
 * gaps, garbage wherever's left. Returns the card id for each revealed slot.
 */
export function bestArrangement(slots: readonly { revealed: Card | null }[], faceCards: Record<FaceCard, FaceRole>): (string | null)[] {
  const open = slots.flatMap((slot, i) => (slot.revealed ? [i] : []));
  const pool = open.map((i) => slots[i].revealed!);
  const out: (string | null)[] = slots.map(() => null);
  const used = new Set<string>();
  for (const i of open) {
    const own = pool.find((c) => !used.has(c.id) && cardRole(c, faceCards) === i + 1);
    if (own) {
      out[i] = own.id;
      used.add(own.id);
    }
  }
  const rest = [...pool.filter((c) => !used.has(c.id) && cardRole(c, faceCards) === "wild"), ...pool.filter((c) => !used.has(c.id) && cardRole(c, faceCards) !== "wild")];
  for (const i of open) if (!out[i]) out[i] = rest.shift()?.id ?? null;
  return out;
}

function finishReveal(s: GarbageState): GarbageState {
  const cleared = s.players.filter((p) => !p.finished && revealComplete(p.slots, s.settings.faceCards));
  for (const p of cleared) p.finished = true;
  // Clearing a one-card board this way wins it too.
  const winner = cleared.find((p) => p.target === 1);
  if (winner) {
    s.phase = "game_over";
    s.winnerId = winner.id;
    s.result = { round: s.round, finisherIds: s.players.filter((p) => p.finished).map((p) => p.id), revealClearIds: cleared.map((p) => p.id), nextTargets: Object.fromEntries(s.players.map((x) => [x.id, x.target])) };
    return s;
  }
  return endRound(s, cleared.map((p) => p.id));
}

function endRound(s: GarbageState, revealClearIds: string[] = []): GarbageState {
  const finisherIds = s.players.filter((p) => p.finished).map((p) => p.id);
  for (const p of s.players) if (p.finished) p.target -= 1;
  s.result = { round: s.round, finisherIds, revealClearIds, nextTargets: Object.fromEntries(s.players.map((p) => [p.id, p.target])) };
  s.phase = "round_over";
  s.currentTurnId = null;
  s.lastLap = null;
  return s;
}

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

function myTurn(state: GarbageState, playerId: string): string | null {
  if (state.phase !== "playing") return "There's no round being played";
  if (state.currentTurnId !== playerId) return "It's not your turn";
  return null;
}

function draw(state: GarbageState, playerId: string, source: "stock" | "discard"): Result {
  const err = myTurn(state, playerId);
  if (err) return fail(state, err);
  if (state.active) return fail(state, "Play the card in your hand first");
  const s = structuredClone(state);
  const p = getPlayer(s, playerId)!;
  if (source === "discard") {
    const top = s.discard[s.discard.length - 1];
    if (!top) return fail(state, "The discard pile is empty");
    if (legalSlots(publicSlots(p.slots), top, s.settings.faceCards).length === 0) return fail(state, "You can only take a card you can play");
    s.active = s.discard.pop()!;
  } else {
    const card = drawFromStock(s);
    if (!card) return fail(state, "There are no cards left to draw");
    s.active = card;
  }
  s.activeFrom = { source };
  return succeed(s);
}

function place(state: GarbageState, playerId: string, slot: number): Result {
  const err = myTurn(state, playerId);
  if (err) return fail(state, err);
  if (!state.active) return fail(state, "Draw a card first");
  const me = getPlayer(state, playerId)!;
  if (!legalSlots(publicSlots(me.slots), state.active, state.settings.faceCards).includes(slot)) return fail(state, "That card can't go there");
  const s = structuredClone(state);
  const p = getPlayer(s, playerId)!;
  const target = p.slots[slot];
  // Whatever was there comes into your hand: the face-down card, or the wild you just replaced.
  const pickedUp = target.hidden ?? target.shown!;
  target.shown = s.active;
  target.hidden = null;
  s.active = pickedUp;
  s.activeFrom = { source: "slot", slot };
  if (boardDone(p)) {
    p.finished = true;
    return succeed(endTurn(s));
  }
  return succeed(s);
}

function discard(state: GarbageState, playerId: string): Result {
  const err = myTurn(state, playerId);
  if (err) return fail(state, err);
  if (!state.active) return fail(state, "Draw a card first");
  const me = getPlayer(state, playerId)!;
  if (legalSlots(publicSlots(me.slots), state.active, state.settings.faceCards).length > 0) return fail(state, "That card can still be played");
  return succeed(endTurn(structuredClone(state)));
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export function applyGarbageAction(state: GarbageState, action: GarbageAction): Result {
  switch (action.type) {
    case "JOIN_ROOM": {
      if (state.phase !== "lobby") return fail(state, "Game already in progress");
      if (state.players.length >= GARBAGE_MAX_PLAYERS) return fail(state, `Room is full (max ${GARBAGE_MAX_PLAYERS})`);
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
      const patch = action.settings;
      return succeed({
        ...state,
        settings: sanitizeGarbageSettings({ ...state.settings, ...patch, faceCards: { ...state.settings.faceCards, ...patch.faceCards } }),
      });
    }
    case "START_GAME": {
      if (state.phase !== "lobby") return fail(state, "Game already started");
      if (action.playerId !== state.hostId) return fail(state, "Only the host can start the game");
      if (state.players.length < GARBAGE_MIN_PLAYERS) return fail(state, `Need at least ${GARBAGE_MIN_PLAYERS} players`);
      const [r, rngState] = nextRandom(action.seed >>> 0);
      const s = structuredClone(resetToLobby(state));
      s.rngState = rngState;
      return succeed(dealRound(s, s.players[Math.floor(r * s.players.length)].id));
    }
    case "DRAW":
      return draw(state, action.playerId, action.source);
    case "PLACE":
      return place(state, action.playerId, action.slot);
    case "DISCARD":
      return discard(state, action.playerId);
    case "SWAP_REVEALED": {
      if (state.phase !== "reveal") return fail(state, "There's nothing to rearrange right now");
      const me = getPlayer(state, action.playerId);
      if (!me || me.revealDone) return fail(state, "You're done rearranging");
      const { from, to } = action;
      if (!me.slots[from]?.revealed || !me.slots[to]?.revealed || from === to) return fail(state, "Swap two of your turned-over cards");
      const s = structuredClone(state);
      const slots = getPlayer(s, me.id)!.slots;
      [slots[from].revealed, slots[to].revealed] = [slots[to].revealed, slots[from].revealed];
      return succeed(s);
    }
    case "REVEAL_DONE": {
      if (state.phase !== "reveal") return fail(state, "There's nothing to rearrange right now");
      const me = getPlayer(state, action.playerId);
      if (!me || me.revealDone) return fail(state, "You're already done");
      const s = structuredClone(state);
      getPlayer(s, me.id)!.revealDone = true;
      return succeed(s.players.every((p) => p.revealDone) ? finishReveal(s) : s);
    }
    case "FINISH_REVEAL": {
      if (state.phase !== "reveal") return fail(state, "There's nothing to rearrange right now");
      if (action.playerId !== state.hostId) return fail(state, "Only the host can end the round");
      return succeed(finishReveal(structuredClone(state)));
    }
    case "NEXT_ROUND": {
      if (state.phase !== "round_over") return fail(state, "The round isn't over yet");
      if (action.playerId !== state.hostId) return fail(state, "Only the host can deal the next round");
      const s = structuredClone(state);
      return succeed(dealRound(s, nextAfter(s, s.starterId!).id));
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

export interface GarbagePublicPlayer extends Omit<GarbagePlayer, "slots"> {
  slots: GarbagePublicSlot[];
}

export interface GarbageView extends Omit<GarbageState, "players" | "rngState" | "stock"> {
  viewerId: string | null;
  godMode: boolean;
  players: GarbagePublicPlayer[];
  stockCount: number;
}

/** What one player may see. Face-down slots stay face down for everyone, the owner included. */
export function getGarbageView(state: GarbageState, viewer: string | "god"): GarbageView {
  const { rngState: _r, stock, players, ...rest } = state;
  void _r;
  return {
    ...rest,
    viewerId: viewer === "god" ? null : viewer,
    godMode: viewer === "god",
    stockCount: stock.length,
    players: players.map((p) => ({ ...p, slots: publicSlots(p.slots) })),
  };
}

export interface GarbageLegal {
  isMyTurn: boolean;
  /** Your turn and nothing in hand: draw. */
  mustDraw: boolean;
  canTakeDiscard: boolean;
  /** Slots the card in hand can go into. */
  slots: number[];
  /** The card in hand can't be played anywhere: throw it away. */
  mustDiscard: boolean;
  /** End of round: you may swap your revealed cards. */
  canRearrange: boolean;
}

export function getGarbageLegal(view: GarbageView, playerId: string | null): GarbageLegal {
  const none: GarbageLegal = { isMyTurn: false, mustDraw: false, canTakeDiscard: false, slots: [], mustDiscard: false, canRearrange: false };
  const me = view.players.find((p) => p.id === playerId);
  if (me && view.phase === "reveal") return { ...none, canRearrange: !me.revealDone };
  if (!me || view.phase !== "playing" || view.currentTurnId !== me.id) return none;
  const faceCards = view.settings.faceCards;
  if (!view.active) {
    const top = view.discard[view.discard.length - 1];
    return { ...none, isMyTurn: true, mustDraw: true, canTakeDiscard: !!top && legalSlots(me.slots, top, faceCards).length > 0 };
  }
  const slots = legalSlots(me.slots, view.active, faceCards);
  return { ...none, isMyTurn: true, slots, mustDiscard: slots.length === 0 };
}

/** Garbage as a game the online room can host. */
export const garbageGame: GameDefinition<GarbageState, GarbageAction, GarbageView> = {
  applyAction: applyGarbageAction,
  getPlayerView: getGarbageView,
  join: (player) => ({ type: "JOIN_ROOM", player }),
  leave: (playerId) => ({ type: "LEAVE_ROOM", playerId }),
  maxPlayers: GARBAGE_MAX_PLAYERS,
};
