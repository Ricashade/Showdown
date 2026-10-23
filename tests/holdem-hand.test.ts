import { describe, expect, it } from "vitest";
import { bestHand, compareHands } from "@/lib/holdem-hand";
import { cards } from "@/components/rules/sample-cards";

const best = (s: string) => bestHand(cards(s));
const beats = (a: string, b: string) => compareHands(best(a), best(b));

describe("hand ranking", () => {
  it("names each category", () => {
    expect(best("TS JS QS KS AS 2D 3C").label).toBe("Royal flush");
    expect(best("5H 6H 7H 8H 9H KD KC").label).toBe("Straight flush, Nine high");
    expect(best("AS AH AD AC 2D 3C 9S").label).toBe("Four Aces");
    expect(best("TS TH TD 4C 4H 2S 3D").label).toBe("Tens full of Fours");
    expect(best("KH 9H 7H 4H 3H 2S 2D").label).toBe("Flush, King high");
    expect(best("4H 5C 6D 7S 8H KC KD").label).toBe("Straight, Eight high");
    expect(best("7S 7H 7D KC 2H 3S 9D").label).toBe("Three Sevens");
    expect(best("JS JD 4H 4C 9S 2D 3C").label).toBe("Two pair, Jacks and Fours");
    expect(best("KS KH 9D 7C 4S 3H 2D").label).toBe("Pair of Kings");
    expect(best("AS JH 9D 7C 4S 3H 2D").label).toBe("Ace high");
  });

  it("orders categories", () => {
    expect(beats("2S 3S 4S 5S 6S 9D KC", "AS AH AD AC 2D 3C 9S")).toBeGreaterThan(0);
    expect(beats("TS TH TD 4C 4H 2S 3D", "KH 9H 7H 4H 3H 2S 2D")).toBeGreaterThan(0);
    expect(beats("KH 9H 7H 4H 3H 2S 2D", "AS KH QD JC TS 2D 3C")).toBeGreaterThan(0);
  });

  it("treats A-2-3-4-5 as the lowest straight", () => {
    expect(best("AS 2H 3D 4C 5S KD QC").label).toBe("Straight, Five high");
    expect(beats("2S 3H 4D 5C 6S KD QC", "AS 2H 3D 4C 5S KD QC")).toBeGreaterThan(0);
    expect(best("AH 2H 3H 4H 5H KD QC").label).toBe("Straight flush, Five high");
  });

  it("uses the best five of seven", () => {
    // Board flush beats the pair in hand.
    expect(best("AH KH 9H 4H 2H 2S 2D").label).toBe("Flush, Ace high");
    // Two full houses available: pick the higher trips.
    expect(best("KS KH KD 4C 4H 4S 2D").label).toBe("Kings full of Fours");
    // Three pairs: best two, best kicker.
    expect(best("AS AH KD KC 2S 2H 9D").ranks).toEqual([14, 13, 9]);
  });
});

describe("kickers and ties", () => {
  it("compares kickers down the line", () => {
    expect(beats("KS KH AD 7C 4S 3H 2D", "KD KC QD 7S 4H 3C 2S")).toBeGreaterThan(0);
    expect(beats("KS KH AD 8C 4S 3H 2D", "KD KC AH 7S 4H 3C 2S")).toBeGreaterThan(0);
    expect(beats("JS JD 4H 4C AS 2D 3C", "JH JC 4S 4D KS 2H 3D")).toBeGreaterThan(0);
    expect(beats("AH KH 9H 4H 3H", "AD KD 9D 4D 2D")).toBeGreaterThan(0);
  });

  it("is an exact tie when the best five match (board plays)", () => {
    // Board: A K Q J T straight; both players' hole cards don't matter.
    expect(beats("AS KD QC JH TS 2C 3D", "AS KD QC JH TS 4H 5S")).toBe(0);
    // Same pair, same three kickers; the 6th/7th cards don't count.
    expect(beats("9S 9H AD KC QS 3H 2D", "9D 9C AH KS QD 4C 3S")).toBe(0);
  });
});

describe("fast hand score", () => {
  it("orders hands exactly like the full evaluator", async () => {
    const { createDeck, seededRandom, shuffle } = await import("@/lib/cards");
    const { handScore } = await import("@/lib/holdem-hand");
    const rng = seededRandom(42);
    for (let i = 0; i < 3000; i++) {
      const { result: deck } = shuffle(createDeck(false), Math.floor(rng() * 2 ** 32));
      const a = deck.slice(0, 7);
      const b = deck.slice(7, 14);
      const slow = Math.sign(compareHands(bestHand(a), bestHand(b)));
      const fast = Math.sign(handScore(a) - handScore(b));
      if (slow !== fast) throw new Error(`Mismatch: ${a.map((c) => c.id)} vs ${b.map((c) => c.id)}`);
    }
    expect(true).toBe(true);
  });

  it("scores tricky cases", async () => {
    const { handScore } = await import("@/lib/holdem-hand");
    const s = (x: string) => handScore(cards(x));
    expect(s("AS 2H 3D 4C 5S KD QC")).toBeLessThan(s("2S 3H 4D 5C 6S KD QC")); // wheel is lowest
    expect(s("KS KH KD 4C 4H 4S 2D")).toBe(s("KC KH KD 4C 4D 2S 3S")); // trips+trips plays as full house
    expect(s("AS AH KD KC 2S 2H 9D")).toBeGreaterThan(s("AS AH KD KC 2S 2H 8D")); // kicker after two pair
  });
});
