import { describe, expect, it } from "vitest";
import type { Card } from "@/types/cards";
import type { ThirteenAction, ThirteenSettings, ThirteenState } from "@/types/thirteen";
import { applyThirteenAction, createThirteenRoom, getThirteenView, judgePlay, nextTrio, type PlayContext } from "@/lib/thirteen-engine";
import { beats, comboKey, describeCombo, findBombs, readCombos } from "@/lib/thirteen-combos";
import { thirteenBots } from "@/lib/bot-ai";
import { cards } from "@/components/rules/sample-cards";
import { seededRandom } from "@/lib/cards";

/** "3S 4H X X": cards, X a Joker. */
function hand(spec: string): Card[] {
  let jokers = 0;
  return spec
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((t) => (t === "X" ? [{ id: `JK${++jokers}`, kind: "joker" as const }] : cards(t)));
}

const best = (spec: string) => readCombos(hand(spec))[0];

function must(r: { ok: boolean; state: ThirteenState; error?: string }): ThirteenState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
const act = (s: ThirteenState, a: ThirteenAction) => must(applyThirteenAction(s, a));

function table(ids = ["a", "b", "c"], settings?: Partial<ThirteenSettings>) {
  let s = createThirteenRoom({ roomId: "t", host: { id: ids[0], name: ids[0] }, settings });
  for (const id of ids.slice(1)) s = act(s, { type: "JOIN_ROOM", player: { id, name: id } });
  return act(s, { type: "START_GAME", playerId: ids[0], seed: 7 });
}

/** Give a, b and c these hands, with `turn` to play and nothing on the table. */
function rig(s: ThirteenState, hands: [string, string, string], turn = "a"): ThirteenState {
  const n = structuredClone(s);
  n.seats!.forEach((x, i) => {
    x.hand = hand(hands[i]);
    x.passed = false;
  });
  n.currentTurnId = turn;
  n.openWith3S = false;
  n.trick = [];
  n.passStreak = 0;
  return n;
}
const play = (s: ThirteenState, by: string, spec: string, read?: string) =>
  act(s, { type: "PLAY", playerId: by, cardIds: hand(spec).map((c) => c.id), ...(read ? { read } : {}) });
const pass = (s: ThirteenState, by: string) => act(s, { type: "PASS", playerId: by });

describe("deal", () => {
  it("deals all 54 cards, 18 each, and the 3♠ opens", () => {
    const s = table();
    expect(s.seats!.map((x) => x.hand.length)).toEqual([18, 18, 18]);
    expect(s.seats!.flatMap((x) => x.hand).filter((c) => c.kind === "joker")).toHaveLength(2);
    const opener = s.seats!.find((x) => x.hand.some((c) => c.id === "3S"))!;
    expect(s.currentTurnId).toBe(opener.id);
    const other = opener.hand.find((c) => c.id !== "3S")!;
    expect(applyThirteenAction(s, { type: "PLAY", playerId: opener.id, cardIds: [other.id] }).ok).toBe(false);
    expect(applyThirteenAction(s, { type: "PLAY", playerId: opener.id, cardIds: ["3S"] }).ok).toBe(true);
  });

  it("needs three; a fourth watches, and the host can pick the three", () => {
    const s = table(["a", "b", "c", "d"], { seatIds: ["a", "c", "d"] });
    expect(s.seats!.map((x) => x.id)).toEqual(["a", "c", "d"]);
    const lonely = createThirteenRoom({ roomId: "t", host: { id: "a", name: "a" } });
    expect(applyThirteenAction(lonely, { type: "START_GAME", playerId: "a", seed: 1 }).ok).toBe(false);
  });

  it("hides the other hands", () => {
    const v = getThirteenView(table(), "a");
    expect(v.seats!.find((x) => x.id === "a")!.hand).toHaveLength(18);
    expect(v.seats!.filter((x) => x.id !== "a").every((x) => x.hand === null && x.count === 18)).toBe(true);
    expect("rngState" in v).toBe(false);
  });
});

describe("reading plays", () => {
  it("reads singles, pairs, triples and straights", () => {
    expect(best("9D").type).toBe("single");
    expect(best("8S 8H")).toMatchObject({ type: "pair", top: 8 });
    expect(best("QS QH QD")).toMatchObject({ type: "triple", top: 12 });
    expect(best("3S 4H 5D 6C")).toMatchObject({ type: "straight", top: 6, size: 4 });
    expect(readCombos(hand("3S 5H"))).toEqual([]);
  });

  it("never puts a 2 in a run", () => {
    expect(readCombos(hand("KS AS 2S"))).toEqual([]);
    expect(readCombos(hand("2S 2H 3S 3H 4S 4H"))).toEqual([]);
  });

  it("lets a Joker fill a straight, highest first", () => {
    const reads = readCombos(hand("JS QH KD X"));
    expect(reads.map((c) => c.top)).toEqual([14, 13]);
    expect(reads[0].jokerAs).toEqual([{ rank: 14 }]);
  });

  it("lets Jokers make five and six of a kind, even of 2s", () => {
    expect(best("7S 7H 7D 7C X")).toMatchObject({ type: "bomb", tier: 5, top: 7 });
    expect(best("2S 2H 2D 2C X X")).toMatchObject({ type: "bomb", tier: 8, top: 2 });
  });

  it("knows every shape of bomb", () => {
    expect(best("3S 3H 4S 4H 5S 5H").tier).toBe(1);
    expect(best("7S 7H 7D 7C").tier).toBe(2);
    expect(best("3S 3H 3D 4S 4H 4D").tier).toBe(3);
    expect(best("3S 3H 4S 4H 5S 5H 6S 6H").tier).toBe(4);
    expect(best("3S 3H 4S 4H 5S 5H 6S 6H 7S 7H").tier).toBe(6);
    expect(best("3S 3H 3D 4S 4H 4D 5S 5H 5D").tier).toBe(7);
    expect(best("3S 3H 4S 4H 5S 5H 6S 6H 7S 7H 8S 8H").tier).toBe(9);
    expect(best("3S 4H 5D 6C 7S 8H 9D TC JS QH KD AC").tier).toBe(10);
    expect(best("7S 7H 7D 7C 8S 8H 8D 8C").tier).toBe(11);
    expect(best("3S 3H 4S 4H 5S 5H 6S 6H 7S 7H 8S 8H 9S 9H").tier).toBe(12);
    expect(best("3S 3H 3D 4S 4H 4D 5S 5H 5D 6S 6H 6D").tier).toBe(13);
    expect(best("3H 4H 5H 6H 7H 8H 9H TH JH QH KH X")).toMatchObject({ tier: 14, jokerAs: [{ rank: 14, suit: "H" }] });
    expect(best("3S 3H 4S 4H 5S 5H 6S 6H 7S 7H 8S 8H 9S 9H TS TH").tier).toBe(15);
    expect(best("3S 3H 3D 3C 4S 4H 4D 4C 5S 5H 5D 5C").tier).toBe(16);
    expect(best("3S 3H 3D 3C X 4S 4H 4D 4C X").tier).toBe(17);
  });

  it("finds the bombs in a hand, Jokers included", () => {
    const found = findBombs(hand("9S 9D 9H X 3C 4D KS"));
    expect(found.map((b) => describeCombo(b.combo))).toContain("Four 9s");
    expect(found.find((b) => b.combo.tier === 2 && b.combo.top === 9)!.cards).toHaveLength(4);
  });
});

describe("beating plays", () => {
  it("climbs by kind and size; suits break ties", () => {
    expect(beats(best("8D 8H"), best("8S 8C"), "natural")).toBe(true);
    expect(beats(best("8S 8C"), best("8D 8H"), "natural")).toBe(false);
    expect(beats(best("4S 5H 6D 7C"), best("3S 4H 5D 6C"), "natural")).toBe(true);
    expect(beats(best("4S 5H 6D 7C 8S"), best("3S 4H 5D 6C"), "natural")).toBe(false);
    expect(beats(best("2S"), best("AH"), "natural")).toBe(true);
  });

  it("bombs beat only as many 2s as their tier allows", () => {
    const one = best("2S");
    const two = best("2S 2H");
    const three = best("2S 2H 2D");
    const pairs3 = best("3S 3H 4S 4H 5S 5H");
    const pairs4 = best("3S 3H 4S 4H 5S 5H 6S 6H");
    const suited = best("3H 4H 5H 6H 7H 8H 9H TH JH QH KH AH");
    expect(beats(pairs3, one, "natural")).toBe(true);
    expect(beats(pairs3, two, "natural")).toBe(false);
    expect(beats(pairs4, two, "natural")).toBe(true);
    expect(beats(pairs4, three, "natural")).toBe(false);
    expect(beats(suited, three, "natural")).toBe(true);
    // Never on anything but 2s or a bomb.
    expect(beats(pairs3, best("AS"), "natural")).toBe(false);
  });

  it("a higher tier always wins, then the higher top card", () => {
    expect(beats(best("7S 7H 7D 7C"), best("3S 3H 4S 4H 5S 5H"), "natural")).toBe(true);
    expect(beats(best("3S 3H 4S 4H 5S 5H 6S 6H 7S 7H"), best("9S 9H 9D 9C X"), "natural")).toBe(true);
    expect(beats(best("4S 4H 5S 5H 6S 6H"), best("3S 3H 4D 4C 5D 5C"), "natural")).toBe(true);
    expect(beats(best("3S 3H 4S 4H 5S 5H"), best("7S 7H 7D 7C"), "natural")).toBe(false);
  });

  it("settles equal bombs by the house rule", () => {
    const wild = best("3S 3H 4S 4H 5S X");
    const natural = best("3D 3C 4D 4C 5D 5C");
    expect(beats(natural, wild, "natural")).toBe(true);
    expect(beats(wild, natural, "natural")).toBe(false);
    expect(beats(natural, wild, "strict")).toBe(false);
    expect(beats(wild, natural, "challenger")).toBe(true);
    // Both natural: the higher suit in the top rank.
    expect(beats(best("3S 3C 4S 4C 5S 5H"), best("3D 3H 4D 4H 5D 5C"), "natural")).toBe(true);
  });

  it("explains why a play won't go", () => {
    const ctx: PlayContext = { top: best("8S 8C"), passed: false, bombAfterPass: true, tiebreak: "natural", needs3S: false };
    expect(judgePlay(ctx, hand("5S 5H")).reason).toBe("Doesn't beat Pair of 8s");
    expect(judgePlay(ctx, hand("7S 7H 7D 7C")).reason).toBe("Bombs only come down on 2s or a bomb");
    expect(judgePlay({ ...ctx, passed: true }, hand("9S 9H")).reason).toBe("You passed: only a bomb gets you back in");
  });
});

describe("tricks", () => {
  const base = () => rig(table(), ["5S 6S 9H KD", "7S 8C JD 2H", "4S TH QC 3H 3D 4H 4D 5H 5D"]);

  it("clears when everyone else passes; the last to play leads", () => {
    let s = play(base(), "a", "5S");
    s = play(s, "b", "7S");
    s = pass(s, "c");
    s = pass(s, "a");
    expect(s.trick).toEqual([]);
    expect(s.currentTurnId).toBe("b");
    expect(s.log.at(-1)).toMatchObject({ kind: "clear", leader: "b" });
  });

  it("locks out a player who passed", () => {
    let s = play(base(), "a", "5S");
    s = pass(s, "b");
    s = play(s, "c", "TH");
    // a passes; b passed earlier and the table can't be bombed: the trick goes back to c.
    s = pass(s, "a");
    expect(s.currentTurnId).toBe("c");
    expect(s.trick).toEqual([]);
  });

  it("lets someone who passed come back with a bomb on a 2 (unless the house says no)", () => {
    const upTo2 = (bombAfterPass: boolean) => {
      let s = rig(table(["a", "b", "c"], { bombAfterPass }), ["5S KS 6S", "8C 2H JD", "3H 3D 4H 4D 5H 5D QC"]);
      s = play(s, "a", "5S");
      s = play(s, "b", "8C");
      s = pass(s, "c");
      s = play(s, "a", "KS");
      return play(s, "b", "2H");
    };
    const on = upTo2(true);
    expect(on.currentTurnId).toBe("c");
    expect(play(on, "c", "3H 3D 4H 4D 5H 5D").trick.at(-1)).toMatchObject({ chop: "twos" });
    expect(applyThirteenAction(on, { type: "PLAY", playerId: "c", cardIds: ["QC"] }).ok).toBe(false);
    expect(upTo2(false).currentTurnId).toBe("a");
  });

  it("a passed player can't follow normally", () => {
    let s = rig(table(), ["5S 6S 7S", "8C 9C JD", "TH QC KC"]);
    s = play(s, "a", "5S");
    s = pass(s, "b");
    s = play(s, "c", "TH");
    expect(applyThirteenAction(s, { type: "PLAY", playerId: "a", cardIds: ["6S"] }).ok).toBe(false);
  });

  it("the first out wins and leads the next hand", () => {
    let s = rig(table(), ["AS", "3C 4C", "5C 6C"]);
    s = play(s, "a", "AS");
    expect(s.phase).toBe("game_over");
    expect(s.winnerId).toBe("a");
    s = act(s, { type: "RETURN_TO_LOBBY", playerId: "a" });
    s = act(s, { type: "START_GAME", playerId: "a", seed: 3 });
    expect(s.openWith3S).toBe(false);
    expect(s.currentTurnId).toBe("a");
  });

  it("plays a Joker the way the player picks", () => {
    const s = rig(table(), ["JS QH KD X 3S", "4C", "5C"]);
    const reads = readCombos(hand("JS QH KD X"));
    const low = reads.find((c) => c.top === 13)!;
    const next = play(s, "a", "JS QH KD X", comboKey(low));
    expect(next.trick[0].combo.top).toBe(13);
  });
});

describe("winner stays on", () => {
  it("whoever held the most cards makes way for the next in line", () => {
    let s = table(["a", "b", "c", "d", "e"], { winnerStaysOn: true });
    s = rig(s, ["AS", "3C 4C 5C", "6C"]);
    s = play(s, "a", "AS");
    expect(nextTrio(s)).toEqual(["a", "d", "c"]);
    s = act(s, { type: "RETURN_TO_LOBBY", playerId: "a" });
    expect(s.settings.seatIds).toEqual(["a", "d", "c"]);
  });
});

describe("bots", () => {
  for (const difficulty of ["easy", "medium", "hard"] as const) {
    it(`${difficulty} bots play a whole hand by the rules`, () => {
      let s = createThirteenRoom({ roomId: "t", host: { id: "a", name: "a", isBot: true, botDifficulty: difficulty } });
      for (const id of ["b", "c"]) s = act(s, { type: "JOIN_ROOM", player: { id, name: id, isBot: true, botDifficulty: difficulty } });
      s = act(s, { type: "START_GAME", playerId: "a", seed: 11 });
      const rng = seededRandom(5);
      for (let i = 0; i < 400 && s.phase === "playing"; i++) {
        const turn = thirteenBots.pending(s)!;
        s = act(s, thirteenBots.decide(s, turn.botId, rng)!);
      }
      expect(s.phase).toBe("game_over");
    });
  }

  it("decides the same whatever the others hold", () => {
    const s = table();
    s.players = s.players.map((p) => ({ ...p, isBot: true, botDifficulty: "hard" as const }));
    const who = s.currentTurnId!;
    const swapped = structuredClone(s);
    const [x, y] = swapped.seats!.filter((q) => q.id !== who);
    [x.hand, y.hand] = [y.hand, x.hand];
    expect(thirteenBots.decide(swapped, who, seededRandom(1))).toEqual(thirteenBots.decide(s, who, seededRandom(1)));
  });
});
