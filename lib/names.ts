/** Longest name a player can have, everywhere. */
export const NAME_MAX_LENGTH = 20;

/**
 * Invisible or direction-flipping characters: control codes, zero-width marks and bidi overrides
 * (which can make a name read as someone else's), and lone surrogate halves.
 */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁯﻿￹-￻]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/**
 * A player's name as the room keeps it, or null if there's nothing usable. Names arrive from
 * other people's browsers, so anything that isn't a string is refused.
 */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const clean = [...raw.replace(INVISIBLE, "").replace(/\s+/g, " ").trim()].slice(0, NAME_MAX_LENGTH).join("").trim();
  return clean || null;
}
