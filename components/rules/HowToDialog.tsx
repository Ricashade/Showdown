"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { cards } from "./sample-cards";

type Tab = "guide" | "demo";

interface HowToDialogProps {
  title: string;
  /** `showDemo` switches to the demo tab. */
  guide: (showDemo: () => void) => React.ReactNode;
  /** `exit` goes back to the guide. */
  demo: (exit: () => void) => React.ReactNode;
  initialTab?: Tab;
  /** What the demo tab is called ("Quick demo" unless a game says otherwise). */
  demoLabel?: string;
  onClose: () => void;
}

/** A game's rules guide and quick scripted demo, in one dialog. */
export function HowToDialog({ title, guide, demo, initialTab = "guide", demoLabel = "Quick demo", onClose }: HowToDialogProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="howto-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] bg-smoke-raised shadow-2xl ring-1 ring-leather-lit"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-leather-lit px-5 py-4 sm:px-8">
          <h2 id="howto-title" className="mr-auto font-display text-3xl font-extrabold text-bone sm:text-4xl">
            {title}
          </h2>
          <div role="tablist" aria-label="How to play" className="flex gap-1 rounded-full bg-smoke p-1 ring-1 ring-leather-lit">
            {(["guide", "demo"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={clsx("min-h-10 rounded-full px-4 text-sm font-bold transition", tab === t ? "bg-brass text-smoke" : "text-parchment hover:text-bone")}
              >
                {t === "guide" ? "Guide" : demoLabel}
              </button>
            ))}
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="grid size-11 place-items-center rounded-full text-bone hover:bg-black/30">
            <X className="size-5" />
          </button>
        </div>

        <div role="tabpanel" className="overflow-y-auto px-5 py-6 sm:px-8">
          {tab === "guide" ? guide(() => setTab("demo")) : demo(() => setTab("guide"))}
        </div>
      </div>
    </motion.div>
  );
}

/** A titled block of the guide. */
export function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-3xl bg-smoke/70 p-5 ring-1 ring-leather-lit", className)}>
      <h3 className="font-display text-2xl font-bold text-bone">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** A few small cards, overlapped. `spec` as in sample-cards ("AS KH"). */
export function Fan({ spec }: { spec: string }) {
  return (
    <div className="flex shrink-0">
      {cards(spec).map((c, i) => (
        <div key={c.id} className={clsx(i > 0 && "-ml-5")}>
          <PlayingCard card={c} size="sm" entrance={false} />
        </div>
      ))}
    </div>
  );
}

/** Bulleted tips. */
export function Tips({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-x-8 gap-y-2 text-base text-parchment sm:grid-cols-2">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brass" />
          {t}
        </li>
      ))}
    </ul>
  );
}

export interface DemoStepTiming {
  /** How long this step shows before moving on by itself; 0 for the last. */
  ms: number;
}

/** Steps a scripted demo forward on its own; a press moves it on sooner. */
export function useDemoSteps(steps: readonly DemoStepTiming[]) {
  const [step, setStep] = useState(0);
  const last = step === steps.length - 1;
  const ms = steps[step].ms;
  useEffect(() => {
    if (last) return;
    const t = setTimeout(() => setStep((n) => n + 1), ms);
    return () => clearTimeout(t);
  }, [step, last, ms]);
  const elapsed = steps.slice(0, step).reduce((n, x) => n + x.ms, 0);
  const total = steps.reduce((n, x) => n + x.ms, 0);
  return { step, last, next: () => setStep((n) => Math.min(n + 1, steps.length - 1)), restart: () => setStep(0), progress: elapsed / total };
}

/** The demo's progress bar and its way out. */
export function DemoBar({ progress, onExit }: { progress: number; onExit: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-smoke">
        <div className="h-full bg-brass transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
      </div>
      <button onClick={onExit} className="min-h-10 rounded-full bg-bone px-4 text-sm font-bold text-smoke hover:bg-parchment">
        Exit demo
      </button>
    </div>
  );
}
