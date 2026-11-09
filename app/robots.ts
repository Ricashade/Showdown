import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Room pages are one night's game behind a code: nothing to find in a search.
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/room/", "/*/room/"] },
    sitemap: new URL("/sitemap.xml", SITE_URL).href,
  };
}
