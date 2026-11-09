/**
 * Lines about a player read right when that player is you (solo play names you "You"):
 * "Ann wins", "You win"; "Ann is out", "You are out"; "asks Ann", "asks you".
 */

const isYou = (name: string) => name === "You";

/** The name and a verb that agrees with it: `says("Ann", "wins", "win")` is "Ann wins", for you "You win". */
export const says = (name: string, verb: string, youVerb: string) => (isYou(name) ? `You ${youVerb}` : `${name} ${verb}`);

/** A name later in a sentence: "you" rather than "You". */
export const them = (name: string) => (isYou(name) ? "you" : name);

/** Whose: "Ann's", for you "Your". */
export const whose = (name: string) => (isYou(name) ? "Your" : `${name}'s`);
