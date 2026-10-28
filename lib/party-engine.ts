/**
 * A room that outlasts any one game. The host runs it like any other game (lib/multiplayer/room.ts);
 * it wraps every game's own reducers, so their rules, views and bots are unchanged.
 *
 * The roster is the room's: people stay in it while the host switches games, and the selected
 * game deals in as many of them as it has seats. Everyone else sits that one out and watches.
 */
import type { ActionResult, GameMode, PlayerSeed } from "@/types/game";
import type { ActiveGameAction, ActiveGameState, PartyAction, PartyPlayer, PartyState, RoomPhase } from "@/types/party";
import type { BlackjackState } from "@/types/blackjack";
import type { GameDefinition, RoomAction, RoomState } from "./multiplayer/room";
import type { BotRunner } from "./bot-ai";
import type { TableClock } from "./hooks/use-table-clock";
import { blackjackBots, bsPokerBots, garbageBots, goFishBots, holdemBots, rummyBots, warBots } from "./bot-ai";
import { bsPokerGame, createRoom, MIN_PLAYERS } from "./bs-poker-game";
import { createHoldemRoom, holdemGame, HOLDEM_MIN_PLAYERS } from "./holdem-game";
import { BLACKJACK_MIN_PLAYERS, blackjackClock, blackjackGame, createBlackjackRoom } from "./blackjack-engine";
import { createGarbageRoom, garbageGame, GARBAGE_MIN_PLAYERS } from "./garbage-engine";
import { createRummyRoom, rummyGame, RUMMY_MIN_PLAYERS } from "./rummy-engine";
import { createWarRoom, warGame, WAR_MIN_PLAYERS } from "./war-engine";
import { createGoFishRoom, goFishGame, GOFISH_MIN_PLAYERS } from "./gofish-engine";
import type { BlackjackView } from "./blackjack-engine";
import type { BsPokerView } from "./bs-poker-game";
import type { GarbageView } from "./garbage-engine";
import type { HoldemView } from "./holdem-game";
import type { RummyView } from "./rummy-engine";
import type { WarView } from "./war-engine";
import type { GoFishView } from "./gofish-engine";
import type { GoFishState } from "@/types/gofish";

/** Hold'em seats the most. */
export const PARTY_MAX_PLAYERS = 9;

export type ActiveGameView = BsPokerView | HoldemView | BlackjackView | GarbageView | RummyView | WarView | GoFishView;

// ---------------------------------------------------------------------------
// The games, as the room drives them
// ---------------------------------------------------------------------------

interface GameKit<S extends RoomState, A extends RoomAction, V> {
  def: GameDefinition<S, A, V>;
  create: (roomId: string, host: PlayerSeed) => S;
  minPlayers: number;
  bots: BotRunner<S, A>;
  clock?: TableClock<S, A>;
  /** Who takes the match. `finished`: it ended on its own; otherwise the host stopped it. */
  winners: (state: S, finished: boolean) => string[];
}

type Kit = GameKit<ActiveGameState, ActiveGameAction, ActiveGameView>;

const winnerOf = (s: { winnerId: string | null }, finished: boolean) => (finished && s.winnerId ? [s.winnerId] : []);

/** Blackjack never ends with a winner (the house takes the last chip), so cashing out counts: most chips, if up on the night. */
function blackjackWinners(s: BlackjackState, finished: boolean) {
  if (finished) return [];
  const best = Math.max(...s.players.map((p) => p.chips));
  if (best <= s.settings.startingChips) return [];
  return s.players.filter((p) => p.chips === best).map((p) => p.id);
}

const defineKit = <S extends RoomState, A extends RoomAction, V>(k: GameKit<S, A, V>) => k;

const kits: Record<GameMode, unknown> = {
  "bs-poker": defineKit({ def: bsPokerGame, create: (roomId, host) => createRoom({ roomId, host }), minPlayers: MIN_PLAYERS, bots: bsPokerBots, winners: winnerOf }),
  "texas-holdem": defineKit({ def: holdemGame, create: (roomId, host) => createHoldemRoom({ roomId, host }), minPlayers: HOLDEM_MIN_PLAYERS, bots: holdemBots, winners: winnerOf }),
  blackjack: defineKit({
    def: blackjackGame,
    create: (roomId, host) => createBlackjackRoom({ roomId, host }),
    minPlayers: BLACKJACK_MIN_PLAYERS,
    bots: blackjackBots,
    clock: blackjackClock,
    winners: blackjackWinners,
  }),
  garbage: defineKit({ def: garbageGame, create: (roomId, host) => createGarbageRoom({ roomId, host }), minPlayers: GARBAGE_MIN_PLAYERS, bots: garbageBots, winners: winnerOf }),
  rummy: defineKit({ def: rummyGame, create: (roomId, host) => createRummyRoom({ roomId, host }), minPlayers: RUMMY_MIN_PLAYERS, bots: rummyBots, winners: winnerOf }),
  war: defineKit({ def: warGame, create: (roomId, host) => createWarRoom({ roomId, host }), minPlayers: WAR_MIN_PLAYERS, bots: warBots, winners: winnerOf }),
  // A tie for most books crowns everyone tied.
  "go-fish": defineKit({
    def: goFishGame,
    create: (roomId, host) => createGoFishRoom({ roomId, host }),
    minPlayers: GOFISH_MIN_PLAYERS,
    bots: goFishBots,
    winners: (s: GoFishState, finished: boolean) => (finished ? s.winnerIds : []),
  }),
};

/** Each kit is typed for its own game; the room only ever hands a game its own state and moves. */
const kit = (id: GameMode) => kits[id] as unknown as Kit;

export const GAME_IDS = Object.keys(kits) as GameMode[];
export const isGameId = (x: unknown): x is GameMode => typeof x === "string" && Object.hasOwn(kits, x);

/** Seats the game has, and how many it needs. */
export const seatsFor = (id: GameMode) => ({ min: kit(id).minPlayers, max: kit(id).def.maxPlayers });

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

type Result = ActionResult<PartyState>;
const fail = (state: PartyState, error: string): Result => ({ ok: false, error, state });
const succeed = (state: PartyState): Result => ({ ok: true, state: { ...state, version: state.version + 1 } });

const member = (seed: PlayerSeed, isHost: boolean, sessionWins = 0): PartyPlayer => ({
  id: seed.id,
  name: seed.name.trim().slice(0, 20) || "Player",
  isBot: !!seed.isBot,
  ...(seed.botDifficulty ? { botDifficulty: seed.botDifficulty } : {}),
  isHost,
  sessionWins,
});

const seedOf = (p: PartyPlayer): PlayerSeed => ({ id: p.id, name: p.name, ...(p.isBot ? { isBot: true } : {}), ...(p.botDifficulty ? { botDifficulty: p.botDifficulty } : {}) });

const phaseOf = (g: ActiveGameState): RoomPhase => (g.phase === "lobby" ? "lobby" : g.phase === "game_over" ? "post_game" : "in_game");

/** A game move that may not apply (a full table, say): keep the game as it was. */
function tryApply(g: ActiveGameState, a: ActiveGameAction) {
  const r = kit(g.mode).def.applyAction(g, a as never);
  return r.ok ? r.state : g;
}

/** In the lobby, the game seats the room in order until it's full, and drops anyone who left. */
function seatLobby(s: PartyState) {
  const { def } = kit(s.selectedGame);
  let g = s.activeGameState;
  const inRoom = new Set(s.players.map((p) => p.id));
  for (const p of g.players) if (!inRoom.has(p.id)) g = tryApply(g, def.leave(p.id));
  for (const p of s.players) {
    if (g.players.length >= def.maxPlayers) break;
    if (!g.players.some((x) => x.id === p.id)) g = tryApply(g, def.join(seedOf(p)));
  }
  s.activeGameState = g;
}

function freshGame(s: PartyState, id: GameMode) {
  const host = s.players.find((p) => p.id === s.hostId)!;
  s.selectedGame = id;
  s.activeGameState = kit(id).create(s.roomCode, seedOf(host));
  s.phase = "lobby";
  s.lastWinnerIds = [];
  seatLobby(s);
}

/** After the game moves on: follow its phase, crown a finished match's winners, reseat in the lobby. */
function settle(s: PartyState, crown: string[] = []) {
  const before = s.phase;
  s.phase = phaseOf(s.activeGameState);
  if (s.phase === "post_game" && before !== "post_game") crown = kit(s.selectedGame).winners(s.activeGameState, true);
  if (crown.length) {
    s.players = s.players.map((p) => (crown.includes(p.id) ? { ...p, sessionWins: p.sessionWins + 1 } : p));
    s.lastWinnerIds = crown;
  }
  if (s.phase === "lobby" && before !== "lobby") seatLobby(s);
}

export function createParty(params: { roomCode: string; host: PlayerSeed; game?: GameMode }): PartyState {
  const s: PartyState = {
    mode: "party",
    roomCode: params.roomCode,
    version: 0,
    hostId: params.host.id,
    phase: "lobby",
    players: [member(params.host, true)],
    selectedGame: "bs-poker",
    activeGameState: null as unknown as ActiveGameState,
    pastWins: {},
    lastWinnerIds: [],
  };
  freshGame(s, isGameId(params.game) ? params.game : "bs-poker");
  return s;
}

const reset = (s: PartyState) => tryApply(s.activeGameState, { type: "RETURN_TO_LOBBY", playerId: s.hostId });

export function applyPartyAction(state: PartyState, action: PartyAction): Result {
  const isHost = "playerId" in action && action.playerId === state.hostId;
  switch (action.type) {
    case "JOIN": {
      const { id } = action.player;
      if (state.players.some((p) => p.id === id)) return fail(state, "Player already in room");
      if (state.players.length >= PARTY_MAX_PLAYERS) return fail(state, `Room is full (max ${PARTY_MAX_PLAYERS})`);
      const s = structuredClone(state);
      s.players.push(member(action.player, false, s.pastWins[id] ?? 0));
      delete s.pastWins[id];
      // Mid-game, newcomers watch and are dealt in next time.
      if (s.phase === "lobby") seatLobby(s);
      return succeed(s);
    }
    case "LEAVE": {
      const leaving = state.players.find((p) => p.id === action.playerId);
      if (!leaving) return fail(state, "Player not in room");
      if (leaving.isHost) return fail(state, "The host can't leave");
      const playing = state.activeGameState.players.some((p) => p.id === leaving.id);
      if (state.phase === "in_game" && playing) return fail(state, "Players can only leave from the lobby");
      const s = structuredClone(state);
      s.players = s.players.filter((p) => p.id !== leaving.id);
      if (leaving.sessionWins > 0) s.pastWins[leaving.id] = leaving.sessionWins;
      if (s.phase === "lobby") seatLobby(s);
      return succeed(s);
    }
    case "SWITCH_GAME": {
      if (!isHost) return fail(state, "Only the host can pick the game");
      if (!isGameId(action.newGameType)) return fail(state, "There's no such game");
      if (state.phase === "in_game") return fail(state, "End the match first");
      const s = structuredClone(state);
      freshGame(s, action.newGameType);
      return succeed(s);
    }
    case "RETURN_TO_LOBBY": {
      if (!isHost) return fail(state, "Only the host can end the match");
      if (state.phase === "lobby") return fail(state, "Already in the lobby");
      const s = structuredClone(state);
      const stopped = s.phase === "in_game" ? kit(s.selectedGame).winners(s.activeGameState, false) : [];
      s.activeGameState = reset(s);
      settle(s, stopped);
      return succeed(s);
    }
    case "PLAY_AGAIN": {
      if (!isHost) return fail(state, "Only the host can deal again");
      if (state.phase !== "post_game") return fail(state, "The match isn't over");
      const s = structuredClone(state);
      s.activeGameState = reset(s);
      settle(s);
      const r = kit(s.selectedGame).def.applyAction(s.activeGameState, { type: "START_GAME", playerId: s.hostId, seed: action.seed } as never);
      if (!r.ok) return fail(state, r.error);
      s.activeGameState = r.state;
      settle(s);
      return succeed(s);
    }
    case "GAME": {
      const move = action.action;
      if (move.type === "JOIN_ROOM" || move.type === "LEAVE_ROOM") return fail(state, "The room seats players");
      // Wrapped moves act for the sender only; the room has already checked the sender.
      if (!("playerId" in move) || move.playerId !== action.playerId) return fail(state, "That move isn't yours to make.");
      if (move.type === "RENAME_PLAYER") {
        if (state.phase !== "lobby") return fail(state, "Names are locked once the game starts");
        const s = structuredClone(state);
        const name = move.name.slice(0, 20);
        s.players = s.players.map((p) => (p.id === move.playerId ? { ...p, name } : p));
        s.activeGameState = tryApply(s.activeGameState, { ...move, name });
        return succeed(s);
      }
      const r = kit(state.selectedGame).def.applyAction(state.activeGameState, move as never);
      if (!r.ok) return fail(state, r.error);
      const s = { ...state, activeGameState: r.state };
      settle(s);
      return succeed(s);
    }
  }
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export interface PartyView extends Omit<PartyState, "activeGameState" | "pastWins"> {
  viewerId: string;
  /** Who the selected game deals in; everyone else in the room sits this one out. */
  seatedIds: string[];
  /** The game as this viewer may see it. */
  activeGameView: ActiveGameView;
}

export function getPartyView(state: PartyState, viewer: string): PartyView {
  const { activeGameState, pastWins: _p, ...rest } = state;
  void _p;
  return {
    ...rest,
    viewerId: viewer,
    seatedIds: activeGameState.players.map((p) => p.id),
    activeGameView: kit(state.selectedGame).def.getPlayerView(activeGameState, viewer),
  };
}

/** The room as something the online room protocol can host. It seats newcomers at any time. */
export const partyGame: GameDefinition<PartyState, PartyAction, PartyView> = {
  applyAction: applyPartyAction,
  getPlayerView: getPartyView,
  join: (player) => ({ type: "JOIN", player }),
  leave: (playerId) => ({ type: "LEAVE", playerId }),
  maxPlayers: PARTY_MAX_PLAYERS,
  seatsOpen: () => true,
};

// ---------------------------------------------------------------------------
// Bots and timers, run by the host for whichever game is on
// ---------------------------------------------------------------------------

const wrap = (move: ActiveGameAction, hostId: string): PartyAction => ({ type: "GAME", playerId: "playerId" in move ? move.playerId : hostId, action: move });

export const partyBots: BotRunner<PartyState, PartyAction> = {
  pending: (s) => (s.phase === "lobby" ? null : kit(s.selectedGame).bots.pending(s.activeGameState)),
  decide(s, botId, rng) {
    const move = kit(s.selectedGame).bots.decide(s.activeGameState, botId, rng);
    return move ? wrap(move, s.hostId) : null;
  },
};

export const partyClock: TableClock<PartyState, PartyAction> = (s) => {
  const next = s.phase === "lobby" ? null : kit(s.selectedGame).clock?.(s.activeGameState);
  return next ? { at: next.at, action: wrap(next.action, s.hostId) } : null;
};
