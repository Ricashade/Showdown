import { describe, expect, it } from "vitest";
import type { ActiveGameAction, PartyAction, PartyState } from "@/types/party";
import type { WarState } from "@/types/war";
import type { BlackjackState } from "@/types/blackjack";
import { applyPartyAction, createParty, getPartyView, partyBots, partyClock, partyGame } from "@/lib/party-engine";
import { WAR_DEFAULTS, getWarView } from "@/lib/war-engine";
import { GARBAGE_DEFAULTS } from "@/lib/garbage-engine";
import { createMemoryHub } from "@/lib/multiplayer/memory-channel";
import { generateIdentity } from "@/lib/multiplayer/crypto";
import { RoomGuest, RoomHost } from "@/lib/multiplayer/room";
import type { PartyView } from "@/lib/party-engine";

function must(r: { ok: boolean; state: PartyState; error?: string }): PartyState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
const act = (s: PartyState, a: PartyAction) => must(applyPartyAction(s, a));
const move = (s: PartyState, a: ActiveGameAction) => act(s, { type: "GAME", playerId: "playerId" in a ? a.playerId : s.hostId, action: a });

function room(ids = ["h", "a"], game: Parameters<typeof createParty>[0]["game"] = "bs-poker") {
  let s = createParty({ roomCode: "ABCD", host: { id: ids[0], name: ids[0] }, game });
  for (const id of ids.slice(1)) s = act(s, { type: "JOIN", player: { id, name: id } });
  return s;
}

const war = (s: PartyState) => s.activeGameState as WarState;

/** Flip until the War match ends (blitz caps it at 50 battles). */
function finishWar(s: PartyState) {
  for (let i = 0; i < 2000 && s.phase === "in_game"; i++) {
    for (const side of war(s).sides!) if (!side.ready && s.phase === "in_game") s = move(s, { type: "FLIP", playerId: side.id });
  }
  expect(s.phase).toBe("post_game");
  return s;
}

function startWar(ids = ["h", "a"], settings: Partial<typeof WAR_DEFAULTS> = {}) {
  let s = act(room(ids), { type: "SWITCH_GAME", playerId: "h", newGameType: "war" });
  s = move(s, { type: "UPDATE_SETTINGS", playerId: "h", settings: { winCondition: "blitz", ...settings } });
  return move(s, { type: "START_GAME", playerId: "h", seed: 5 });
}

describe("switching games", () => {
  it("only the host switches, and the new game starts on its default house rules", () => {
    let s = room(["h", "a"], "garbage");
    s = move(s, { type: "UPDATE_SETTINGS", playerId: "h", settings: { lastTurn: false } });
    expect((s.activeGameState.settings as typeof GARBAGE_DEFAULTS).lastTurn).toBe(false);
    expect(applyPartyAction(s, { type: "SWITCH_GAME", playerId: "a", newGameType: "war" }).ok).toBe(false);

    s = act(s, { type: "SWITCH_GAME", playerId: "h", newGameType: "war" });
    expect(s.selectedGame).toBe("war");
    expect(s.activeGameState.mode).toBe("war");
    expect(s.phase).toBe("lobby");
    expect(war(s).settings).toEqual(WAR_DEFAULTS);
    expect(war(s).players.map((p) => p.id)).toEqual(["h", "a"]);

    s = act(s, { type: "SWITCH_GAME", playerId: "h", newGameType: "garbage" });
    expect(s.activeGameState.settings).toEqual(GARBAGE_DEFAULTS);
  });

  it("can't switch in the middle of a match", () => {
    const s = startWar();
    expect(applyPartyAction(s, { type: "SWITCH_GAME", playerId: "h", newGameType: "rummy" }).ok).toBe(false);
  });

  it("seats as many as the game holds; the rest sit out until a bigger game", () => {
    const ids = ["h", "a", "b", "c", "d", "e", "f", "g"];
    let s = room(ids, "bs-poker");
    expect(getPartyView(s, "h").seatedIds).toHaveLength(8);

    s = act(s, { type: "SWITCH_GAME", playerId: "h", newGameType: "rummy" });
    expect(getPartyView(s, "h").seatedIds).toEqual(ids.slice(0, 6));
    expect(s.players).toHaveLength(8);

    s = act(s, { type: "SWITCH_GAME", playerId: "h", newGameType: "texas-holdem" });
    expect(getPartyView(s, "h").seatedIds).toEqual(ids);
  });

  it("frees a seat for whoever sat out when someone leaves the lobby", () => {
    let s = room(["h", "a", "b", "c", "d", "e", "f"], "garbage");
    expect(getPartyView(s, "h").seatedIds).not.toContain("f");
    s = act(s, { type: "LEAVE", playerId: "a" });
    expect(getPartyView(s, "h").seatedIds).toContain("f");
  });
});

describe("joining and leaving", () => {
  it("seats people who arrive mid-game at the next deal", () => {
    let s = startWar();
    s = act(s, { type: "JOIN", player: { id: "late", name: "Late" } });
    expect(s.players.map((p) => p.id)).toContain("late");
    expect(getPartyView(s, "late").seatedIds).not.toContain("late");

    s = act(s, { type: "RETURN_TO_LOBBY", playerId: "h" });
    expect(getPartyView(s, "late").seatedIds).toContain("late");
  });

  it("only lets people leave a match in progress if they weren't dealt in", () => {
    let s = startWar();
    expect(applyPartyAction(s, { type: "LEAVE", playerId: "a" }).ok).toBe(false);
    s = act(s, { type: "JOIN", player: { id: "late", name: "Late" } });
    expect(applyPartyAction(s, { type: "LEAVE", playerId: "late" }).ok).toBe(true);
    expect(applyPartyAction(s, { type: "LEAVE", playerId: "h" }).ok).toBe(false);
  });

  it("gives back tonight's wins to someone who drops and rejoins", () => {
    let s = structuredClone(room(["h", "a"]));
    s.players[1].sessionWins = 2;
    s = act(s, { type: "LEAVE", playerId: "a" });
    expect(s.players.map((p) => p.id)).toEqual(["h"]);
    s = act(s, { type: "JOIN", player: { id: "a", name: "Back" } });
    expect(s.players.find((p) => p.id === "a")!.sessionWins).toBe(2);
  });

  it("keeps lobby renames on the room's roster too", () => {
    const s = move(room(), { type: "RENAME_PLAYER", playerId: "a", name: "Ann" });
    expect(s.players.find((p) => p.id === "a")!.name).toBe("Ann");
    expect(s.activeGameState.players.find((p) => p.id === "a")!.name).toBe("Ann");
  });
});

describe("after a match", () => {
  it("crowns the winner once, however the host moves on", () => {
    let s = finishWar(startWar());
    const [winner] = s.lastWinnerIds;
    expect(winner).toBe(war(s).winnerId);
    const wins = () => Object.fromEntries(s.players.map((p) => [p.id, p.sessionWins]));
    expect(wins()[winner]).toBe(1);

    s = act(s, { type: "PLAY_AGAIN", playerId: "h", seed: 8 });
    expect(s.phase).toBe("in_game");
    expect(war(s).settings.winCondition).toBe("blitz");
    expect(wins()[winner]).toBe(1);

    s = finishWar(s);
    expect(Object.values(wins()).reduce((a, b) => a + b, 0)).toBe(2);
    s = act(s, { type: "SWITCH_GAME", playerId: "h", newGameType: "rummy" });
    expect(Object.values(wins()).reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("crowns nobody when the host ends a match early", () => {
    let s = startWar();
    s = move(s, { type: "FLIP", playerId: "h" });
    s = act(s, { type: "RETURN_TO_LOBBY", playerId: "h" });
    expect(s.phase).toBe("lobby");
    expect(s.players.every((p) => p.sessionWins === 0)).toBe(true);
  });

  it("Blackjack: ending the table crowns whoever is up the most", () => {
    let s = act(room(["h", "a"]), { type: "SWITCH_GAME", playerId: "h", newGameType: "blackjack" });
    s = move(s, { type: "START_GAME", playerId: "h", seed: 3 });
    const rigged = structuredClone(s);
    const bj = rigged.activeGameState as BlackjackState;
    bj.players[1].chips = bj.settings.startingChips + 250;
    s = act(rigged, { type: "RETURN_TO_LOBBY", playerId: "h" });
    expect(s.players.find((p) => p.id === "a")!.sessionWins).toBe(1);
    expect(s.players.find((p) => p.id === "h")!.sessionWins).toBe(0);
  });

  it("War, winner stays on: the next player in line takes on the winner", () => {
    let s = startWar(["h", "a", "b"], { winnerStaysOn: true });
    expect(war(s).sides!.map((x) => x.id)).toEqual(["h", "a"]);
    s = finishWar(s);
    const winner = war(s).winnerId!;
    s = act(s, { type: "PLAY_AGAIN", playerId: "h", seed: 2 });
    const duel = war(s).sides!.map((x) => x.id);
    expect(duel[0]).toBe(winner);
    expect(duel[1]).toBe("b");
  });

  it("only the host can deal again or go back", () => {
    const s = finishWar(startWar());
    expect(applyPartyAction(s, { type: "PLAY_AGAIN", playerId: "a", seed: 1 }).ok).toBe(false);
    expect(applyPartyAction(s, { type: "RETURN_TO_LOBBY", playerId: "a" }).ok).toBe(false);
  });
});

describe("game moves", () => {
  it("rejects moves wrapped for someone else, and seat changes through the game", () => {
    const s = startWar();
    expect(applyPartyAction(s, { type: "GAME", playerId: "a", action: { type: "FLIP", playerId: "h" } }).ok).toBe(false);
    expect(applyPartyAction(s, { type: "GAME", playerId: "a", action: { type: "JOIN_ROOM", player: { id: "x", name: "x" } } }).ok).toBe(false);
    expect(applyPartyAction(s, { type: "GAME", playerId: "a", action: { type: "FLIP", playerId: "a" } }).ok).toBe(true);
  });

  it("each viewer gets the game's own redacted view", () => {
    let s = startWar(["h", "a"], { mode: "tactical" });
    s = act(s, { type: "JOIN", player: { id: "late", name: "Late" } });
    const view = getPartyView(s, "a").activeGameView;
    expect(view).toEqual(getWarView(war(s), "a"));
    expect("pastWins" in getPartyView(s, "a")).toBe(false);
    expect(JSON.stringify(getPartyView(s, "late"))).not.toContain("rngState");
  });

  it("runs bots and timers only once a game is on", () => {
    let s = room(["h"]);
    s = act(s, { type: "JOIN", player: { id: "bot", name: "Bot", isBot: true, botDifficulty: "easy" } });
    s = act(s, { type: "SWITCH_GAME", playerId: "h", newGameType: "blackjack" });
    expect(partyBots.pending(s)).toBeNull();
    expect(partyClock(s)).toBeNull();
    s = move(s, { type: "START_GAME", playerId: "h", seed: 4 });
    expect(partyBots.pending(s)?.botId).toBe("bot");
    const decision = partyBots.decide(s, "bot", () => 0.5);
    expect(decision).toMatchObject({ type: "GAME", playerId: "bot" });
    expect(applyPartyAction(s, decision!).ok).toBe(true);
    expect(partyClock(s)?.action).toMatchObject({ type: "GAME", playerId: "h", action: { type: "TIME_UP" } });
  });
});

describe("shared online room", () => {
  const settle = async () => {
    for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 2));
  };

  it("seats a guest who arrives mid-game, and keeps everyone through a game switch", async () => {
    const hub = createMemoryHub();
    const hostId = await generateIdentity();
    const host = new RoomHost(partyGame, hub.factory("room"), hostId, { playerId: "h", name: "Hana", role: "host", publicKey: hostId.publicKey, joinedAt: 1 }, createParty({ roomCode: "ABCD", host: { id: "h", name: "Hana" }, game: "war" }));
    await host.start();

    const guest = async (id: string) => {
      const identity = await generateIdentity();
      const g = new RoomGuest<PartyAction, PartyView>(hub.factory("room"), identity, { playerId: id, name: id, role: "guest", publicKey: identity.publicKey, joinedAt: 2 });
      await g.start();
      return g;
    };
    const ann = await guest("ann");
    await settle();
    host.act({ type: "GAME", playerId: "h", action: { type: "START_GAME", playerId: "h", seed: 1 } });
    await settle();

    const ben = await guest("ben");
    await settle();
    expect(ben.getSnapshot().status).toBe("seated");
    expect(ben.getSnapshot().view?.seatedIds).not.toContain("ben");

    host.act({ type: "RETURN_TO_LOBBY", playerId: "h" });
    host.act({ type: "SWITCH_GAME", playerId: "h", newGameType: "rummy" });
    await settle();
    expect(ann.getSnapshot().view?.selectedGame).toBe("rummy");
    expect(ben.getSnapshot().view?.seatedIds).toEqual(["h", "ann", "ben"]);
    expect(ann.getSnapshot().view?.activeGameView.mode).toBe("rummy");
  });
});
