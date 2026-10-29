"use client";

import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Copy, Palette, RotateCcw } from "lucide-react";
import { Segmented } from "@/components/ui/controls";

export type BackgroundTheme = "drifting-deck" | "suit-lattice" | "topographic";

export interface BackgroundPalette {
  bgBase: string;
  tableGlow: string;
  cardStroke: string;
  redSuit: string;
  darkSuit: string;
  goldAccent: string;
  emeraldAccent: string;
}

export interface BackgroundConfig {
  activeTheme: BackgroundTheme;
  showTunerButton: boolean;
  speedMultiplier: number;
  tumbleSpeed: number;
  mouseParallax: number;
  elementCount: number;
  maxOpacity: number;
  centerSafeZoneFade: number;
  palette: BackgroundPalette;
}

export const BACKGROUND_CONFIG: BackgroundConfig = {
  activeTheme: "drifting-deck", // 'drifting-deck' | 'suit-lattice' | 'topographic'
  showTunerButton: true, // Small bottom-left button to test & tweak settings live (development builds only)

  // Motion & speed
  speedMultiplier: 0.6, // Global speed (0.2 = ultra-calm, 1.0 = lively)
  tumbleSpeed: 0.4, // 3D card flip/rotation speed
  mouseParallax: 0.035, // Gentle depth shift when moving the mouse (0 to disable)

  // Density & opacity
  elementCount: 22, // Floating cards/chips (Drifting deck) or contour lines ×2 (Topographic)
  maxOpacity: 0.16, // Keeps the effect pleasant and strictly in the background
  centerSafeZoneFade: 0.75, // How much to dim animations behind the center card table (0 to 1)

  // Colour palette: the room's own tokens from app/globals.css
  palette: {
    bgBase: "#14100e", // Smoke: the dark room
    tableGlow: "#123222", // Baize: faint felt glow in the middle
    cardStroke: "#f2ebdd", // Bone: card borders and contour lines
    redSuit: "#d0505f", // Muted crimson for hearts and diamonds
    darkSuit: "#a59c8c", // Ash for spades and clubs
    goldAccent: "#d6b67f", // Brass: chip rings, card backs, highlights
    emeraldAccent: "#4fa77a", // Felt green: alternate lattice ripple tint
  },
};

/** Palettes the tuner can switch to in one click. */
const PRESETS: { label: string; palette: BackgroundPalette }[] = [
  { label: "Default", palette: BACKGROUND_CONFIG.palette },
  {
    label: "Midnight",
    palette: {
      bgBase: "#0b1116",
      tableGlow: "#132a23",
      cardStroke: "#cbd5e1",
      redSuit: "#f43f5e",
      darkSuit: "#94a3b8",
      goldAccent: "#eab308",
      emeraldAccent: "#34d399",
    },
  },
];

const TUNER_ENABLED = BACKGROUND_CONFIG.showTunerButton && process.env.NODE_ENV !== "production";
const TUNER_KEY = "showdown:bg-tuner";

const GUST_EVENT = "showdown:gust";
/** Sends a gust through the room from a viewport point: a ripple the background answers in its own way. */
export function gust(at: { x: number; y: number }) {
  window.dispatchEvent(new CustomEvent(GUST_EVENT, { detail: at }));
}

/** Canvas backdrop behind every page, plus the dev-only tuner. */
export function IdleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [config, setConfig] = useState(BACKGROUND_CONFIG);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = createEngine(canvas, BACKGROUND_CONFIG);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Tuned values survive a reload, until the defaults in this file change.
  useEffect(() => {
    if (!TUNER_ENABLED) return;
    try {
      const saved = JSON.parse(localStorage.getItem(TUNER_KEY) ?? "null");
      if (saved?.base === JSON.stringify(BACKGROUND_CONFIG)) setConfig(saved.config);
    } catch {
      // Storage blocked or stale: keep the defaults.
    }
  }, []);

  useEffect(() => {
    engineRef.current?.setConfig(config);
    if (!TUNER_ENABLED) return;
    try {
      localStorage.setItem(TUNER_KEY, JSON.stringify({ base: JSON.stringify(BACKGROUND_CONFIG), config }));
    } catch {
      // Not critical.
    }
  }, [config]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 size-full"
      />
      {TUNER_ENABLED && <Tuner config={config} onChange={setConfig} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

interface Engine {
  setConfig: (config: BackgroundConfig) => void;
  destroy: () => void;
}

type Rgb = [number, number, number];
/** Spade, heart, diamond, club. */
type Suit = 0 | 1 | 2 | 3;

interface Sprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

interface Floater {
  id: number;
  kind: "card" | "chip";
  layer: 0 | 1 | 2;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  flip: number;
  vflip: number;
  suit: Suit;
  gold: boolean;
  born: number;
  /** Extra drift, spin and flutter from a gust, easing back to nothing. */
  kx: number;
  ky: number;
  kr: number;
  kf: number;
}

interface Gust {
  x: number;
  y: number;
  t0: number;
  /** How far the front travels before it's spent: the farthest corner. */
  reach: number;
}

interface Emblem {
  x: number;
  y: number;
  suit: Suit;
  rot: number;
  glow: number;
}

/** Deep, mid and foreground-edge layers of the drifting deck. */
const LAYERS = [
  { card: [26, 36], chip: 22, speed: 7, depth: 0.25, alpha: 0.375, soft: true },
  { card: [40, 56], chip: 34, speed: 13, depth: 0.6, alpha: 0.875, soft: false },
  { card: [65, 90], chip: 52, speed: 18, depth: 1.2, alpha: 1, soft: false },
] as const;

/** Lattice: spacing between emblems, ripple timing (seconds at speed 1), cursor reach. */
const LATTICE = { spacing: 70, size: 11, cycle: 5.4, travel: 3.6, waveWidth: 110, wake: 170 };

/** A gust's front: how fast it spreads (px/s), how hard it pushes cards (px/s), how long that lasts (s). */
const GUST = { speed: 1300, push: 110, settle: 0.6 };

/** Marching-squares edge pairs per cell case (edges: 0 top, 1 right, 2 bottom, 3 left). */
const SEGMENTS: number[][] = [[], [3, 2], [2, 1], [3, 1], [0, 1], [3, 0, 2, 1], [0, 2], [3, 0], [3, 0], [0, 2], [0, 1, 3, 2], [0, 1], [3, 1], [2, 1], [3, 2], []];

const isRed = (s: Suit) => s === 1 || s === 2;
const smooth = (t: number) => t * t * (3 - 2 * t);
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = ([r, g, b]: Rgb, a = 1) => `rgba(${r},${g},${b},${a})`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Vector suit shapes in a unit box (−1…1), so they never fall back to emoji glyphs. */
function makeSuitPaths(): Path2D[] {
  const spade = new Path2D();
  spade.moveTo(0, -1);
  spade.bezierCurveTo(0.35, -0.6, 1, -0.2, 1, 0.2);
  spade.bezierCurveTo(1, 0.55, 0.7, 0.7, 0.48, 0.7);
  spade.bezierCurveTo(0.25, 0.7, 0.08, 0.58, 0.04, 0.45);
  spade.quadraticCurveTo(0.1, 0.85, 0.35, 1);
  spade.lineTo(-0.35, 1);
  spade.quadraticCurveTo(-0.1, 0.85, -0.04, 0.45);
  spade.bezierCurveTo(-0.08, 0.58, -0.25, 0.7, -0.48, 0.7);
  spade.bezierCurveTo(-0.7, 0.7, -1, 0.55, -1, 0.2);
  spade.bezierCurveTo(-1, -0.2, -0.35, -0.6, 0, -1);
  spade.closePath();

  const heart = new Path2D();
  heart.moveTo(0, 0.95);
  heart.bezierCurveTo(-0.35, 0.6, -1, 0.15, -1, -0.35);
  heart.bezierCurveTo(-1, -0.8, -0.7, -0.95, -0.5, -0.95);
  heart.bezierCurveTo(-0.22, -0.95, 0, -0.75, 0, -0.5);
  heart.bezierCurveTo(0, -0.75, 0.22, -0.95, 0.5, -0.95);
  heart.bezierCurveTo(0.7, -0.95, 1, -0.8, 1, -0.35);
  heart.bezierCurveTo(1, 0.15, 0.35, 0.6, 0, 0.95);
  heart.closePath();

  const diamond = new Path2D();
  diamond.moveTo(0, -1);
  diamond.quadraticCurveTo(0.25, -0.3, 0.72, 0);
  diamond.quadraticCurveTo(0.25, 0.3, 0, 1);
  diamond.quadraticCurveTo(-0.25, 0.3, -0.72, 0);
  diamond.quadraticCurveTo(-0.25, -0.3, 0, -1);
  diamond.closePath();

  // Three lobes and a stem, all wound clockwise so the overlaps fill solid.
  const club = new Path2D();
  for (const [cx, cy, r] of [
    [0, -0.5, 0.36],
    [-0.45, 0.12, 0.36],
    [0.45, 0.12, 0.36],
    [0, 0.02, 0.22],
  ]) {
    club.moveTo(cx + r, cy);
    club.arc(cx, cy, r, 0, Math.PI * 2);
  }
  club.moveTo(0.06, 0.2);
  club.quadraticCurveTo(0.1, 0.8, 0.35, 1);
  club.lineTo(-0.35, 1);
  club.quadraticCurveTo(-0.1, 0.8, -0.06, 0.2);
  club.closePath();

  return [spade, heart, diamond, club];
}

/** Pre-renders one element at `res` device pixels per CSS pixel (low res = soft focus). */
function makeSprite(w: number, h: number, res: number, draw: (ctx: CanvasRenderingContext2D) => void): Sprite {
  const pad = 3;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((w + pad * 2) * res);
  canvas.height = Math.ceil((h + pad * 2) * res);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(res, res);
  ctx.translate(w / 2 + pad, h / 2 + pad);
  draw(ctx);
  return { canvas, w: w + pad * 2, h: h + pad * 2 };
}

function createEngine(canvas: HTMLCanvasElement, initial: BackgroundConfig): Engine {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { setConfig: () => {}, destroy: () => {} };

  let cfg = initial;
  let colors = parsePalette(cfg.palette);
  const paths = makeSuitPaths();
  let w = 0;
  let h = 0;
  let dpr = 1;
  let raf = 0;
  let last = 0;
  /** Real seconds since start (fade-ins) and motion seconds (scaled by speed). */
  let time = 0;
  let clock = 0;
  const mouse = { tx: 0, ty: 0, x: 0, y: 0, px: -1e4, py: -1e4, active: false };

  let sprites: ReturnType<typeof buildSprites> | null = null;
  let floaters: Floater[] = [];
  let lattice: Emblem[] = [];
  let grid = new Float32Array(0);
  let gusts: Gust[] = [];

  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduce = reduceQuery.matches;

  function parsePalette(p: BackgroundPalette) {
    return {
      base: hexToRgb(p.bgBase),
      glow: hexToRgb(p.tableGlow),
      stroke: hexToRgb(p.cardStroke),
      red: hexToRgb(p.redSuit),
      dark: hexToRgb(p.darkSuit),
      gold: hexToRgb(p.goldAccent),
      emerald: hexToRgb(p.emeraldAccent),
    };
  }

  /* ---------- Drifting deck ---------- */

  function buildSprites() {
    const face = (cw: number, ch: number, suit: Suit, emblem: Rgb) => (c: CanvasRenderingContext2D) => {
      const r = cw * 0.12;
      c.beginPath();
      c.roundRect(-cw / 2, -ch / 2, cw, ch, r);
      c.fillStyle = rgba(colors.stroke, 0.1);
      c.fill();
      c.lineWidth = Math.max(1, cw * 0.03);
      c.strokeStyle = rgba(colors.stroke);
      c.stroke();
      const inset = cw * 0.1;
      c.beginPath();
      c.roundRect(-cw / 2 + inset, -ch / 2 + inset, cw - inset * 2, ch - inset * 2, r * 0.6);
      c.lineWidth = Math.max(0.75, cw * 0.015);
      c.strokeStyle = rgba(colors.stroke, 0.45);
      c.stroke();
      c.save();
      c.scale(cw * 0.26, cw * 0.26);
      c.fillStyle = rgba(emblem);
      c.fill(paths[suit]);
      c.restore();
    };
    const back = (cw: number, ch: number) => (c: CanvasRenderingContext2D) => {
      const r = cw * 0.12;
      c.beginPath();
      c.roundRect(-cw / 2, -ch / 2, cw, ch, r);
      c.fillStyle = rgba(colors.gold, 0.12);
      c.fill();
      c.lineWidth = Math.max(1, cw * 0.03);
      c.strokeStyle = rgba(colors.stroke);
      c.stroke();
      // A diamond lattice, like a card back's pattern.
      const inset = cw * 0.1;
      c.save();
      c.beginPath();
      c.roundRect(-cw / 2 + inset, -ch / 2 + inset, cw - inset * 2, ch - inset * 2, r * 0.6);
      c.clip();
      c.strokeStyle = rgba(colors.gold, 0.55);
      c.lineWidth = Math.max(0.6, cw * 0.012);
      c.beginPath();
      const step = cw * 0.2;
      for (let k = -ch; k < cw + ch; k += step) {
        c.moveTo(-cw / 2 + k, -ch / 2);
        c.lineTo(-cw / 2 + k - ch, ch / 2);
        c.moveTo(-cw / 2 + k - ch, -ch / 2);
        c.lineTo(-cw / 2 + k, ch / 2);
      }
      c.stroke();
      c.restore();
    };
    const chip = (d: number) => (c: CanvasRenderingContext2D) => {
      const r = d / 2;
      c.strokeStyle = rgba(colors.gold);
      c.lineWidth = Math.max(1, r * 0.06);
      c.beginPath();
      c.arc(0, 0, r * 0.97, 0, Math.PI * 2);
      c.stroke();
      // Eight edge spots, like a clay chip.
      const band = r * 0.82;
      const seg = (Math.PI * 2 * band) / 16;
      c.setLineDash([seg, seg]);
      c.lineWidth = r * 0.2;
      c.beginPath();
      c.arc(0, 0, band, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      c.lineWidth = Math.max(0.75, r * 0.05);
      c.strokeStyle = rgba(colors.gold, 0.6);
      c.beginPath();
      c.arc(0, 0, r * 0.6, 0, Math.PI * 2);
      c.stroke();
    };

    return LAYERS.map((L) => {
      const res = L.soft ? dpr * 0.4 : dpr;
      const [cw, ch] = L.card;
      return {
        faces: ([0, 1, 2, 3] as Suit[]).map((s) =>
          [isRed(s) ? colors.red : colors.dark, colors.gold].map((emblem) => makeSprite(cw, ch, res, face(cw, ch, s, emblem))),
        ),
        back: makeSprite(cw, ch, res, back(cw, ch)),
        chip: makeSprite(L.chip, L.chip, res, chip(L.chip)),
      };
    });
  }

  function newFloater(id: number, born: number): Floater {
    // Golden-ratio spread keeps the layer mix steady as the count changes: ~40% deep, 35% mid, 25% edge.
    const r = (id * 0.618034) % 1;
    const layer = r < 0.4 ? 0 : r < 0.75 ? 1 : 2;
    const L = LAYERS[layer];
    let x = Math.random() * w;
    let y = Math.random() * h;
    // Foreground pieces start out around the edges, clear of the table.
    for (let tries = 0; layer === 2 && tries < 30 && Math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2)) < 0.8; tries++) {
      x = Math.random() * w;
      y = Math.random() * h;
    }
    const heading = Math.random() * Math.PI * 2;
    const speed = L.speed * (0.6 + Math.random() * 0.8);
    return {
      id,
      kind: id % 4 === 3 ? "chip" : "card",
      layer,
      x,
      y,
      vx: Math.cos(heading) * speed,
      vy: Math.sin(heading) * speed,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() < 0.5 ? -1 : 1) * (0.08 + Math.random() * 0.15),
      flip: Math.random() * Math.PI * 2,
      vflip: (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6),
      suit: (id % 4) as Suit,
      gold: id % 5 === 0,
      born,
      kx: 0,
      ky: 0,
      kr: 0,
      kf: 0,
    };
  }

  function syncFloaters(born: number) {
    const n = Math.max(0, Math.round(cfg.elementCount));
    floaters = floaters.filter((f) => f.id < n);
    for (let id = 0; id < n; id++) if (!floaters.some((f) => f.id === id)) floaters.push(newFloater(id, born));
    floaters.sort((a, b) => a.layer - b.layer);
  }

  function stepDeck(dt: number) {
    const move = dt * cfg.speedMultiplier;
    const spin = dt * cfg.tumbleSpeed;
    const calm = Math.exp(-dt / GUST.settle);
    for (const f of floaters) {
      // Blown outward as a gust's front passes, fluttering a little faster before settling.
      for (const g of gusts) {
        const r = (time - g.t0) * GUST.speed;
        const dx = f.x - g.x;
        const dy = f.y - g.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < r - GUST.speed * dt || d >= r) continue;
        const strength = (1 / (1 + d / 500)) * (0.6 + 0.2 * f.layer);
        f.kx += (dx / d) * GUST.push * strength;
        f.ky += (dy / d) * GUST.push * strength;
        f.kr += Math.sign(f.vrot) * 1.2 * strength;
        f.kf += Math.sign(f.vflip) * 3 * strength;
      }
      f.x += f.vx * move + f.kx * dt;
      f.y += f.vy * move + f.ky * dt;
      f.rot += f.vrot * spin + f.kr * dt;
      f.flip += f.vflip * spin + f.kf * dt;
      f.kx *= calm;
      f.ky *= calm;
      f.kr *= calm;
      f.kf *= calm;
      // Leave one side, come back in at a random spot on the other.
      const m = LAYERS[f.layer].card[1];
      if (f.x < -m) [f.x, f.y] = [w + m, Math.random() * h];
      else if (f.x > w + m) [f.x, f.y] = [-m, Math.random() * h];
      if (f.y < -m) [f.x, f.y] = [Math.random() * w, h + m];
      else if (f.y > h + m) [f.x, f.y] = [Math.random() * w, -m];
    }
  }

  function drawDeck() {
    sprites ??= buildSprites();
    const reach = cfg.mouseParallax * Math.min(w, h);
    for (const f of floaters) {
      const L = LAYERS[f.layer];
      const set = sprites[f.layer];
      const tumble = Math.cos(f.flip);
      const sprite = f.kind === "chip" ? set.chip : tumble >= 0 ? set.faces[f.suit][f.gold ? 1 : 0] : set.back;
      const sx = Math.max(0.03, Math.abs(tumble));
      const cos = Math.cos(f.rot);
      const sin = Math.sin(f.rot);
      const x = f.x - mouse.x * reach * L.depth;
      const y = f.y - mouse.y * reach * L.depth;
      ctx!.globalAlpha = cfg.maxOpacity * L.alpha * Math.min(1, (time - f.born) / 1.5);
      // translate · rotate · scaleX(tumble)
      ctx!.setTransform(dpr * cos * sx, dpr * sin * sx, -dpr * sin, dpr * cos, dpr * x, dpr * y);
      ctx!.drawImage(sprite.canvas, -sprite.w / 2, -sprite.h / 2, sprite.w, sprite.h);
    }
    ctx!.globalAlpha = 1;
  }

  /* ---------- Suit lattice ---------- */

  function buildLattice() {
    const S = LATTICE.spacing;
    const rowH = (S * Math.sqrt(3)) / 2;
    const old = new Map(lattice.map((e) => [`${e.x},${e.y}`, e]));
    lattice = [];
    for (let j = -1; j * rowH < h + rowH; j++) {
      for (let i = -1; i * S < w + S; i++) {
        const x = i * S + (j & 1 ? S / 2 : 0);
        const y = j * rowH;
        lattice.push(old.get(`${x},${y}`) ?? { x, y, suit: ((((i + j * 2) % 4) + 4) % 4) as Suit, rot: 0, glow: 0 });
      }
    }
  }

  function drawLattice(dt: number) {
    const rest = cfg.maxOpacity * 0.45;
    const reach = cfg.mouseParallax * Math.min(w, h) * 0.4;
    const ox = -mouse.x * reach;
    const oy = -mouse.y * reach;
    // A diagonal swell every few seconds, alternating brass and felt green.
    const wave = Math.floor(clock / LATTICE.cycle);
    const phase = (clock - wave * LATTICE.cycle) / LATTICE.travel;
    const span = (w + h) * Math.SQRT1_2;
    const front = -LATTICE.waveWidth * 2 + phase * (span + LATTICE.waveWidth * 4);
    const tint = wave % 2 ? colors.emerald : colors.gold;
    const turn = ease(dt, 4);
    const settle = ease(dt, 3);

    for (const e of lattice) {
      const x = e.x + ox;
      const y = e.y + oy;
      const along = (x + y) * Math.SQRT1_2;
      const ripple = phase <= 1 ? Math.exp(-(((along - front) / LATTICE.waveWidth) ** 2)) : 0;
      let pushed = 0;
      for (const gu of gusts) {
        const r = (time - gu.t0) * GUST.speed;
        pushed = Math.max(pushed, Math.exp(-(((Math.hypot(x - gu.x, y - gu.y) - r) / 55) ** 2)) * (1 - r / gu.reach));
      }
      const g = Math.max(ripple, pushed);

      let wake = 0;
      let target = 0;
      if (mouse.active) {
        const dx = mouse.px - x;
        const dy = mouse.py - y;
        const d = Math.hypot(dx, dy);
        if (d < LATTICE.wake) {
          wake = (1 - d / LATTICE.wake) ** 2;
          target = wrapAngle(Math.atan2(dy, dx) + Math.PI / 2) * Math.min(1, wake * 2.5);
        }
      }
      e.rot += wrapAngle(target - e.rot) * turn;
      e.glow += (wake - e.glow) * settle;

      const base = isRed(e.suit) ? colors.red : colors.dark;
      const color = mix(mix(base, pushed > ripple ? colors.gold : tint, g), colors.stroke, e.glow * 0.5);
      const scale = LATTICE.size * (1 + 0.35 * g + 0.15 * e.glow);
      const rot = e.rot + 0.35 * g;
      const cos = Math.cos(rot) * scale * dpr;
      const sin = Math.sin(rot) * scale * dpr;
      ctx!.globalAlpha = rest + (cfg.maxOpacity - rest) * Math.max(g, e.glow);
      ctx!.fillStyle = rgba(color);
      ctx!.setTransform(cos, sin, -sin, cos, dpr * x, dpr * y);
      ctx!.fill(paths[e.suit]);
    }
    ctx!.globalAlpha = 1;
  }

  /* ---------- Topographic ---------- */

  /** A slow, warped interference field; its contour lines are the "topography". */
  function field(x: number, y: number, t: number) {
    const u = x / 300;
    const v = y / 300;
    return (
      Math.sin(1.1 * u + 0.55 * t) * Math.cos(0.9 * v - 0.35 * t) +
      0.6 * Math.sin(0.7 * u - 1.2 * v + 0.4 * t) +
      0.45 * Math.cos(1.6 * u + 0.7 * v - 0.25 * t + Math.sin(0.5 * v + 0.2 * t))
    );
  }

  function drawTopo() {
    const t = clock * 0.35;
    const reach = cfg.mouseParallax * Math.min(w, h) * 0.5;
    const ox = -mouse.x * reach;
    const oy = -mouse.y * reach;
    const cell = 16;
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(h / cell) + 1;
    if (grid.length !== cols * rows) grid = new Float32Array(cols * rows);
    const rings = gusts.map((g) => ({ x: g.x, y: g.y, r: (time - g.t0) * GUST.speed, fade: 1 - ((time - g.t0) * GUST.speed) / g.reach }));
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let v = field(i * cell - ox, j * cell - oy, t);
        for (const g of rings) v += 0.7 * g.fade * Math.exp(-(((Math.hypot(i * cell - g.x, j * cell - g.y) - g.r) / 90) ** 2));
        grid[j * cols + i] = v;
      }
    }

    const levels = Math.min(24, Math.max(4, Math.round(cfg.elementCount / 2)));
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Every fourth line is an index line, in brass.
    for (const index of [false, true]) {
      ctx!.beginPath();
      for (let k = 0; k < levels; k++) {
        if ((k % 4 === 0) !== index) continue;
        const L = -1.6 + (3.2 * (k + 0.5)) / levels;
        for (let j = 0; j < rows - 1; j++) {
          for (let i = 0; i < cols - 1; i++) {
            const a = grid[j * cols + i];
            const b = grid[j * cols + i + 1];
            const c = grid[(j + 1) * cols + i + 1];
            const d = grid[(j + 1) * cols + i];
            const segs = SEGMENTS[(a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0)];
            if (segs.length === 0) continue;
            const x0 = i * cell;
            const y0 = j * cell;
            for (let s = 0; s < segs.length; s += 2) {
              for (let p = 0; p < 2; p++) {
                const edge = segs[s + p];
                const ex = edge === 0 ? x0 + (cell * (L - a)) / (b - a) : edge === 1 ? x0 + cell : edge === 2 ? x0 + (cell * (L - d)) / (c - d) : x0;
                const ey = edge === 0 ? y0 : edge === 1 ? y0 + (cell * (L - b)) / (c - b) : edge === 2 ? y0 + cell : y0 + (cell * (L - a)) / (d - a);
                if (p === 0) ctx!.moveTo(ex, ey);
                else ctx!.lineTo(ex, ey);
              }
            }
          }
        }
      }
      ctx!.globalAlpha = index ? cfg.maxOpacity * 0.9 : cfg.maxOpacity * 0.55;
      ctx!.strokeStyle = rgba(index ? colors.gold : colors.stroke);
      ctx!.lineWidth = index ? 1.4 : 1;
      ctx!.stroke();
    }
    ctx!.globalAlpha = 1;
  }

  /* ---------- Frame ---------- */

  /** Fades everything toward invisible behind the middle of the screen, where the table sits. */
  function applySafeZone() {
    const fade = Math.min(1, Math.max(0, cfg.centerSafeZoneFade));
    if (fade === 0) return;
    ctx!.setTransform((dpr * w) / 2, 0, 0, (dpr * h) / 2, (dpr * w) / 2, (dpr * h) / 2);
    const g = ctx!.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(0,0,0,${fade})`);
    for (let k = 0; k <= 8; k++) g.addColorStop(0.3 + (k / 8) * 0.55, `rgba(0,0,0,${fade * (1 - smooth(k / 8))})`);
    ctx!.globalCompositeOperation = "destination-out";
    ctx!.fillStyle = g;
    ctx!.fillRect(-1, -1, 2, 2);
  }

  /** The room behind it all, painted underneath: overhead lamp, felt glow, then the base. */
  function paintBackdrop() {
    ctx!.globalCompositeOperation = "destination-over";
    ctx!.setTransform(dpr * w * 0.7, 0, 0, dpr * h * 0.55, (dpr * w) / 2, 0);
    const lamp = ctx!.createRadialGradient(0, 0, 0, 0, 0, 1);
    lamp.addColorStop(0, rgba(colors.gold, 0.08));
    lamp.addColorStop(1, rgba(colors.gold, 0));
    ctx!.fillStyle = lamp;
    ctx!.fillRect(-1, -1, 2, 2);

    ctx!.setTransform(dpr * w * 0.6, 0, 0, dpr * h * 0.6, (dpr * w) / 2, (dpr * h) / 2);
    const felt = ctx!.createRadialGradient(0, 0, 0, 0, 0, 1);
    felt.addColorStop(0, rgba(colors.glow, 1));
    felt.addColorStop(1, rgba(colors.glow, 0));
    ctx!.fillStyle = felt;
    ctx!.fillRect(-1, -1, 2, 2);

    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.fillStyle = rgba(colors.base);
    ctx!.fillRect(0, 0, canvas.width, canvas.height);
    ctx!.globalCompositeOperation = "source-over";
  }

  /** The faint front of each gust, a thin brass ring spreading from where it started. */
  function drawGusts() {
    gusts = gusts.filter((g) => (time - g.t0) * GUST.speed < g.reach);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.strokeStyle = rgba(colors.gold);
    ctx!.lineWidth = 1.5;
    for (const g of gusts) {
      const r = (time - g.t0) * GUST.speed;
      ctx!.globalAlpha = cfg.maxOpacity * 0.7 * (1 - r / g.reach) ** 2;
      ctx!.beginPath();
      ctx!.arc(g.x, g.y, r, 0, Math.PI * 2);
      ctx!.stroke();
    }
    ctx!.globalAlpha = 1;
  }

  function draw(dt: number) {
    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.globalCompositeOperation = "source-over";
    ctx!.globalAlpha = 1;
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    if (cfg.activeTheme === "drifting-deck") drawDeck();
    else if (cfg.activeTheme === "suit-lattice") drawLattice(dt);
    else drawTopo();
    drawGusts();
    applySafeZone();
    paintBackdrop();
  }

  function frame(now: number) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    time += dt;
    clock += dt * cfg.speedMultiplier;
    const k = ease(dt, 3);
    mouse.x += (mouse.tx - mouse.x) * k;
    mouse.y += (mouse.ty - mouse.y) * k;
    if (cfg.activeTheme === "drifting-deck") stepDeck(dt);
    draw(dt);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    cancelAnimationFrame(raf);
    last = 0;
    if (reduce) draw(0);
    else raf = requestAnimationFrame(frame);
  }

  function resize() {
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    if (nextDpr !== dpr) sprites = null;
    dpr = nextDpr;
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    buildLattice();
    if (reduce) draw(0);
  }

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    mouse.tx = (e.clientX / w) * 2 - 1;
    mouse.ty = (e.clientY / h) * 2 - 1;
    mouse.px = e.clientX;
    mouse.py = e.clientY;
    mouse.active = true;
  };
  const onLeave = (e: MouseEvent) => {
    if (e.relatedTarget) return;
    mouse.active = false;
    mouse.tx = 0;
    mouse.ty = 0;
  };
  const onGust = (e: Event) => {
    if (reduce) return;
    const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail;
    const reach = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
    gusts = [...gusts.slice(-2), { x, y, t0: time, reach }];
  };
  const onReduce = () => {
    reduce = reduceQuery.matches;
    start();
  };

  resize();
  syncFloaters(-10);
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", onMove);
  document.addEventListener("mouseout", onLeave);
  reduceQuery.addEventListener("change", onReduce);
  window.addEventListener(GUST_EVENT, onGust);
  start();

  return {
    setConfig(next) {
      const prev = cfg;
      cfg = next;
      if (prev.palette !== next.palette) {
        colors = parsePalette(next.palette);
        sprites = null;
      }
      if (prev.elementCount !== next.elementCount) syncFloaters(time);
      if (reduce) draw(0);
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onLeave);
      reduceQuery.removeEventListener("change", onReduce);
      window.removeEventListener(GUST_EVENT, onGust);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Tuner (development only)                                            */
/* ------------------------------------------------------------------ */

const PALETTE_LABELS: Record<keyof BackgroundPalette, string> = {
  bgBase: "Base",
  tableGlow: "Table glow",
  cardStroke: "Card stroke",
  redSuit: "Red suits",
  darkSuit: "Dark suits",
  goldAccent: "Gold",
  emeraldAccent: "Emerald",
};

function Tuner({ config, onChange }: { config: BackgroundConfig; onChange: (c: BackgroundConfig) => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const set = <K extends keyof BackgroundConfig>(key: K, value: BackgroundConfig[K]) => onChange({ ...config, [key]: value });

  const copy = async () => {
    const body = JSON.stringify(config, null, 2).replace(/"(\w+)":/g, "$1:");
    try {
      await navigator.clipboard.writeText(`export const BACKGROUND_CONFIG: BackgroundConfig = ${body};\n`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked.
    }
  };

  const small = "flex min-h-9 items-center gap-1.5 rounded-full border border-bone/30 px-3 text-xs font-bold text-bone transition hover:border-bone";

  return (
    <div ref={ref} className="fixed bottom-16 left-5 z-[70] sm:bottom-5 sm:left-16">
      {open && (
        <div
          role="dialog"
          aria-label="Background tuner"
          className="absolute bottom-full left-0 mb-2 max-h-[80dvh] w-80 max-w-[calc(100vw-5rem)] space-y-4 overflow-y-auto rounded-2xl bg-smoke-raised p-4 text-sm text-bone shadow-2xl ring-1 ring-leather-lit"
        >
          <Segmented<BackgroundTheme>
            label="Theme"
            value={config.activeTheme}
            options={[
              { value: "drifting-deck", label: "Deck" },
              { value: "suit-lattice", label: "Lattice" },
              { value: "topographic", label: "Topo" },
            ]}
            onChange={(v) => set("activeTheme", v)}
          />
          <Slider label="Speed" value={config.speedMultiplier} min={0.1} max={2} step={0.05} onChange={(v) => set("speedMultiplier", v)} />
          <Slider label="Tumble" value={config.tumbleSpeed} min={0} max={2} step={0.05} onChange={(v) => set("tumbleSpeed", v)} />
          <Slider label="Mouse parallax" value={config.mouseParallax} min={0} max={0.1} step={0.005} onChange={(v) => set("mouseParallax", v)} />
          <Slider label="Elements" value={config.elementCount} min={4} max={60} step={1} onChange={(v) => set("elementCount", v)} />
          <Slider label="Max opacity" value={config.maxOpacity} min={0.02} max={0.5} step={0.01} onChange={(v) => set("maxOpacity", v)} />
          <Slider label="Center fade" value={config.centerSafeZoneFade} min={0} max={1} step={0.05} onChange={(v) => set("centerSafeZoneFade", v)} />

          <div className="space-y-2">
            <div className="flex gap-2">
              {PRESETS.map((p) => (
                <button key={p.label} onClick={() => set("palette", p.palette)} aria-pressed={JSON.stringify(config.palette) === JSON.stringify(p.palette)}
                  className={clsx(small, "aria-pressed:border-brass aria-pressed:bg-brass aria-pressed:text-smoke")}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {(Object.keys(PALETTE_LABELS) as (keyof BackgroundPalette)[]).map((key) => (
                <label key={key} className="flex items-center gap-2 text-xs text-parchment">
                  <input
                    type="color"
                    value={config.palette[key]}
                    onChange={(e) => set("palette", { ...config.palette, [key]: e.target.value })}
                    className="size-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  {PALETTE_LABELS[key]}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2 border-t border-leather-lit pt-3">
            <button onClick={copy} className={small}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              <span aria-live="polite">{copied ? "Copied" : "Copy config"}</span>
            </button>
            <button onClick={() => onChange(BACKGROUND_CONFIG)} className={small}>
              <RotateCcw className="size-3.5" /> Reset
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="BG tuner"
        className="flex min-h-9 min-w-9 justify-center items-center gap-1.5 rounded-full bg-smoke-raised/80 px-3 text-xs font-bold text-parchment ring-1 ring-leather-lit backdrop-blur transition hover:text-bone"
      >
        <Palette className="size-4" aria-hidden /> <span className="hidden sm:inline">BG tuner</span>
      </button>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const id = useId();
  const decimals = step >= 1 ? 0 : step >= 0.01 ? 2 : 3;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="text-parchment tabular-nums">
          {value.toFixed(decimals)}
        </output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-brass" />
    </div>
  );
}
