/**
 * What identifies a room never goes to analytics: room codes become "[code]", and the "#h=…" host
 * key and any query string are dropped.
 */
export function scrubUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/room\/[^/]+/gi, "/room/[code]");
    return url.toString();
  } catch {
    return raw.split(/[?#]/)[0];
  }
}
