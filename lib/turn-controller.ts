/**
 * Turn controller: decides who acts next and, for bots, asks a BotController.
 *
 * No AI ships in Phase 1 — register a controller per difficulty later with
 * `registerBotController("easy", myEasyBot)` and `useBotTurns` will drive it.
 */
import type { BotDifficulty } from "@/types/game";
import type { BsPokerAction } from "@/types/bs-poker";
import type { BsPokerView, LegalActions } from "./bs-poker-game";

export type BotDecision =
  | Extract<BsPokerAction, { type: "PLACE_BID" }>
  | Extract<BsPokerAction, { type: "CALL_BS" }>;

export interface BotController {
  /** `view` is redacted to the bot's own POV — bots must not see other hands. */
  decide(view: BsPokerView, legal: LegalActions): BotDecision | Promise<BotDecision>;
}

const controllers: Partial<Record<BotDifficulty, BotController>> = {};

export function registerBotController(difficulty: BotDifficulty, controller: BotController) {
  controllers[difficulty] = controller;
}

export function getBotController(difficulty: BotDifficulty = "medium"): BotController | undefined {
  return controllers[difficulty];
}

export const hasBotController = (difficulty?: BotDifficulty) => !!getBotController(difficulty);
