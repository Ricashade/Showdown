/**
 * Attacks on online rooms, each one tried and turned away: a guest asking for the all-seeing view,
 * an impostor host, messages bounced back at their sender, junk on the wire, a locked room, and a
 * shuffle anyone could predict.
 */
import { describe, expect, it } from "vitest";
import type { BsPokerAction } from "@/types/bs-poker";
import { GOD_VIEW } from "@/types/game";
import { bsPokerGame, createRoom, getPlayerView, type BsPokerView } from "@/lib/bs-poker-game";
import { applyBouillotteAction, createBouillotteRoom } from "@/lib/bouillotte-engine";
import { applyPartyAction, createParty } from "@/lib/party-engine";
import { createMemoryHub } from "@/lib/multiplayer/memory-channel";
import { fingerprint, generateIdentity } from "@/lib/multiplayer/crypto";
import { RoomGuest, RoomHost, type HostTrust } from "@/lib/multiplayer/room";
import { generateRoomCode, isPlayerId, isRoomCode } from "@/lib/multiplayer/room-code";
import { cleanMembers } from "@/lib/multiplayer/channel";
import { chachaBlock, createDeck, nextRandom, randomSeed, seedRng, shuffle, tableSeed } from "@/lib/cards";
import { cleanName } from "@/lib/names";
import { scrubUrl } from "@/lib/privacy";

const settle = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 2));
};

async function room(code = "ABCD") {
  const hub = createMemoryHub();
  const id = await generateIdentity();
  const host = new RoomHost(bsPokerGame, hub.factory(code), id, { playerId: "host", name: "Hana", role: "host", publicKey: id.publicKey, joinedAt: 1000 }, createRoom({ roomId: code, host: { id: "host", name: "Hana" } }));
  await host.start();
  const guest = async (playerId: string, trust: HostTrust = {}, identity?: Awaited<ReturnType<typeof generateIdentity>>) => {
    identity ??= await generateIdentity();
    const g = new RoomGuest<BsPokerAction, BsPokerView>(hub.factory(code), identity, { playerId, name: playerId, role: "guest", publicKey: identity.publicKey, joinedAt: 2000 }, trust);
    await g.start();
    return g;
  };
  return { hub, host, hostKey: id.publicKey, guest };
}

describe("the all-seeing view", () => {
  it("can't be had by calling yourself god", async () => {
    const { host, guest } = await room();
    await guest("ann");
    const god = await guest("god");
    await settle();
    host.act({ type: "START_GAME", playerId: "host", seed: 42 });
    await settle();
    const view = god.getSnapshot().view!;
    expect(view.godMode).toBe(false);
    expect(view.players.filter((p) => p.hand !== null).map((p) => p.id)).toEqual(["god"]);
  });

  it("only comes from the symbol, which can't cross the wire", () => {
    const s = createRoom({ roomId: "R", host: { id: "a", name: "A" } });
    expect(getPlayerView(s, "god").godMode).toBe(false);
    expect(getPlayerView(s, GOD_VIEW).godMode).toBe(true);
    expect(JSON.parse(JSON.stringify({ v: GOD_VIEW })).v).toBeUndefined();
  });
});

describe("impostor hosts", () => {
  it("can't take a guest who came by invite link, even claiming to be first", async () => {
    const { hub, hostKey, guest } = await room();
    const fake = await generateIdentity();
    const impostor = new RoomHost(bsPokerGame, hub.factory("ABCD"), fake, { playerId: "evil", name: "Hana", role: "host", publicKey: fake.publicKey, joinedAt: 0 }, createRoom({ roomId: "ABCD", host: { id: "evil", name: "Hana" } }));
    await impostor.start();
    const ann = await guest("ann", { fingerprint: await fingerprint(hostKey) });
    await settle();
    expect(ann.getSnapshot().status).toBe("seated");
    expect(ann.getSnapshot().view?.hostId).toBe("host");
  });

  it("are refused outright when they're the only one answering a link", async () => {
    const hub = createMemoryHub();
    const real = await generateIdentity();
    const fake = await generateIdentity();
    const impostor = new RoomHost(bsPokerGame, hub.factory("ABCD"), fake, { playerId: "evil", name: "Hana", role: "host", publicKey: fake.publicKey, joinedAt: 0 }, createRoom({ roomId: "ABCD", host: { id: "evil", name: "Hana" } }));
    await impostor.start();
    const identity = await generateIdentity();
    const ann = new RoomGuest<BsPokerAction, BsPokerView>(hub.factory("ABCD"), identity, { playerId: "ann", name: "Ann", role: "guest", publicKey: identity.publicKey, joinedAt: 2 }, { fingerprint: await fingerprint(real.publicKey) });
    await ann.start();
    await settle();
    expect(ann.getSnapshot().status).toBe("wrong-host");
    expect(ann.getSnapshot().view).toBeNull();
  });

  it("can't take over once a guest has found the real host", async () => {
    const { hub, guest } = await room();
    let pinned: string | null = null;
    const ann = await guest("ann", { onTrusted: (key) => (pinned = key) });
    await settle();
    expect(pinned).not.toBeNull();
    const fake = await generateIdentity();
    const impostor = new RoomHost(bsPokerGame, hub.factory("ABCD"), fake, { playerId: "evil", name: "Hana", role: "host", publicKey: fake.publicKey, joinedAt: 0 }, createRoom({ roomId: "ABCD", host: { id: "evil", name: "Hana" } }));
    await impostor.start();
    await settle();
    expect(ann.getSnapshot().view?.hostId).toBe("host");
  });
});

describe("the wire", () => {
  it("won't take a guest's own move back as the table", async () => {
    const { hub, host, guest } = await room();
    const wire: { event: string; payload: { sealed?: unknown } }[] = [];
    hub.tap("ABCD", (event, payload) => wire.push({ event, payload: payload as { sealed?: unknown } }));
    const ann = await guest("ann");
    await settle();
    host.act({ type: "START_GAME", playerId: "host", seed: 1 });
    await settle();
    const before = ann.getSnapshot().view;
    await ann.act({ type: "CALL_BS", playerId: "ann" } as BsPokerAction);
    await settle();
    const move = wire.find((w) => w.event === "action")!;
    const attacker = hub.factory("ABCD");
    await attacker.send("state", { envelopes: { ann: move.payload.sealed } });
    await attacker.send("chat", { envelopes: { ann: move.payload.sealed } });
    await settle();
    expect(ann.getSnapshot().view).toBeTruthy();
    expect(ann.getSnapshot().status).toBe("seated");
    expect(before).toBeTruthy();
  });

  it("drops presence that isn't well-formed: odd ids, fake keys, oversized names", () => {
    const key = "A".repeat(87) + "=";
    const kept = cleanMembers([
      { playerId: "__proto__", name: "x", role: "guest", publicKey: key, joinedAt: 1 },
      { playerId: "p_ok", name: "x", role: "guest", publicKey: "AAAA", joinedAt: 1 },
      { playerId: "p_ok", name: { evil: true }, role: "guest", publicKey: key, joinedAt: 1 },
      { playerId: "p_ok", name: "x", role: "admin", publicKey: key, joinedAt: 1 },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].name).toBe("Player");
    expect(isPlayerId("p_" + "a".repeat(18))).toBe(true);
    expect(isPlayerId("<img src=x>")).toBe(false);
  });

  it("keeps seating everyone else when someone announces a key that isn't on the curve", async () => {
    const { hub, host, guest } = await room();
    const junk = hub.factory("ABCD");
    await junk.connect({ playerId: "junk", name: "Junk", role: "guest", publicKey: "B".repeat(87) + "=", joinedAt: 1 });
    await guest("ann");
    await settle();
    expect(host.getState().players.map((p) => p.id)).toEqual(["host", "ann"]);
  });
});

describe("moves from other people's browsers", () => {
  it("can't set a name that isn't text, or hide characters in one", () => {
    let s = createParty({ roomCode: "ABCD", host: { id: "h", name: "Hana" } });
    s = applyPartyAction(s, { type: "JOIN", player: { id: "ann", name: "Ann" } }).state;
    const bad = applyPartyAction(s, { type: "GAME", playerId: "ann", action: { type: "RENAME_PLAYER", playerId: "ann", name: [{ x: 1 }] as unknown as string } });
    expect(bad.ok).toBe(false);
    expect(cleanName("Ha‮na​  \n x")).toBe("Hana x");
    expect(cleanName("   ")).toBeNull();
    expect(cleanName("x".repeat(50))).toHaveLength(20);
  });

  it("can't raise by something that isn't a whole number of chips at Bouillotte", () => {
    let s = createBouillotteRoom({ roomId: "R", host: { id: "a", name: "A" } });
    for (const id of ["b", "c"]) s = applyBouillotteAction(s, { type: "JOIN_ROOM", player: { id, name: id } }).state;
    s = applyBouillotteAction(s, { type: "START_GAME", playerId: "a", seed: 3 }).state;
    while (s.phase === "carre") s = applyBouillotteAction(s, { type: "CARRE", playerId: s.currentTurnId!, post: false }).state;
    const who = s.currentTurnId!;
    for (const to of ["abc", 2.5, null, NaN]) {
      const r = applyBouillotteAction(s, { type: "RAISE", playerId: who, to: to as number });
      expect(r.ok).toBe(false);
    }
    expect(s.players.every((p) => Number.isInteger(p.chips))).toBe(true);
  });
});

describe("locking a room", () => {
  it("turns newcomers away but lets anyone who had a seat come back", async () => {
    const { host, guest } = await room();
    // A refreshed tab keeps its keys (sessionStorage), so coming back is the same identity.
    const annKeys = await generateIdentity();
    const ann = await guest("ann", {}, annKeys);
    await settle();
    host.setLocked(true);
    const eve = await guest("eve");
    await settle();
    expect(eve.getSnapshot().status).toBe("rejected");
    expect(eve.getSnapshot().error?.message).toBe("This room is locked.");
    expect(host.getState().players.map((p) => p.id)).toEqual(["host", "ann"]);
    await ann.stop();
    await settle();
    expect(host.getState().players.map((p) => p.id)).toEqual(["host"]);
    await guest("ann", {}, annKeys);
    await settle();
    expect(host.getState().players.map((p) => p.id)).toEqual(["host", "ann"]);
    host.setLocked(false);
    await settle();
    expect(host.getState().players.map((p) => p.id)).toEqual(["host", "ann", "eve"]);
    expect(host.snapshot().locked).toBe(false);
  });
});

describe("the shuffle", () => {
  it("is ChaCha20 (RFC 8439, section 2.3.2 test vector)", () => {
    const key = Array.from({ length: 8 }, (_, i) => (((4 * i + 3) << 24) | ((4 * i + 2) << 16) | ((4 * i + 1) << 8) | (4 * i)) >>> 0);
    const out = chachaBlock(key, 1, [0x09000000, 0x4a000000, 0]);
    expect(out.map((w) => w.toString(16).padStart(8, "0"))).toEqual([
      "e4e7f110", "15593bd1", "1fdd0f50", "c47120a3", "c7f4d1c7", "0368c033", "9aaa2204", "4e6cd4c3",
      "466482d2", "09aa9f07", "05d7c214", "a2028bd9", "d19c12b5", "b94e16de", "e883d0cb", "4e3c50a2",
    ]);
  });

  it("is seeded with 256 bits online, and each table gets its own stream", () => {
    const seed = randomSeed();
    expect(seed).toHaveLength(8);
    const deck = createDeck(false);
    const a = shuffle(deck, seedRng(tableSeed(seed, 0))).result.map((c) => c.id);
    const b = shuffle(deck, seedRng(tableSeed(seed, 1))).result.map((c) => c.id);
    expect(a).not.toEqual(b);
    expect(new Set(a).size).toBe(52);
  });

  it("still reads an old host snapshot's numeric state", () => {
    const [r, next] = nextRandom(12345);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
    expect(next.c).toBe(1);
  });
});

describe("what leaves the browser", () => {
  it("keeps room codes and host keys out of analytics", () => {
    expect(scrubUrl("https://showdown.example/room/ABCD?game=war#h=abc")).toBe("https://showdown.example/room/[code]");
    expect(scrubUrl("https://showdown.example/war/room/ABCD")).toBe("https://showdown.example/war/room/[code]");
    expect(scrubUrl("https://showdown.example/rules")).toBe("https://showdown.example/rules");
  });

  it("makes room codes from the 24 letters, each equally likely", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 6000; i++) {
      const code = generateRoomCode();
      expect(isRoomCode(code)).toBe(true);
      for (const ch of code) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    expect(counts.size).toBe(24);
    for (const n of counts.values()) expect(n).toBeGreaterThan(700);
  });
});
