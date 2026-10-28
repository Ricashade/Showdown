import { describe, expect, it } from "vitest";
import type { WarAction, WarSettings, WarState } from "@/types/war";
import { applyWarAction, cardCount, createWarRoom, getWarView } from "@/lib/war-engine";
import { chooseWarCard, warBots } from "@/lib/bot-ai";
import { cards } from "@/components/rules/sample-cards";
import { seededRandom } from "@/lib/cards";

function must(r: { ok: boolean; state: WarState; error?: string }): WarState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
const act = (s: WarState, a: WarAction) => must(applyWarAction(s, a));
const flip = (s: WarState) => act(act(s, { type: "FLIP", playerId: "a" }), { type: "FLIP", playerId: "b" });

function game(ids = ["a", "b"], settings?: Partial<WarSettings>) {
  let s = createWarRoom({ roomId: "t", host: { id: ids[0], name: ids[0] }, settings });
  for (const id of ids.slice(1)) s = act(s, { type: "JOIN_ROOM", player: { id, name: id } });
  return act(s, { type: "START_GAME", playerId: ids[0], seed: 9 });
}

/** Give each side exactly these draw piles (top card first), empty won piles and hands. */
function rig(s: WarState, a: string, b: string, opts: { aWon?: string; handA?: string; handB?: string } = {}): WarState {
  const n = structuredClone(s);
  const [x, y] = n.sides!;
  x.draw = a ? cards(a) : [];
  y.draw = b ? cards(b) : [];
  x.won = opts.aWon ? cards(opts.aWon) : [];
  y.won = [];
  x.hand = opts.handA ? cards(opts.handA) : [];
  y.hand = opts.handB ? cards(opts.handB) : [];
  return n;
}

describe("setup", () => {
  it("splits the deck in half (27 each with Jokers)", () => {
    expect(game().sides!.map((x) => x.draw.length)).toEqual([26, 26]);
    expect(game(["a", "b"], { jokers: true }).sides!.map((x) => x.draw.length)).toEqual([27, 27]);
  });

  it("seats extra players as spectators; the host can pick the duelists", () => {
    const s = game(["a", "b", "c"]);
    expect(s.sides!.map((x) => x.id)).toEqual(["a", "b"]);
    expect(applyWarAction(s, { type: "FLIP", playerId: "c" }).ok).toBe(false);
    let l = createWarRoom({ roomId: "t", host: { id: "a", name: "a" } });
    for (const id of ["b", "c"]) l = act(l, { type: "JOIN_ROOM", player: { id, name: id } });
    l = act(l, { type: "UPDATE_SETTINGS", playerId: "a", settings: { duelistIds: ["c", "a"] } });
    expect(act(l, { type: "START_GAME", playerId: "a", seed: 1 }).sides!.map((x) => x.id)).toEqual(["c", "a"]);
  });
});

describe("battles", () => {
  it("the higher card takes both", () => {
    const s = flip(rig(game(), "KS 2C", "7H 3D"));
    expect(s.last).toMatchObject({ winnerId: "a", cards: 2, wars: 0 });
    expect(s.sides!.map(cardCount)).toEqual([3, 1]);
    expect(s.sides![0].won.map((c) => c.id).sort()).toEqual(["7H", "KS"]);
  });

  it("waits for both players to flip", () => {
    const s = act(rig(game(), "KS", "7H"), { type: "FLIP", playerId: "a" });
    expect(s.battles).toBe(0);
    expect(applyWarAction(s, { type: "FLIP", playerId: "a" }).ok).toBe(false);
  });

  it("a tie is a War: three down, one up, winner takes all ten", () => {
    let s = flip(rig(game(), "QS 2C 3C 4C AS 5S", "QH 6D 7D 8D 9H TS"));
    expect(s.stage).toBe("war");
    expect(s.wars).toBe(1);
    expect(getWarView(s, "a").table.a.map((c) => c?.id)).toEqual(["QS"]);
    s = flip(s);
    expect(s.last).toMatchObject({ winnerId: "a", cards: 10, wars: 1 });
    // The face-down bounty is shown once the War is settled.
    expect(s.last!.laid.b.map((l) => l.card.id)).toEqual(["QH", "6D", "7D", "8D", "9H"]);
    expect(s.last!.laid.b.every((l) => l.faceUp)).toBe(true);
    expect(s.sides!.map(cardCount)).toEqual([11, 1]);
  });

  it("keeps going through a double War", () => {
    let s = flip(rig(game(), "QS 2C 3C 4C 9S 2D 3D 4D KS", "QH 5H 6H 7H 9H 5D 6D 7D 8C"));
    s = flip(s);
    expect(s.stage).toBe("war");
    expect(s.wars).toBe(2);
    s = flip(s);
    expect(s.last).toMatchObject({ winnerId: "a", cards: 18, wars: 2 });
  });

  it("short stacks put down what they can and flip their last card", () => {
    // b has only 2 cards when the War starts: one goes down, the last decides it.
    let s = flip(rig(game(), "8S 2C 3C 4C 5C", "8H KD AH"));
    expect(s.stage).toBe("war");
    s = flip(s);
    expect(s.last!.laid.b.map((l) => l.card.id)).toEqual(["8H", "KD", "AH"]);
    expect(s.last!.winnerId).toBe("b");
  });

  it("losing every card in a War loses the game", () => {
    const s = flip(rig(game(), "8S 2C 3C 4C 5C", "8H"));
    expect(s.phase).toBe("game_over");
    expect(s.winnerId).toBe("a");
  });

  it("shuffles the won pile back in when the draw pile runs out", () => {
    let s = flip(rig(game(), "KS", "7H 2D", { aWon: "" }));
    expect(s.sides![0].draw).toHaveLength(0);
    s = flip(s);
    expect(s.battles).toBe(2);
    expect(s.sides![0].won.length + s.sides![0].draw.length).toBe(3);
  });
});

describe("winning", () => {
  it("Total Domination: the last card ends it", () => {
    const s = flip(rig(game(), "KS", "7H"));
    expect(s.phase).toBe("game_over");
    expect(s.winnerId).toBe("a");
  });

  it("Quick Match: first to 40 cards", () => {
    const filler = (n: number) => Array.from({ length: n }, (_, i) => ({ ...cards("2S")[0], id: `w${i}` }));
    const near = rig(game(["a", "b"], { winCondition: "forty" }), "KS", "7H 2D");
    near.sides![0].won = filler(37); // 38 cards; winning the 7 makes 39.
    expect(flip(near).phase).toBe("playing");
    near.sides![0].won = filler(38); // 39 cards; winning the 7 makes 40.
    const s = flip(near);
    expect(s.phase).toBe("game_over");
    expect(s.winnerId).toBe("a");
  });

  it("50-Battle Blitz: most cards after 50 battles", () => {
    let s = game(["a", "b"], { winCondition: "blitz" });
    while (s.phase === "playing") s = flip(s);
    expect(s.battles).toBeLessThanOrEqual(50);
    expect(s.winnerId).not.toBeNull();
  });
});

describe("what players see", () => {
  it("hides the deck order and face-down bounty cards", () => {
    const s = flip(rig(game(), "QS 2C 3C 4C AS", "QH 6D 7D 8D 9H"));
    const war = act(s, { type: "FLIP", playerId: "a" });
    const v = getWarView(war, "b");
    const json = JSON.stringify(v);
    for (const id of ["2C", "3C", "4C", "AS", "6D"]) expect(json).not.toContain(`"${id}"`);
    expect(v.sides![0].count).toBe(4);
  });
});

describe("Tactical War", () => {
  it("deals three-card hands and plays the card you pick", () => {
    let s = game(["a", "b"], { mode: "tactical" });
    expect(s.sides!.map((x) => x.hand.length)).toEqual([3, 3]);
    s = rig(s, "2C 3C", "4D 5D", { handA: "AS 7C 9C", handB: "KH 2H 8H" });
    expect(applyWarAction(s, { type: "FLIP", playerId: "a" }).ok).toBe(false);
    expect(getWarView(act(s, { type: "PLAY", playerId: "a", cardId: "AS" }), "b").sides![0].hand).toBeNull();
    s = act(act(s, { type: "PLAY", playerId: "a", cardId: "AS" }), { type: "PLAY", playerId: "b", cardId: "KH" });
    expect(s.last).toMatchObject({ winnerId: "a", cards: 2 });
    expect(s.sides!.map((x) => x.hand.length)).toEqual([3, 3]);
  });

  it("bots: Easy picks at random, Medium saves Aces and Kings, everyone goes big in a War", () => {
    const obs = { myId: "b", tactical: true, hand: cards("AS 9C 4D"), atWar: false, myCount: 26, theirCount: 26, tableUp: [], highTotal: 8 };
    expect(chooseWarCard(obs, "medium", Math.random).id).toBe("9C");
    expect(chooseWarCard({ ...obs, atWar: true }, "medium", Math.random).id).toBe("AS");
    expect(chooseWarCard({ ...obs, hand: cards("AS KC 4D") }, "hard", Math.random).id).toBe("KC");
  });
});

describe("bots play it out", () => {
  for (const mode of ["classic", "tactical"] as const) {
    it(`${mode}: bot against bot reaches a winner`, () => {
      for (let seed = 1; seed <= 6; seed++) {
        let s = createWarRoom({ roomId: "t", host: { id: "x", name: "x", isBot: true, botDifficulty: "hard" }, settings: { mode, winCondition: seed % 2 ? "forty" : "blitz" } });
        s = act(s, { type: "JOIN_ROOM", player: { id: "y", name: "y", isBot: true, botDifficulty: seed % 3 === 0 ? "easy" : "medium" } });
        s = act(s, { type: "START_GAME", playerId: "x", seed });
        const rng = seededRandom(seed);
        for (let i = 0; i < 20000 && s.phase === "playing"; i++) {
          const p = warBots.pending(s)!;
          s = act(s, warBots.decide(s, p.botId, rng)!);
        }
        expect(s.phase).toBe("game_over");
      }
    });
  }
});
