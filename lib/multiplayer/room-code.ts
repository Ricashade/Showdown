/** No I or O, so codes read cleanly off a phone across the room. */
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateRoomCode(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => LETTERS[b % LETTERS.length]).join("");
}

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

export const isRoomCode = (code: string) => /^[A-HJ-NP-Z]{4}$/.test(code);

export function randomId(prefix: string): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(9));
  return `${prefix}_${[...bytes].map((b) => b.toString(36).padStart(2, "0")).join("")}`;
}
