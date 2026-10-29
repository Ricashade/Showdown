/**
 * Bot banter: now and then a bot says something in the room chat when the table turns on it.
 * Read off two consecutive game states, so it runs wherever the full state lives (the online
 * host, or a local simulator) and every client simply sees the bot's chat line.
 */
import type { ActiveGameState } from "@/types/party";

export interface BanterLine {
  botId: string;
  text: string;
}

const LINES = {
  /** Someone called BS on a bot's bid, and it didn't hold. */
  caught: ["Okay, okay. You got me.", "I was testing you. You passed.", "That bid was a feeling, not a fact.", "I'll remember that, {name}.", "Fine. Deal me in again."],
  /** Someone called BS on a bot's bid, and it held. */
  held: ["Never doubt me, {name}.", "It was right there the whole time.", "Bold call. Wrong, but bold.", "Thanks for the card, {name}.", "Read 'em and weep."],
  /** A tie in War: cards go down for a War. */
  war: ["THIS. MEANS. WAR.", "Oh, it's on.", "Nobody blink.", "Three down, one up. Let's go.", "I've been waiting for this."],
  /** Go Fish: someone took a bot's cards. */
  robbed: ["Hey! Those were mine.", "{name}, really? All of them?", "I was saving those.", "Rude.", "Fine. Take them. See if I care."],
};

const pick = (lines: string[], name: string) => lines[Math.floor(Math.random() * lines.length)].replace("{name}", name);

/** What the bots might say about the move from `prev` to `next` (same game only). */
export function banterFor(prev: ActiveGameState | null, next: ActiveGameState): BanterLine[] {
  if (!prev || prev.mode !== next.mode) return [];
  const isBot = (id: string) => !!next.players.find((p) => p.id === id)?.isBot;
  const nameOf = (id: string) => next.players.find((p) => p.id === id)?.name ?? "someone";

  if (next.mode === "bs-poker" && prev.mode === "bs-poker") {
    const sd = next.showdown;
    if (!sd || sd.round === prev.showdown?.round || !isBot(sd.bidderId) || sd.callerId === sd.bidderId) return [];
    return [{ botId: sd.bidderId, text: pick(sd.loserId === sd.bidderId ? LINES.caught : LINES.held, nameOf(sd.callerId)) }];
  }

  if (next.mode === "war" && prev.mode === "war") {
    if (next.stage !== "war" || prev.stage === "war" || !next.sides) return [];
    const bot = next.sides.map((x) => x.id).find(isBot);
    return bot ? [{ botId: bot, text: pick(LINES.war, "") }] : [];
  }

  if (next.mode === "go-fish" && prev.mode === "go-fish") {
    const seen = prev.log.at(-1)?.n ?? -1;
    const lines: BanterLine[] = [];
    for (const e of next.log) {
      if (e.n <= seen || e.kind !== "ask" || e.got === 0 || !isBot(e.targetId)) continue;
      lines.push({ botId: e.targetId, text: pick(LINES.robbed, nameOf(e.askerId)) });
    }
    return lines.slice(0, 1);
  }

  return [];
}
