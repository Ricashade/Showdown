import { describe, expect, it } from "vitest";
import type { BsPokerAction } from "@/types/bs-poker";
import type { HoldemAction } from "@/types/holdem";
import { bsPokerGame, createRoom, type BsPokerView } from "@/lib/bs-poker-game";
import { createHoldemRoom, holdemGame, type HoldemView } from "@/lib/holdem-game";
import { createMemoryHub } from "@/lib/multiplayer/memory-channel";
import { generateIdentity, seal } from "@/lib/multiplayer/crypto";
import { RoomGuest, RoomHost } from "@/lib/multiplayer/room";

const settle = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 2));
};

async function makeHost(hub: ReturnType<typeof createMemoryHub>, code = "ABCD") {
  const identity = await generateIdentity();
  const meta = { playerId: "host", name: "Hana", role: "host" as const, publicKey: identity.publicKey, joinedAt: 1 };
  const host = new RoomHost(bsPokerGame, hub.factory(code), identity, meta, createRoom({ roomId: code, host: { id: "host", name: "Hana" } }));
  await host.start();
  return host;
}

async function makeGuest(hub: ReturnType<typeof createMemoryHub>, id: string, name: string, code = "ABCD") {
  const identity = await generateIdentity();
  const guest = new RoomGuest<BsPokerAction, BsPokerView>(hub.factory(code), identity, { playerId: id, name, role: "guest", publicKey: identity.publicKey, joinedAt: 2 });
  await guest.start();
  return { guest, identity };
}

describe("online room", () => {
  it("seats guests from presence and gives each their own view", async () => {
    const hub = createMemoryHub();
    const host = await makeHost(hub);
    const { guest: ann } = await makeGuest(hub, "ann", "Ann");
    const { guest: ben } = await makeGuest(hub, "ben", "Ben");
    await settle();

    expect(host.getState().players.map((p) => p.name)).toEqual(["Hana", "Ann", "Ben"]);
    expect(ann.getSnapshot().status).toBe("seated");
    expect(ann.getSnapshot().view?.viewerId).toBe("ann");
    expect(ben.getSnapshot().view?.players).toHaveLength(3);
    expect(new Set(host.getConnectedIds())).toEqual(new Set(["host", "ann", "ben"]));
  });

  it("never puts another player's cards (or the shuffle seed) on the wire", async () => {
    const hub = createMemoryHub();
    const wire: string[] = [];
    hub.tap("ABCD", (_event, payload) => wire.push(JSON.stringify(payload)));
    const host = await makeHost(hub);
    const { guest: ann } = await makeGuest(hub, "ann", "Ann");
    await makeGuest(hub, "ben", "Ben");
    await settle();

    host.act({ type: "START_GAME", playerId: "host", seed: 42 });
    await settle();

    const state = host.getState();
    const allCards = state.players.flatMap((p) => p.hand.map((c) => c.id));
    const everything = wire.join("\n");
    for (const card of allCards) expect(everything).not.toContain(`"${card}"`);
    expect(everything).not.toContain("rngState");

    // Ann can see her own card and nobody else's.
    const view = ann.getSnapshot().view!;
    const annHand = state.players.find((p) => p.id === "ann")!.hand;
    expect(view.players.find((p) => p.id === "ann")!.hand).toEqual(annHand);
    expect(view.players.filter((p) => p.id !== "ann").every((p) => p.hand === null)).toBe(true);
    expect("rngState" in view).toBe(false);
    expect("burnCards" in view).toBe(false);
    for (const burned of state.burnCards) expect(everything).not.toContain(`"${burned.id}"`);
  });

  it("plays a round end to end through guests", async () => {
    const hub = createMemoryHub();
    const host = await makeHost(hub);
    const { guest: ann } = await makeGuest(hub, "ann", "Ann");
    await settle();
    host.act({ type: "START_GAME", playerId: "host", seed: 7 });
    await settle();

    const s = host.getState();
    const act = (id: string, action: BsPokerAction) => (id === "host" ? host.act(action) : ann.act(action));
    const first = s.currentTurnPlayerId!;
    const second = first === "host" ? "ann" : "host";
    await act(first, { type: "PLACE_BID", playerId: first, bid: { type: "FOUR_OF_A_KIND", rank: 14 } });
    await settle();
    await act(second, { type: "CALL_BS", playerId: second });
    await settle();

    expect(host.getState().phase).toBe("showdown");
    const view = ann.getSnapshot().view!;
    expect(view.phase).toBe("showdown");
    expect(view.showdown?.loserId).toBe(first);
    // Everyone's cards are revealed at showdown.
    expect(view.players.every((p) => p.hand !== null)).toBe(true);
  });

  it("rejects moves made in someone else's name", async () => {
    const hub = createMemoryHub();
    const host = await makeHost(hub);
    const { guest: ann } = await makeGuest(hub, "ann", "Ann");
    await settle();

    await ann.act({ type: "UPDATE_SETTINGS", playerId: "host", settings: { maxCards: 2 } });
    await settle();
    expect(host.getState().settings.maxCards).toBe(6);
    expect(ann.getSnapshot().error?.message).toBe("That move isn't yours to make.");
  });

  it("ignores forged and replayed messages", async () => {
    const hub = createMemoryHub();
    const host = await makeHost(hub);
    const recorded: unknown[] = [];
    hub.tap("ABCD", (event, payload) => event === "action" && recorded.push(payload));
    const { guest: ann } = await makeGuest(hub, "ann", "Ann");
    await settle();

    // Forged: sealed with a key that isn't Ann's.
    const mallory = await generateIdentity();
    const fakeKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    void mallory;
    const forged = { from: "ann", sealed: await seal(fakeKey, { n: Date.now() + 1e6, action: { type: "RENAME_PLAYER", playerId: "ann", name: "Pwned" } }) };
    const attacker = hub.factory("ABCD");
    await attacker.send("action", forged);
    await settle();
    expect(host.getState().players.find((p) => p.id === "ann")!.name).toBe("Ann");

    // Replayed: Ann renames twice, then someone resends her first message.
    await ann.act({ type: "RENAME_PLAYER", playerId: "ann", name: "First" });
    await settle();
    await ann.act({ type: "RENAME_PLAYER", playerId: "ann", name: "Second" });
    await settle();
    await attacker.send("action", recorded[0]);
    await settle();
    expect(host.getState().players.find((p) => p.id === "ann")!.name).toBe("Second");
  });

  it("ignores an impostor claiming a seated player's id", async () => {
    const hub = createMemoryHub();
    const host = await makeHost(hub);
    await makeGuest(hub, "ann", "Ann");
    await settle();
    const { guest: impostor } = await makeGuest(hub, "ann", "Not Ann");
    await settle();
    expect(host.getState().players.find((p) => p.id === "ann")!.name).toBe("Ann");
    expect(impostor.getSnapshot().view).toBeNull();
  });

  it("turns away players who arrive after the game started", async () => {
    const hub = createMemoryHub();
    const host = await makeHost(hub);
    await makeGuest(hub, "ann", "Ann");
    await settle();
    host.act({ type: "START_GAME", playerId: "host", seed: 1 });
    await settle();
    const { guest: late } = await makeGuest(hub, "cat", "Cat");
    await settle();
    expect(late.getSnapshot().status).toBe("rejected");
    expect(late.getSnapshot().error?.message).toMatch(/already started/);
    expect(host.getState().players).toHaveLength(2);
  });

  it("frees a lobby seat when a guest leaves, and lets the host remove players", async () => {
    const hub = createMemoryHub();
    const host = await makeHost(hub);
    const { guest: ann } = await makeGuest(hub, "ann", "Ann");
    const { guest: ben } = await makeGuest(hub, "ben", "Ben");
    await settle();
    await ann.stop();
    await settle();
    expect(host.getState().players.map((p) => p.id)).toEqual(["host", "ben"]);

    host.removePlayer("ben");
    await settle();
    expect(host.getState().players.map((p) => p.id)).toEqual(["host"]);
    expect(ben.getSnapshot().status).toBe("removed");
  });

  it("tells guests when the host closes the room", async () => {
    const hub = createMemoryHub();
    const host = await makeHost(hub);
    const { guest: ann } = await makeGuest(hub, "ann", "Ann");
    await settle();
    await host.close();
    await settle();
    expect(ann.getSnapshot().status).toBe("closed");
  });

  it("restores a refreshed host from its snapshot", async () => {
    const hub = createMemoryHub();
    const identity = await generateIdentity();
    const meta = { playerId: "host", name: "Hana", role: "host" as const, publicKey: identity.publicKey, joinedAt: 1 };
    const host = new RoomHost(bsPokerGame, hub.factory("ABCD"), identity, meta, createRoom({ roomId: "ABCD", host: { id: "host", name: "Hana" } }));
    await host.start();
    const { guest: ann } = await makeGuest(hub, "ann", "Ann");
    await settle();
    host.act({ type: "START_GAME", playerId: "host", seed: 3 });
    await settle();
    const snap = structuredClone(host.snapshot());
    await host.stop();
    await settle();
    expect(ann.getSnapshot().status).toBe("host-away");

    const again = new RoomHost(bsPokerGame, hub.factory("ABCD"), identity, { ...meta, joinedAt: 5 }, snap);
    await again.start();
    await settle();
    expect(again.getState().phase).toBe("bidding");
    expect(ann.getSnapshot().status).toBe("seated");
  });

  it("hosts Texas Hold'em the same way, keeping hole cards and the unturned board private", async () => {
    const hub = createMemoryHub();
    const wire: string[] = [];
    hub.tap("holdem:ABCD", (_e, payload) => wire.push(JSON.stringify(payload)));
    const identity = await generateIdentity();
    const meta = { playerId: "host", name: "Hana", role: "host" as const, publicKey: identity.publicKey, joinedAt: 1 };
    const host = new RoomHost(holdemGame, hub.factory("holdem:ABCD"), identity, meta, createHoldemRoom({ roomId: "ABCD", host: { id: "host", name: "Hana" } }));
    await host.start();
    const gid = await generateIdentity();
    const ann = new RoomGuest<HoldemAction, HoldemView>(hub.factory("holdem:ABCD"), gid, { playerId: "ann", name: "Ann", role: "guest", publicKey: gid.publicKey, joinedAt: 2 });
    await ann.start();
    await settle();
    host.act({ type: "START_GAME", playerId: "host", seed: 9 });
    await settle();

    const state = host.getState();
    const secret = [...state.boardCards, ...state.burnCards, ...state.players.flatMap((p) => p.hand)];
    const everything = wire.join("\n");
    for (const c of secret) expect(everything).not.toContain(`"${c.id}"`);

    const view = ann.getSnapshot().view!;
    expect(view.players.find((p) => p.id === "ann")!.hand).toHaveLength(2);
    expect(view.players.find((p) => p.id === "host")!.hand).toBeNull();
    expect(view.board).toEqual([]);

    // Ann acts through the encrypted channel.
    const turn = state.currentTurnId!;
    if (turn === "ann") await ann.act({ type: "CALL", playerId: "ann" });
    else host.act({ type: "CALL", playerId: "host" });
    await settle();
    expect(host.getState().lastActions[turn]?.move).toBe("call");
  });

  it("keeps bots seated when real players come and go, and counts them as connected", async () => {
    const hub = createMemoryHub();
    const host = await makeHost(hub);
    host.act({ type: "JOIN_ROOM", player: { id: "bot_1", name: "Shark Vinnie", isBot: true, botDifficulty: "hard" } });
    const { guest: ann } = await makeGuest(hub, "ann", "Ann");
    await settle();
    await ann.stop();
    await settle();
    expect(host.getState().players.map((p) => p.id)).toEqual(["host", "bot_1"]);
    expect(host.getConnectedIds()).toContain("bot_1");
  });

  describe("room chat", () => {
    it("passes a guest's line to everyone, named by the host", async () => {
      const hub = createMemoryHub();
      const host = await makeHost(hub);
      const { guest: ann } = await makeGuest(hub, "ann", "Ann");
      const { guest: ben } = await makeGuest(hub, "ben", "Ben");
      await settle();

      await ann.say("chat", "  nice   hand  ");
      await settle();
      const line = { senderId: "ann", senderName: "Ann", text: "nice hand", kind: "chat" };
      expect(host.getChat()).toMatchObject([line]);
      expect(ann.getSnapshot().chat).toMatchObject([line]);
      expect(ben.getSnapshot().chat).toMatchObject([line]);
    });

    it("posts for the host and the host's bots, but not as a guest", async () => {
      const hub = createMemoryHub();
      const host = await makeHost(hub);
      const { guest: ann } = await makeGuest(hub, "ann", "Ann");
      await settle();
      host.act({ type: "JOIN_ROOM", player: { id: "bot_1", name: "Dealer Dan", isBot: true, botDifficulty: "easy" } });

      expect(host.post("host", "reaction", "🔥")).toBe(true);
      expect(host.post("bot_1", "chat", "I never bluff.")).toBe(true);
      expect(host.post("ann", "chat", "words in Ann's mouth")).toBe(false);
      expect(host.post("host", "reaction", "🍕")).toBe(false);
      await settle();
      expect(ann.getSnapshot().chat.map((m) => `${m.senderName}: ${m.text}`)).toEqual(["Hana: 🔥", "Dealer Dan: I never bluff."]);
    });

    it("ignores chat sealed with someone else's key, and replays", async () => {
      const hub = createMemoryHub();
      const host = await makeHost(hub);
      const recorded: unknown[] = [];
      hub.tap("ABCD", (event, payload) => event === "chat" && (payload as { from?: string }).from && recorded.push(payload));
      const { guest: ann } = await makeGuest(hub, "ann", "Ann");
      await settle();

      const fakeKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt"]);
      const attacker = hub.factory("ABCD");
      await attacker.send("chat", { from: "ann", sealed: await seal(fakeKey, { n: Date.now() + 1e6, chat: { kind: "chat", text: "forged" } }) });
      await ann.say("chat", "real");
      await settle();
      await new Promise((r) => setTimeout(r, 300));
      await attacker.send("chat", recorded[0]);
      await settle();
      expect(host.getChat().map((m) => m.text)).toEqual(["real"]);
    });

    it("gives the chat so far to someone who joins later, and keeps it across a host refresh", async () => {
      const hub = createMemoryHub();
      const host = await makeHost(hub);
      await settle();
      host.post("host", "chat", "first");
      host.post("host", "chat", "second");
      const { guest: ann } = await makeGuest(hub, "ann", "Ann");
      await settle();
      expect(ann.getSnapshot().chat.map((m) => m.text)).toEqual(["first", "second"]);

      const identity = await generateIdentity();
      const meta = { playerId: "host", name: "Hana", role: "host" as const, publicKey: identity.publicKey, joinedAt: 1 };
      const again = new RoomHost(bsPokerGame, hub.factory("ZZZZ"), identity, meta, host.snapshot());
      expect(again.getChat().map((m) => m.text)).toEqual(["first", "second"]);
    });

    it("drops empty lines, trims long ones, and slows down a flood", async () => {
      const hub = createMemoryHub();
      const host = await makeHost(hub);
      const { guest: ann } = await makeGuest(hub, "ann", "Ann");
      await settle();

      await ann.say("chat", "   ");
      await ann.say("chat", "x".repeat(500));
      await ann.say("chat", "too soon");
      await settle();
      expect(host.getChat().map((m) => m.text.length)).toEqual([200]);
    });
  });
});
