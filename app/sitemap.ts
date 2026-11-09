import type { MetadataRoute } from "next";
import { GAMES } from "@/lib/games";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", ...Object.values(GAMES).map((game) => game.path), "/rules"];
  return paths.map((path) => ({ url: new URL(path, SITE_URL).href, priority: path === "/" ? 1 : 0.8 }));
}
