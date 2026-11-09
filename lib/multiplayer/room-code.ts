/** No I or O, so codes read cleanly off a phone across the room. */
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Four letters, each equally likely (bytes past the last whole multiple of 24 are drawn again). */
export function generateRoomCode(): string {
  const limit = 256 - (256 % LETTERS.length);
  let code = "";
  while (code.length < 4) {
    for (const b of globalThis.crypto.getRandomValues(new Uint8Array(8))) {
      if (b < limit && code.length < 4) code += LETTERS[b % LETTERS.length];
    }
  }
  return code;
}

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

export const isRoomCode = (code: string) => /^[A-HJ-NP-Z]{4}$/.test(code);

export function randomId(prefix: string): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(9));
  return `${prefix}_${[...bytes].map((b) => b.toString(36).padStart(2, "0")).join("")}`;
}

/**
 * A usable player id: starts with a letter, then up to 39 letters, digits, "_" or "-" (`randomId`
 * makes "p_…" and "h_…"). Ids arrive from other people's browsers and key seats, keys and
 * envelopes, so nothing else (no "__proto__", no markup, no megabyte strings) is let in.
 */
export const isPlayerId = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(x);
