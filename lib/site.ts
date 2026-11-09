import { GAMES } from "@/lib/games";

/**
 * The site's public address, for links in the sitemap and in link previews. Vercel sets the production domain
 * (a custom domain once one is added); NEXT_PUBLIC_SITE_URL overrides it.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const SITE_TITLE = "Showdown: Play Card Games Online with Friends";

export const SITE_DESCRIPTION = `Free card games in the browser: ${Object.values(GAMES)
  .map((game) => game.title)
  .join(", ")}. Open a private room with friends or play solo against bots.`;

/** Title and description for a game's own page. */
export const gameMetadata = (title: string) => ({
  title: `Play ${title} Online | Showdown`,
  description: `Play ${title} online for free, with friends in a private room or solo against bots.`,
});
