import { describe, expect, it } from "vitest";
import type { Card, Rank, Suit } from "@/types/cards";
import type { Bid } from "@/types/bs-poker";
import {
  bidLabel,
  bidPhrase,
  compareBids,
  DEFAULT_SETTINGS,
  doesHandExistInPool,
  evaluateBid,
  getDisabledHandTypes,
  getLegalBids,
  getMinimumBid,
  isBidHigher,
} from "@/lib/bs-poker-engine";

const R: Record<string, Rank> = { A: 14, K: 13, Q: 12, J: 11, T: 10, "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2 };

/** Parse "AS KH TD 2C JK" into cards. */
function cards(s: string): Card[] {
  return s.split(/\s+/).filter(Boolean).map((t, i) =>
    t === "JK" ? { id: `JK${i}`, kind: "joker" } : { id: t, kind: "standard", rank: R[t[0]], suit: t[1] as Suit },
  );
}

const plain = { deucesWild: false };
const deuces = { deucesWild: true };
const has = (bid: Bid, pool: string, s = plain) => doesHandExistInPool(bid, cards(pool), s);

describe("bid ordering", () => {
  it("orders categories", () => {
    const ladder: Bid[] = [
      { type: "HIGH_CARD", rank: 14 },
      { type: "PAIR", rank: 2 },
      { type: "TWO_PAIR", high: 3, low: 2 },
      { type: "THREE_OF_A_KIND", rank: 2 },
      { type: "STRAIGHT", high: 5 },
      { type: "FLUSH", high: 6 },
      { type: "FULL_HOUSE", trips: 2, pair: 3 },
      { type: "FOUR_OF_A_KIND", rank: 2 },
      { type: "STRAIGHT_FLUSH", high: 5 },
    ];
    for (let i = 1; i < ladder.length; i++) expect(isBidHigher(ladder[i], ladder[i - 1])).toBe(true);
  });

  it("compares within a category", () => {
    expect(isBidHigher({ type: "PAIR", rank: 11 }, { type: "PAIR", rank: 10 })).toBe(true);
    expect(isBidHigher({ type: "PAIR", rank: 10 }, { type: "PAIR", rank: 10 })).toBe(false);
    expect(isBidHigher({ type: "TWO_PAIR", high: 11, low: 5 }, { type: "TWO_PAIR", high: 11, low: 4 })).toBe(true);
    expect(isBidHigher({ type: "TWO_PAIR", high: 12, low: 2 }, { type: "TWO_PAIR", high: 11, low: 10 })).toBe(true);
    expect(isBidHigher({ type: "FULL_HOUSE", trips: 3, pair: 2 }, { type: "FULL_HOUSE", trips: 2, pair: 14 })).toBe(true);
    expect(isBidHigher({ type: "STRAIGHT", high: 6 }, { type: "STRAIGHT", high: 5 })).toBe(true);
  });

  it("rejects malformed bids", () => {
    expect(isBidHigher({ type: "TWO_PAIR", high: 4, low: 11 }, null)).toBe(false);
    expect(isBidHigher({ type: "FULL_HOUSE", trips: 9, pair: 9 }, null)).toBe(false);
    expect(isBidHigher({ type: "STRAIGHT", high: 4 }, null)).toBe(false);
    expect(isBidHigher({ type: "FLUSH", high: 5 }, null)).toBe(false);
  });

  it("enumerates a strictly increasing ladder", () => {
    const all = getLegalBids(null);
    expect(all.length).toBe(13 + 13 + 78 + 13 + 10 + 9 + 156 + 13 + 10);
    for (let i = 1; i < all.length; i++) expect(compareBids(all[i], all[i - 1])).toBeGreaterThan(0);
  });

  it("skips banned hand types and keeps the rest of the ladder", () => {
    const noFlush = getLegalBids(null, ["FLUSH"]);
    expect(noFlush.some((b) => b.type === "FLUSH")).toBe(false);
    expect(noFlush.some((b) => b.type === "STRAIGHT_FLUSH")).toBe(true);
    expect(getMinimumBid({ type: "STRAIGHT", high: 14 }, ["FLUSH"])).toEqual({ type: "FULL_HOUSE", trips: 2, pair: 3 });
    expect(getMinimumBid({ type: "STRAIGHT", high: 14 })).toEqual({ type: "FLUSH", high: 6 });
    expect(getMinimumBid({ type: "THREE_OF_A_KIND", rank: 14 }, ["STRAIGHT"])).toEqual({ type: "FLUSH", high: 6 });
    expect(getMinimumBid({ type: "FOUR_OF_A_KIND", rank: 14 }, ["STRAIGHT_FLUSH"])).toBeNull();
    expect(getMinimumBid({ type: "STRAIGHT_FLUSH", high: 14 })).toBeNull();
  });

  it("isBidHigher rejects banned hand types", () => {
    expect(isBidHigher({ type: "STRAIGHT", high: 9 }, { type: "PAIR", rank: 2 }, ["STRAIGHT"])).toBe(false);
    expect(isBidHigher({ type: "FLUSH", high: 9 }, { type: "PAIR", rank: 2 }, ["STRAIGHT"])).toBe(true);
  });

  it("labels", () => {
    expect(bidLabel({ type: "FULL_HOUSE", trips: 10, pair: 4 })).toBe("Tens full of Fours");
    expect(bidLabel({ type: "STRAIGHT_FLUSH", high: 14 })).toBe("Royal flush");
    expect(bidLabel({ type: "HIGH_CARD", rank: 14 })).toBe("An Ace");
    expect(bidLabel({ type: "HIGH_CARD", rank: 2 })).toBe("A Two");
    expect(bidPhrase({ type: "HIGH_CARD", rank: 2 })).toBe("a Two");
    expect(bidPhrase({ type: "THREE_OF_A_KIND", rank: 13 })).toBe("three Kings");
    expect(bidPhrase({ type: "FULL_HOUSE", trips: 3, pair: 2 })).toBe("Threes full of Twos");
    expect(bidPhrase({ type: "STRAIGHT", high: 5 })).toBe("Five-high straight");
    expect(bidLabel({ type: "TWO_PAIR", high: 11, low: 4 })).toBe("Two pair, Jacks and Fours");
  });
});

describe("rank-count hands", () => {
  it("high card / pair / trips / quads", () => {
    expect(has({ type: "HIGH_CARD", rank: 13 }, "KH")).toBe(true);
    expect(has({ type: "HIGH_CARD", rank: 14 }, "KH")).toBe(false);
    expect(has({ type: "PAIR", rank: 10 }, "TH TS")).toBe(true);
    expect(has({ type: "PAIR", rank: 10 }, "TH 9S")).toBe(false);
    expect(has({ type: "THREE_OF_A_KIND", rank: 7 }, "7H 7S 7D")).toBe(true);
    expect(has({ type: "FOUR_OF_A_KIND", rank: 7 }, "7H 7S 7D 3C")).toBe(false);
  });

  it("two pair and full house need distinct ranks", () => {
    expect(has({ type: "TWO_PAIR", high: 11, low: 4 }, "JH JS 4D 4C")).toBe(true);
    expect(has({ type: "TWO_PAIR", high: 11, low: 4 }, "JH JS JD 4C")).toBe(false);
    expect(has({ type: "FULL_HOUSE", trips: 10, pair: 4 }, "TH TS TD 4C 4H")).toBe(true);
    expect(has({ type: "FULL_HOUSE", trips: 4, pair: 10 }, "TH TS TD 4C 4H")).toBe(false);
  });

  it("works with fewer than five cards in the pool", () => {
    expect(has({ type: "PAIR", rank: 5 }, "5H 5C")).toBe(true);
    expect(has({ type: "STRAIGHT", high: 5 }, "AH 2C 3D 4S")).toBe(false);
  });
});

describe("straights", () => {
  it("normal and wheel", () => {
    expect(has({ type: "STRAIGHT", high: 8 }, "4H 5C 6D 7S 8H KC")).toBe(true);
    expect(has({ type: "STRAIGHT", high: 9 }, "4H 5C 6D 7S 8H KC")).toBe(false);
    expect(has({ type: "STRAIGHT", high: 5 }, "AH 2C 3D 4S 5H")).toBe(true);
    expect(has({ type: "STRAIGHT", high: 14 }, "TH JC QD KS AH")).toBe(true);
  });

  it("no wrap-around", () => {
    expect(has({ type: "STRAIGHT", high: 6 }, "AH 2C 3D 4S 5H")).toBe(false);
  });
});

describe("flushes", () => {
  it("X-high flush needs exactly X as the top card of one suit", () => {
    expect(has({ type: "FLUSH", high: 13 }, "KH 9H 7H 4H 3H")).toBe(true);
    expect(has({ type: "FLUSH", high: 14 }, "KH 9H 7H 4H 3H")).toBe(false);
    // A higher card of the suit doesn't block: K Q J 9 3 is still there.
    expect(has({ type: "FLUSH", high: 13 }, "AH KH QH JH 9H 3H")).toBe(true);
    // No K♥ at all → no K-high flush, even though an A-high flush exists.
    expect(has({ type: "FLUSH", high: 13 }, "AH QH JH 9H 3H")).toBe(false);
    // Needs 4 cards BELOW the top card.
    expect(has({ type: "FLUSH", high: 9 }, "AH KH 9H 4H 3H")).toBe(false);
  });

  it("mixed suits are not a flush", () => {
    expect(has({ type: "FLUSH", high: 13 }, "KH 9H 7H 4H 3S")).toBe(false);
  });

  it("straight flush and royal", () => {
    expect(has({ type: "STRAIGHT_FLUSH", high: 14 }, "TS JS QS KS AS")).toBe(true);
    expect(has({ type: "STRAIGHT_FLUSH", high: 14 }, "TS JS QS KS AH")).toBe(false);
    expect(has({ type: "STRAIGHT_FLUSH", high: 5 }, "AD 2D 3D 4D 5D")).toBe(true);
  });

  it("banned hand types never exist", () => {
    const ban = (t: Bid["type"]) => ({ disabledHandTypes: [t] });
    expect(doesHandExistInPool({ type: "FLUSH", high: 13 }, cards("KH 9H 7H 4H 3H"), plain, ban("FLUSH"))).toBe(false);
    expect(doesHandExistInPool({ type: "FLUSH", high: 13 }, cards("KH 9H 7H 4H 3H"), plain, ban("STRAIGHT"))).toBe(true);
    expect(doesHandExistInPool({ type: "STRAIGHT", high: 8 }, cards("4H 5C 6D 7S 8H"), plain, ban("STRAIGHT"))).toBe(false);
    expect(doesHandExistInPool({ type: "STRAIGHT_FLUSH", high: 14 }, cards("TS JS QS KS AS"), plain, ban("STRAIGHT_FLUSH"))).toBe(false);
    expect(evaluateBid({ type: "STRAIGHT", high: 8 }, cards("4H"), plain, ban("STRAIGHT")).summary).toBe("Straights are banned this round.");
  });

  it("each hand type has its own rule and threshold", () => {
    const rules = {
      STRAIGHT: { mode: "threshold" as const, threshold: 4 },
      FLUSH: { mode: "threshold" as const, threshold: 2 },
      STRAIGHT_FLUSH: { mode: "disabled" as const, threshold: 3 },
    };
    expect(getDisabledHandTypes({ handRules: rules }, [1, 1])).toEqual(["STRAIGHT_FLUSH"]);
    expect(getDisabledHandTypes({ handRules: rules }, [1, 2])).toEqual(["FLUSH", "STRAIGHT_FLUSH"]);
    expect(getDisabledHandTypes({ handRules: rules }, [4, 1])).toEqual(["STRAIGHT", "FLUSH", "STRAIGHT_FLUSH"]);
    expect(getDisabledHandTypes(DEFAULT_SETTINGS, [6, 6])).toEqual([]);
  });
});

describe("wild cards", () => {
  it("2s are natural when deuces are not wild", () => {
    expect(has({ type: "PAIR", rank: 9 }, "9H 2C")).toBe(false);
    expect(has({ type: "PAIR", rank: 2 }, "2H 2C")).toBe(true);
  });

  it("deuces wild fill rank groups", () => {
    expect(has({ type: "PAIR", rank: 9 }, "9H 2C", deuces)).toBe(true);
    expect(has({ type: "THREE_OF_A_KIND", rank: 9 }, "9H 2C", deuces)).toBe(false);
    expect(has({ type: "FULL_HOUSE", trips: 9, pair: 4 }, "9H 9S 2C 4D 2H", deuces)).toBe(true);
    expect(has({ type: "FULL_HOUSE", trips: 9, pair: 4 }, "9H 9S 2C 4D", deuces)).toBe(false);
    // A wild 2 can still be a 2.
    expect(has({ type: "PAIR", rank: 2 }, "2H 2C", deuces)).toBe(true);
    expect(has({ type: "PAIR", rank: 2 }, "2H 3C", deuces)).toBe(false);
  });

  it("jokers are wild", () => {
    expect(has({ type: "FOUR_OF_A_KIND", rank: 14 }, "AH AS JK JK")).toBe(true);
    expect(has({ type: "HIGH_CARD", rank: 14 }, "JK")).toBe(true);
    expect(has({ type: "TWO_PAIR", high: 13, low: 12 }, "KH QS JK JK")).toBe(true);
  });

  it("wilds fill straights", () => {
    expect(has({ type: "STRAIGHT", high: 9 }, "5H 6C 8D 9S JK")).toBe(true);
    expect(has({ type: "STRAIGHT", high: 9 }, "5H 6C 8D JK")).toBe(false);
    // Deuces wild: the 2 can't also be the natural 2 of a wheel AND fill a gap.
    expect(has({ type: "STRAIGHT", high: 5 }, "AH 2C 3D 4S", deuces)).toBe(false);
    expect(has({ type: "STRAIGHT", high: 5 }, "AH 2C 3D 4S 2D", deuces)).toBe(true);
  });

  it("wilds fill flushes, including the top card", () => {
    expect(has({ type: "FLUSH", high: 14 }, "KH 9H 7H 4H JK")).toBe(true);
    expect(has({ type: "FLUSH", high: 14 }, "AH 9H 7H JK JK")).toBe(true);
    expect(has({ type: "FLUSH", high: 14 }, "AH 9H 7H JK")).toBe(false);
    // Deuces wild: 2♥ is a wild, not a natural heart — but wilds can be any heart, so still a flush.
    expect(has({ type: "FLUSH", high: 6 }, "6H 5H 4H 3H 2H", deuces)).toBe(true);
    expect(has({ type: "STRAIGHT_FLUSH", high: 9 }, "5S 6S 8S 9S 2D", deuces)).toBe(true);
    expect(has({ type: "STRAIGHT_FLUSH", high: 9 }, "5S 6S 8S 9H 2D", deuces)).toBe(false);
  });

  it("reports matching cards and wild assignments", () => {
    const ev = evaluateBid({ type: "PAIR", rank: 9 }, cards("9H KC JK"), plain);
    expect(ev.exists).toBe(true);
    expect(ev.cardIds.sort()).toEqual(["9H", "JK2"].sort());
    expect(ev.wildAssignments).toEqual([{ cardId: "JK2", rank: 9 }]);
    expect(ev.summary).toMatch(/using 1 wild/);
  });

  it("explains failures", () => {
    const ev = evaluateBid({ type: "STRAIGHT", high: 9 }, cards("5H 6C 9S"), plain);
    expect(ev.exists).toBe(false);
    expect(ev.summary).toBe("Missing 7 and 8, with no wilds to fill the gaps.");
    expect(evaluateBid({ type: "PAIR", rank: 2 }, cards("5H"), plain).summary).toBe("No Twos and no wilds on the table.");
    expect(evaluateBid({ type: "PAIR", rank: 10 }, cards("TH 5S"), plain).summary).toBe("Only 1 Ten and no wilds on the table.");
  });
});
