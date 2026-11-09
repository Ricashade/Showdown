"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { scrubUrl } from "@/lib/privacy";

/** Page-view counts and load times, without room codes or host keys (see scrubUrl). */
export function Telemetry() {
  return (
    <>
      <Analytics beforeSend={(event) => ({ ...event, url: scrubUrl(event.url) })} />
      <SpeedInsights beforeSend={(event) => ({ ...event, url: scrubUrl(event.url) })} />
    </>
  );
}
