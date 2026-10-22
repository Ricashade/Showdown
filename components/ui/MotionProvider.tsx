"use client";

import { MotionConfig } from "framer-motion";

/** Honors the OS "reduce motion" setting for every Framer Motion animation. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
