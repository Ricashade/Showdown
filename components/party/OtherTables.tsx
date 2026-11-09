"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { Eye, X } from "lucide-react";
import { WatchingContext } from "@/components/table/watching";

/** How far down the screen a table's header runs; copies are cropped below it. */
const HEADER_CROP = 64;
/** The mini view's width, sized to sit in the margin beside every game's table. */
const MINI_WIDTH = 128;
/** Narrower than this, the margin can't hold a mini view: a small tab stands in for it. */
const ROOM_FOR_MINI = 1152 + 2 * (MINI_WIDTH + 24);

function subscribe(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
const size = () => `${window.innerWidth}x${window.innerHeight}`;
/** The window's size, which every copy of a table is laid out at before it's scaled down. */
function useViewport() {
  const s = useSyncExternalStore(subscribe, size, () => "1440x900");
  const [w, h] = s.split("x").map(Number);
  return { w, h };
}

/** A read-only copy of a table screen at the window's own size, scaled to `width` and cropped below the header. */
function Scaled({ width, children }: { width: number; children: React.ReactNode }) {
  const { w, h } = useViewport();
  const scale = width / w;
  return (
    <div className="relative overflow-hidden" style={{ width, height: (h - HEADER_CROP) * scale }}>
      <div
        inert
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 origin-top-left bg-smoke"
        style={{ width: w, height: h, transform: `scale(${scale}) translateY(${-HEADER_CROP}px)` }}
      >
        <WatchingContext.Provider value>{children}</WatchingContext.Provider>
      </div>
    </div>
  );
}

export interface OtherTable {
  id: string;
  label: string;
  screen: React.ReactNode;
}

/**
 * The other tables, small, in the margin to the right of yours: click one to watch it up close.
 * Fixed in place, so your own table's layout doesn't move at all.
 */
export function OtherTables({ tables }: { tables: OtherTable[] }) {
  const [watching, setWatching] = useState<string | null>(null);
  const { w } = useViewport();
  const roomy = w >= ROOM_FOR_MINI;
  const open = tables.find((t) => t.id === watching) ?? null;

  if (tables.length === 0) return null;
  return (
    <>
      {roomy ? (
        <nav aria-label="Other tables" className="fixed top-1/2 right-4 z-30 flex -translate-y-1/2 flex-col gap-3">
          {tables.map((t) => (
            // The copy has buttons of its own, so the click lands on a layer laid over it.
            <div key={t.id} className="group relative flex flex-col items-start gap-1.5 rounded-2xl bg-smoke-raised/90 p-2 ring-1 ring-leather-lit transition hover:ring-brass">
              <span className="flex items-center gap-1.5 px-0.5 text-xs font-bold text-parchment group-hover:text-bone">
                <Eye className="size-3.5" aria-hidden />
                {t.label}
              </span>
              {t.id !== watching && (
                <span className="block overflow-hidden rounded-lg ring-1 ring-black/40">
                  <Scaled width={MINI_WIDTH}>{t.screen}</Scaled>
                </span>
              )}
              <button onClick={() => setWatching(t.id)} aria-label={`Watch ${t.label.toLowerCase()}`} className="absolute inset-0 rounded-2xl" />
            </div>
          ))}
        </nav>
      ) : (
        // No margin to spare: a slim tab flush with the window's edge, clear of the table.
        <nav aria-label="Other tables" className="fixed top-1/2 right-0 z-30 flex -translate-y-1/2 flex-col gap-2">
          {tables.map((t) => (
            <button
              key={t.id}
              onClick={() => setWatching(t.id)}
              aria-label={`Watch ${t.label.toLowerCase()}`}
              className="flex items-center gap-1.5 rounded-l-xl bg-smoke-raised/90 px-1.5 py-3 text-xs font-bold text-parchment ring-1 ring-leather-lit transition [writing-mode:vertical-rl] hover:text-bone hover:ring-brass"
            >
              <Eye className="size-3.5 rotate-90" aria-hidden />
              {t.label}
            </button>
          ))}
        </nav>
      )}
      {open && <WatchOverlay table={open} onClose={() => setWatching(null)} />}
    </>
  );
}

/** Another table up close, read-only, over your own (which keeps going underneath). */
function WatchOverlay({ table, onClose }: { table: OtherTable; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { w, h } = useViewport();
  // As large as fits under the title bar, keeping the window's shape.
  const width = Math.min(w * 0.9, ((h - 120) * w) / (h - HEADER_CROP));
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Watching ${table.label.toLowerCase()}`} onClick={(e) => e.stopPropagation()} className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-bone">
            <Eye className="size-5 text-brass-lit" aria-hidden />
            {table.label}
          </h2>
          <button ref={closeRef} onClick={onClose} aria-label="Stop watching" className="grid size-11 place-items-center rounded-full text-bone hover:bg-black/30">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-hidden rounded-[2rem] ring-1 ring-leather-lit">
          <Scaled width={width}>{table.screen}</Scaled>
        </div>
      </div>
    </motion.div>
  );
}
