"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { gust } from "@/components/IdleBackground";

/**
 * Moving between rooms (menu → a game, a lobby → its table).
 *
 * The page never goes blank: the old one eases back and fades as the next settles in over it
 * (a View Transition; see `page` in app/globals.css). Meanwhile the room answers: a gust spreads
 * from where you clicked through the idle background. Browsers without View Transitions, and
 * reduced motion, just swap.
 */

type Point = { x: number; y: number };

interface RoomTransitionApi {
  /** Go to another page, the gust starting at `from` (else the last click). Waits for `ready` first. */
  go: (href: string, opts?: { from?: Point | Element | null; ready?: Promise<unknown> }) => Promise<void>;
  /** Swap this page's room (`update` changes the DOM synchronously or resolves once it has); the gust starts at the last click. */
  swap: (update: () => void | Promise<void>) => void;
}

const RoomTransitionContext = createContext<RoomTransitionApi>({
  go: async (href) => window.location.assign(href),
  swap: (update) => void update(),
});
export const useRoomTransition = () => useContext(RoomTransitionContext);

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const centerOf = (el: Element): Point => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/** Wraps the page. Mount once, in the root layout. */
export function RoomTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pageRef = useRef<HTMLDivElement>(null);
  const running = useRef(0);
  const arrived = useRef<(() => void) | null>(null);
  const going = useRef(false);
  const lastClick = useRef<{ x: number; y: number; at: number } | null>(null);

  // Where the gust starts when nobody says: the click that started it, or the middle of the screen.
  useEffect(() => {
    const onDown = (e: PointerEvent) => (lastClick.current = { x: e.clientX, y: e.clientY, at: Date.now() });
    window.addEventListener("pointerdown", onDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onDown, { capture: true });
  }, []);

  const api = useMemo<RoomTransitionApi>(() => {
    const origin = (): Point => {
      const c = lastClick.current;
      return c && Date.now() - c.at < 1500 ? c : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    };

    /** Crosses from the page as it is to the page after `update`; resolves when it's done. */
    const crossfade = async (update: () => void | Promise<void>) => {
      // Run outside whatever React lifecycle asked for it.
      if (!document.startViewTransition || reducedMotion()) return Promise.resolve().then(update);
      // Only the page is captured, so the room behind it stays live (and gusting) throughout.
      const page = pageRef.current;
      page?.style.setProperty("view-transition-name", "page");
      running.current++;
      let started = false;
      const vt = document.startViewTransition(() => {
        started = true;
        return update();
      });
      // A skipped transition rejects `ready`; the swap itself still happens.
      vt.ready.catch(() => {});
      // A tab that isn't painting can't capture the old page; never let that hold the game up.
      const stall = setTimeout(() => !started && vt.skipTransition(), 500);
      try {
        await vt.finished;
      } catch {
        // Skipped by a newer transition: its DOM change still happened.
      } finally {
        clearTimeout(stall);
        if (--running.current === 0) page?.style.removeProperty("view-transition-name");
      }
    };

    const swap: RoomTransitionApi["swap"] = (update) => {
      if (!reducedMotion()) gust(origin());
      void crossfade(update);
    };

    const go: RoomTransitionApi["go"] = async (href, { from, ready } = {}) => {
      // Already on the way somewhere (a second Enter on the same link).
      if (going.current) return;
      going.current = true;
      try {
        if (!reducedMotion()) gust(from instanceof Element ? centerOf(from) : (from ?? origin()));
        await ready;
        if (new URL(href, window.location.href).pathname === window.location.pathname) return router.push(href);
        // The old page holds until the next one is in, then they cross; never longer than a moment.
        await crossfade(
          () =>
            new Promise<void>((resolve) => {
              arrived.current = resolve;
              router.push(href);
              setTimeout(resolve, 2500);
            }),
        );
      } finally {
        going.current = false;
      }
    };

    return { go, swap };
  }, [router]);

  useEffect(() => {
    arrived.current?.();
    arrived.current = null;
  }, [pathname]);

  return (
    <RoomTransitionContext.Provider value={api}>
      <div ref={pageRef} className="relative z-10">
        {children}
      </div>
    </RoomTransitionContext.Provider>
  );
}

/** A link to another room: same as a Link, with the room transition. */
export function RoomLink({ href, onClick, ...rest }: ComponentProps<typeof Link> & { href: string }) {
  const rooms = useRoomTransition();
  return (
    <Link
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        // Leave new-tab and other modified clicks to the browser.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        // A keyboard "click" has no position: start from the link itself.
        void rooms.go(href, { from: e.detail > 0 ? { x: e.clientX, y: e.clientY } : e.currentTarget });
      }}
    />
  );
}

/** The cover stays up at least this long, so its vignette gets to say something; then it lifts. */
const COVER = { inMs: 120, minMs: 700, outMs: 220 };

/**
 * Swaps between the rooms of one screen (a game's lobby and its table). Into the table, the
 * game's `loader` comes up over the lobby, the table is built behind it, and it lifts once the
 * table has painted. Otherwise (and back to the lobby) the old room crosses over to the new.
 */
export function RoomStage({ room, loader, children }: { room: string; loader?: ReactNode; children: ReactNode }) {
  const rooms = useRoomTransition();
  const [shown, setShown] = useState(room);
  const [cover, setCover] = useState<"in" | "out" | null>(null);
  const coveredAt = useRef(0);
  const last = useRef(children);
  const latest = useRef(room);
  latest.current = room;
  if (shown === room) last.current = children;
  const hasLoader = loader != null;

  const enter = useCallback(() => {
    flushSync(() => setShown(latest.current));
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (shown === room) return;
    if (!hasLoader || room === "lobby" || reducedMotion()) return rooms.swap(enter);
    // Cover first; build the table once the cover is up.
    setCover("in");
    coveredAt.current = performance.now();
    const t = setTimeout(() => {
      setShown(latest.current);
      window.scrollTo(0, 0);
    }, COVER.inMs);
    return () => clearTimeout(t);
  }, [room, shown, rooms, enter, hasLoader]);

  // Lift once the table has painted (two frames after it's in) and the cover has had its moment.
  useEffect(() => {
    if (cover !== "in" || shown !== room) return;
    let frame = 0;
    let fallback = 0;
    let lifted = false;
    const lift = () => {
      if (lifted) return;
      lifted = true;
      setCover("out");
      gust({ x: window.innerWidth / 2, y: window.innerHeight * 0.35 });
    };
    const t = setTimeout(
      () => {
        frame = requestAnimationFrame(() => (frame = requestAnimationFrame(lift)));
        // A tab that isn't painting never gets those frames; don't leave the cover up in it.
        fallback = window.setTimeout(lift, 400);
      },
      Math.max(0, COVER.minMs - (performance.now() - coveredAt.current)),
    );
    return () => {
      clearTimeout(t);
      clearTimeout(fallback);
      cancelAnimationFrame(frame);
    };
  }, [cover, shown, room]);

  useEffect(() => {
    if (cover !== "out") return;
    const t = setTimeout(() => setCover(null), COVER.outMs);
    return () => clearTimeout(t);
  }, [cover]);

  return (
    <>
      {shown === room ? children : last.current}
      {cover && <div data-cover={cover}>{loader}</div>}
    </>
  );
}
