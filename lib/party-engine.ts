/**
 * A room that outlasts any one game. The host runs it like any other game (lib/multiplayer/room.ts);
 * it wraps every game's own reducers, so their rules, views and bots are unchanged.
 *
 * The roster is the room's: people stay in it while the host switches games. The selected game is
 * played at one or more tables, each dealing in as many people as it has seats; anyone without a
 * seat sits that one out and watches.
 */
import type { ActionResult, GameMode, PlayerSeed } from "@/types/game";
import type { Seed } from "@/types/cards";
import { tableSeed } from "./cards";
import { cleanName } from "./names";
import type { ActiveGameAction, ActiveGameState, PartyAction, PartyPlayer, PartyState, PartyTable, RoomPhase } from "@/types/party";
import type { BlackjackState } from "@/types/blackjack";
import type { GameDefinition, RoomAction, RoomState } from "./multiplayer/room";
import type { BotRunner } from "./bot-ai";
import type { TableClock } from "./hooks/use-table-clock";
import { blackjackBots, bsPokerBots, garbageBots, goFishBots, holdemBots, rummyBots, speedBots, thirteenBots, warBots, bouillotteBots } from "./bot-ai";
import { bsPokerGame, createRoom, MIN_PLAYERS } from "./bs-poker-game";
import { createHoldemRoom, holdemGame, HOLDEM_MIN_PLAYERS } from "./holdem-game";
import { BLACKJACK_MIN_PLAYERS, blackjackClock, blackjackGame, createBlackjackRoom } from "./blackjack-engine";
import { createGarbageRoom, garbageGame, GARBAGE_MIN_PLAYERS } from "./garbage-engine";
import { createRummyRoom, rummyGame, RUMMY_MIN_PLAYERS } from "./rummy-engine";
import { createWarRoom, warGame, WAR_MIN_PLAYERS } from "./war-engine";
import { createGoFishRoom, goFishGame, GOFISH_MIN_PLAYERS } from "./gofish-engine";
import { createThirteenRoom, thirteenGame, THIRTEEN_MIN_PLAYERS } from "./thirteen-engine";
import { createSpeedRoom, speedClock, speedGame, SPEED_MIN_PLAYERS } from "./speed-engine";
import { bouillotteGame, BOUILLOTTE_MIN_PLAYERS, createBouillotteRoom } from "./bouillotte-engine";
import type { BlackjackView } from "./blackjack-engine";
import type { BsPokerView } from "./bs-poker-game";
import type { GarbageView } from "./garbage-engine";
import type { HoldemView } from "./holdem-game";
import type { RummyView } from "./rummy-engine";
import type { WarView } from "./war-engine";
import type { GoFishView } from "./gofish-engine";
import type { ThirteenView } from "./thirteen-engine";
import type { SpeedView } from "./speed-engine";
import type { BouillotteView } from "./bouillotte-engine";
import type { SpeedState } from "@/types/speed";
import type { GoFishState } from "@/types/gofish";

/** Hold'em seats the most. */
export const PARTY_MAX_PLAYERS = 9;

/** How many tables a room can split into. */
export const PARTY_MAX_TABLES = 4;

export type ActiveGameView = BsPokerView | HoldemView | BlackjackView | GarbageView | RummyView | WarView | GoFishView | ThirteenView | SpeedView | BouillotteView;

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
  thirteen: defineKit({ def: thirteenGame, create: (roomId, host) => createThirteenRoom({ roomId, host }), minPlayers: THIRTEEN_MIN_PLAYERS, bots: thirteenBots, winners: winnerOf }),
  // Out of cards with nothing left to turn, a tie for fewest crowns both.
  speed: defineKit({
    def: speedGame,
    create: (roomId, host) => createSpeedRoom({ roomId, host }),
    minPlayers: SPEED_MIN_PLAYERS,
    bots: speedBots,
    clock: speedClock,
    winners: (s: SpeedState, finished: boolean) => (finished ? s.winnerIds : []),
  }),
  bouillotte: defineKit({ def: bouillotteGame, create: (roomId, host) => createBouillotteRoom({ roomId, host }), minPlayers: BOUILLOTTE_MIN_PLAYERS, bots: bouillotteBots, winners: winnerOf }),
};

/** Each kit is typed for its own game; the room only ever hands a game its own state and moves. */
const kit = (id: GameMode) => kits[id] as unknown as Kit;

export const GAME_IDS = Object.keys(kits) as GameMode[];
export const isGameId = (x: unknown): x is GameMode => typeof x === "string" && Object.hasOwn(kits, x);

/** Seats the game has, and how many it needs. */
export const seatsFor = (id: GameMode) => ({ min: kit(id).minPlayers, max: kit(id).def.maxPlayers });

/** Who won a game that has just finished on its own (none while it's still going). */
export const matchWinners = (s: ActiveGameState): string[] => (s.phase === "game_over" ? kit(s.mode as GameMode).winners(s, true) : []);

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

type Result = ActionResult<PartyState>;
const fail = (state: PartyState, error: string): Result => ({ ok: false, error, state });
const succeed = (state: PartyState): Result => ({ ok: true, state: { ...state, version: state.version + 1 } });

const member = (seed: PlayerSeed, isHost: boolean, sessionWins = 0): PartyPlayer => ({
  id: seed.id,
  name: cleanName(seed.name) ?? "Player",
  isBot: !!seed.isBot,
  ...(seed.botDifficulty ? { botDifficulty: seed.botDifficulty } : {}),
  isHost,
  sessionWins,
});

const seedOf = (p: PartyPlayer): PlayerSeed => ({ id: p.id, name: p.name, ...(p.isBot ? { isBot: true } : {}), ...(p.botDifficulty ? { botDifficulty: p.botDifficulty } : {}) });

/** A table's game is under way: dealt and not yet over. */
const live = (g: ActiveGameState) => g.phase !== "lobby" && g.phase !== "game_over";

/** The room's phase follows its tables: playing while any table plays, over once every dealt table is. */
function phaseOf(s: PartyState): RoomPhase {
  if (s.tables.every((t) => t.state.phase === "lobby")) return "lobby";
  return s.tables.some((t) => live(t.state)) ? "in_game" : "post_game";
}

export const tableOf = (s: { tables: PartyTable[] }, playerId: string) => s.tables.find((t) => t.state.players.some((p) => p.id === playerId)) ?? null;

/** A game move that may not apply (a full table, say): keep the game as it was. */
function tryApply(g: ActiveGameState, a: ActiveGameAction) {
  const r = kit(g.mode).def.applyAction(g, a as never);
  return r.ok ? r.state : g;
}

/** Every table answers to the room's host, whether or not they sit there. */
const answerTo = (g: ActiveGameState, hostId: string): ActiveGameState =>
  ({ ...g, hostId, players: g.players.map((p) => ({ ...p, isHost: p.id === hostId })) }) as ActiveGameState;

/** Lobby only: take someone off a table. */
const unseat = (g: ActiveGameState, id: string) => ({ ...g, players: g.players.filter((p) => p.id !== id) }) as ActiveGameState;

/** An empty table of the room's game, under the house rules the room already has. */
function newTable(s: PartyState, id: string, seats: number): PartyTable {
  const host = s.players.find((p) => p.id === s.hostId)!;
  const base = kit(s.selectedGame).create(`${s.roomCode}-${id}`, seedOf(host));
  const settings = s.tables[0] ? structuredClone(s.tables[0].state.settings) : base.settings;
  return { id, seats, state: { ...base, players: [], settings } as ActiveGameState };
}

/**
 * In the lobby: drop anyone who left or no longer fits their table, then give everyone without a
 * seat a free one at the first table, in the order they joined. Extra tables fill only by choice:
 * people sit there themselves, and the host moves bots there.
 */
function seatLobby(s: PartyState) {
  const { def } = kit(s.selectedGame);
  const inRoom = new Set(s.players.map((p) => p.id));
  const isBot = (id: string) => !!s.players.find((p) => p.id === id)?.isBot;
  for (const t of s.tables) {
    if (t.state.phase !== "lobby") continue;
    // Over the seat count: bots give up their seats first (last in, first out), then people.
    const here = t.state.players.filter((p) => inRoom.has(p.id));
    const drop = new Set<string>();
    for (const bots of [true, false]) {
      for (let i = here.length - 1; i >= 0 && here.length - drop.size > t.seats; i--) if (isBot(here[i].id) === bots) drop.add(here[i].id);
    }
    t.state = { ...t.state, players: here.filter((p) => !drop.has(p.id)) } as ActiveGameState;
  }
  const first = s.tables[0];
  for (const p of s.players) {
    if (tableOf(s, p.id) || first.state.phase !== "lobby" || first.state.players.length >= first.seats) continue;
    first.state = tryApply(first.state, def.join(seedOf(p)));
  }
  for (const t of s.tables) t.state = answerTo(t.state, s.hostId);
}

function freshGame(s: PartyState, id: GameMode) {
  s.selectedGame = id;
  s.tables = [];
  s.tables = [newTable(s, "t1", kit(id).def.maxPlayers)];
  s.phase = "lobby";
  s.lastWinnerIds = [];
  seatLobby(s);
}

function crown(s: PartyState, ids: string[]) {
  if (!ids.length) return;
  s.players = s.players.map((p) => (ids.includes(p.id) ? { ...p, sessionWins: p.sessionWins + 1 } : p));
  s.lastWinnerIds = [...new Set([...s.lastWinnerIds, ...ids])];
}

/** After the tables move on: follow their phase, and reseat everyone on the way back to the lobby. */
function settle(s: PartyState) {
  const before = s.phase;
  s.phase = phaseOf(s);
  if (s.phase === "lobby" && before !== "lobby") seatLobby(s);
}

/** Who deals the next hand at a table: the host if they sit there, else its first person. */
export function leadOf(s: { hostId: string; players: PartyPlayer[] }, t: PartyTable): string | null {
  const seated = t.state.players.filter((p) => s.players.some((x) => x.id === p.id && !x.isBot));
  return seated.some((p) => p.id === s.hostId) ? s.hostId : (seated[0]?.id ?? null);
}

/** Why the tables can't be dealt yet (every one needs enough players, at least one a person), or null. */
export function tablesNotReady(s: { hostId: string; players: PartyPlayer[]; selectedGame: GameMode; tables: PartyTable[] }): string | null {
  const { minPlayers } = kit(s.selectedGame);
  const i = s.tables.findIndex((t) => t.state.players.length < minPlayers || !leadOf(s, t));
  if (i < 0) return null;
  // One table reads as it always has; with more, say which one is short.
  if (s.tables.length === 1) return `Needs at least ${minPlayers} players.`;
  return `Table ${i + 1} needs at least ${minPlayers} players.`;
}

/** Deal every table, one seed each. */
function startTables(s: PartyState, seed: Seed): string | null {
  const notReady = tablesNotReady(s);
  if (notReady) return notReady;
  s.lastWinnerIds = [];
  for (const [i, t] of s.tables.entries()) {
    const r = kit(s.selectedGame).def.applyAction(t.state, { type: "START_GAME", playerId: s.hostId, seed: tableSeed(seed, i) } as never);
    if (!r.ok) return r.error;
    t.state = r.state;
  }
  return null;
}

/** Every table back to its lobby. A match the host ends early may still crown (Blackjack's chip leader). */
function resetTables(s: PartyState, early: boolean) {
  for (const t of s.tables) {
    if (early && live(t.state)) crown(s, kit(s.selectedGame).winners(t.state, false));
    t.state = tryApply(t.state, { type: "RETURN_TO_LOBBY", playerId: s.hostId } as ActiveGameAction);
  }
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
    tables: [],
    pastWins: {},
    lastWinnerIds: [],
  };
  freshGame(s, isGameId(params.game) ? params.game : "bs-poker");
  return s;
}

/** Moves the deal-the-next-hand kind, which the lead of a table without the host makes for them. */
const DEALS = new Set(["NEXT_HAND", "NEXT_ROUND"]);

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
      const table = tableOf(state, leaving.id);
      if (table && live(table.state)) return fail(state, "Players can only leave from the lobby");
      const s = structuredClone(state);
      s.players = s.players.filter((p) => p.id !== leaving.id);
      if (leaving.sessionWins > 0) s.pastWins[leaving.id] = leaving.sessionWins;
      for (const t of s.tables) if (t.state.phase === "lobby") t.state = unseat(t.state, leaving.id);
      if (s.phase === "lobby") seatLobby(s);
      return succeed(s);
    }
    case "SIT": {
      if (state.phase !== "lobby") return fail(state, "Change tables in the lobby");
      const who = action.who ?? action.playerId;
      if (who !== action.playerId && !isHost) return fail(state, "Only the host can seat someone else");
      const person = state.players.find((p) => p.id === who);
      if (!person) return fail(state, "Player not in room");
      const target = state.tables.find((t) => t.id === action.tableId);
      if (!target) return fail(state, "There's no such table");
      if (target.state.players.some((p) => p.id === who)) return fail(state, "Already at that table");
      if (target.state.players.length >= target.seats) return fail(state, "That table is full");
      const s = structuredClone(state);
      for (const t of s.tables) t.state = unseat(t.state, who);
      const t = s.tables.find((x) => x.id === action.tableId)!;
      t.state = tryApply(t.state, kit(s.selectedGame).def.join(seedOf(person)));
      seatLobby(s);
      return succeed(s);
    }
    case "SET_TABLES": {
      if (!isHost) return fail(state, "Only the host can set the tables");
      if (state.phase !== "lobby") return fail(state, "Set the tables in the lobby");
      const { min, max } = seatsFor(state.selectedGame);
      const seats = action.seats.slice(0, PARTY_MAX_TABLES).map((n) => Math.max(min, Math.min(max, Math.round(n) || max)));
      if (seats.length === 0) return fail(state, "A room needs a table");
      const s = structuredClone(state);
      s.tables = s.tables.slice(0, seats.length).map((t, i) => ({ ...t, seats: seats[i] }));
      for (let i = s.tables.length; i < seats.length; i++) s.tables.push(newTable(s, `t${i + 1}`, seats[i]));
      seatLobby(s);
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
      resetTables(s, s.phase === "in_game");
      settle(s);
      return succeed(s);
    }
    case "PLAY_AGAIN": {
      if (!isHost) return fail(state, "Only the host can deal again");
      if (state.phase !== "post_game") return fail(state, "The match isn't over");
      const s = structuredClone(state);
      resetTables(s, false);
      settle(s);
      const err = startTables(s, action.seed);
      if (err) return fail(state, err);
      settle(s);
      return succeed(s);
    }
    case "GAME": {
      const move = action.action;
      if (!move || typeof move !== "object" || typeof move.type !== "string") return fail(state, "That isn't a move");
      if (move.type === "JOIN_ROOM" || move.type === "LEAVE_ROOM") return fail(state, "The room seats players");
      // Wrapped moves act for the sender only; the room has already checked the sender.
      if (!("playerId" in move) || move.playerId !== action.playerId) return fail(state, "That move isn't yours to make.");
      // The host's lobby moves cover every table at once.
      if (move.type === "START_GAME") {
        if (!isHost) return fail(state, "Only the host can start");
        if (state.phase !== "lobby") return fail(state, "The game has started");
        const s = structuredClone(state);
        const err = startTables(s, move.seed);
        if (err) return fail(state, err);
        settle(s);
        return succeed(s);
      }
      if (move.type === "UPDATE_SETTINGS") {
        if (!isHost) return fail(state, "Only the host can change the house rules");
        const s = structuredClone(state);
        for (const t of s.tables) {
          const r = kit(s.selectedGame).def.applyAction(t.state, move as never);
          if (!r.ok) return fail(state, r.error);
          t.state = r.state;
        }
        return succeed(s);
      }
      if (move.type === "RETURN_TO_LOBBY") return applyPartyAction(state, { type: "RETURN_TO_LOBBY", playerId: action.playerId });
      if (move.type === "RENAME_PLAYER") {
        if (state.phase !== "lobby") return fail(state, "Names are locked once the game starts");
        const s = structuredClone(state);
        const name = cleanName(move.name);
        if (!name) return fail(state, "Pick a name");
        s.players = s.players.map((p) => (p.id === move.playerId ? { ...p, name } : p));
        for (const t of s.tables) t.state = tryApply(t.state, { ...move, name });
        return succeed(s);
      }
      const at = action.tableId ? state.tables.find((t) => t.id === action.tableId) : tableOf(state, action.playerId);
      if (!at) return fail(state, "You're not at a table");
      // At a table the host isn't at, its lead deals the next hand for them.
      const lead = DEALS.has(move.type) && action.playerId === leadOf(state, at);
      const r = kit(state.selectedGame).def.applyAction(at.state, (lead ? { ...move, playerId: state.hostId } : move) as never);
      if (!r.ok) return fail(state, r.error);
      const s = { ...state, tables: state.tables.map((t) => (t.id === at.id ? { ...t, state: r.state } : t)) };
      if (at.state.phase !== "game_over" && r.state.phase === "game_over") crown(s, kit(s.selectedGame).winners(r.state, true));
      settle(s);
      return succeed(s);
    }
  }
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/** A table as anyone in the room sees it in the lobby. */
export interface PartyTableInfo {
  id: string;
  seats: number;
  playerIds: string[];
  /** Dealt this match (it had enough players). */
  dealt: boolean;
}

export interface PartyView extends Omit<PartyState, "tables" | "pastWins"> {
  viewerId: string;
  /** Who has a seat at some table; everyone else in the room sits this one out. */
  seatedIds: string[];
  tables: PartyTableInfo[];
  /** The viewer's table, or null without a seat. */
  tableId: string | null;
  /** Mid-match: the viewer has a seat at a table that was dealt (not just watching). */
  playing: boolean;
  /** In the lobby: why the host can't deal yet, or null. */
  notReady: string | null;
  /** The game at the viewer's table (or the first table, without a seat) as they may see it. */
  activeGameView: ActiveGameView;
  /** Mid-match: the other dealt tables, as anyone not sitting there sees them. */
  otherTables: { id: string; view: ActiveGameView }[];
}

export function getPartyView(state: PartyState, viewer: string): PartyView {
  const { tables, pastWins: _p, ...rest } = state;
  void _p;
  const { def } = kit(state.selectedGame);
  const mine = tableOf(state, viewer);
  const dealt = (t: PartyTable) => t.state.phase !== "lobby";
  // Without a dealt seat mid-match, watch the first table that was dealt.
  const shown = mine && (state.phase === "lobby" || dealt(mine)) ? mine : (tables.find(dealt) ?? tables[0]);
  let activeGameView = def.getPlayerView(shown.state, viewer);
  // Mid-match at a table the host isn't at, its lead deals: show them as its host.
  const lead = leadOf(state, shown);
  if (state.phase !== "lobby" && lead && lead !== state.hostId) activeGameView = { ...activeGameView, hostId: lead } as ActiveGameView;
  return {
    ...rest,
    viewerId: viewer,
    seatedIds: tables.flatMap((t) => t.state.players.map((p) => p.id)),
    tables: tables.map((t) => ({ id: t.id, seats: t.seats, playerIds: t.state.players.map((p) => p.id), dealt: t.state.phase !== "lobby" })),
    tableId: mine?.id ?? null,
    playing: state.phase !== "lobby" && !!mine && dealt(mine),
    notReady: state.phase === "lobby" ? tablesNotReady(state) : null,
    activeGameView,
    otherTables:
      state.phase === "lobby" ? [] : tables.filter((t) => t !== shown && t.state.phase !== "lobby").map((t) => ({ id: t.id, view: def.getPlayerView(t.state, viewer) })),
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
// Bots and timers, run by the host for every table that's playing
// ---------------------------------------------------------------------------

const wrap = (move: ActiveGameAction, hostId: string, tableId: string): PartyAction => ({
  type: "GAME",
  playerId: "playerId" in move ? move.playerId : hostId,
  action: move,
  tableId,
});

export const partyBots: BotRunner<PartyState, PartyAction> = {
  pending(s) {
    if (s.phase === "lobby") return null;
    for (const t of s.tables) {
      if (t.state.phase === "lobby") continue;
      const next = kit(s.selectedGame).bots.pending(t.state);
      if (next) return next;
    }
    return null;
  },
  decide(s, botId, rng) {
    const t = tableOf(s, botId);
    if (!t) return null;
    const move = kit(s.selectedGame).bots.decide(t.state, botId, rng);
    return move ? wrap(move, s.hostId, t.id) : null;
  },
};

/** Whichever table's timer runs out first. */
export const partyClock: TableClock<PartyState, PartyAction> = (s) => {
  if (s.phase === "lobby") return null;
  let first: { at: number; action: PartyAction } | null = null;
  for (const t of s.tables) {
    if (t.state.phase === "lobby") continue;
    const next = kit(s.selectedGame).clock?.(t.state);
    if (next && (!first || next.at < first.at)) first = { at: next.at, action: wrap(next.action, s.hostId, t.id) };
  }
  return first;
};
