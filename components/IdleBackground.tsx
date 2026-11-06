"use client";

import { useEffect, useRef } from "react";

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
  speedMultiplier: number;
  mouseParallax: number;
  maxOpacity: number;
  centerSafeZoneFade: number;
  palette: BackgroundPalette;
}

const MIDNIGHT: BackgroundPalette = {
  bgBase: "#0b1116", // Night-blue room
  tableGlow: "#132a23", // Faint felt glow in the middle
  cardStroke: "#cbd5e1", // Cursor highlight on the emblems
  redSuit: "#f43f5e", // Hearts and diamonds
  darkSuit: "#94a3b8", // Spades and clubs
  goldAccent: "#eab308", // First wave, overhead lamp
  emeraldAccent: "#34d399", // Second wave
};

export const BACKGROUND_CONFIG: BackgroundConfig = {
  speedMultiplier: 1.45, // How fast each wave crosses (0.2 = ultra-calm, 1.0 = lively)
  mouseParallax: 0.01, // Gentle depth shift when moving the mouse (0 to disable)
  maxOpacity: 0.5, // Emblems sit at 45% of this, waves and the cursor lift them to it
  centerSafeZoneFade: 0.75, // How much to dim the lattice behind the center card table (0 to 1)
  palette: MIDNIGHT,
};

/** Canvas backdrop behind every page. */
export function IdleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return createEngine(canvas, BACKGROUND_CONFIG);
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-0 size-full" />;
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

type Rgb = [number, number, number];
/** Spade, heart, diamond, club. */
type Suit = 0 | 1 | 2 | 3;

interface Emblem {
  x: number;
  y: number;
  suit: Suit;
  rot: number;
  glow: number;
}

/**
 * Lattice: spacing between emblems, cursor reach, and the waves. A wave sets off every `gap` real
 * seconds, whatever the speed, alternating gold (top-left corner) and green (top-right corner);
 * each takes `travel` seconds at speed 1 to cross.
 */
const LATTICE = { spacing: 70, size: 11, gap: 6.5, travel: 3.6, waveWidth: 110, wake: 170 };

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

/** Starts the backdrop on `canvas`; returns the function that stops it. */
function createEngine(canvas: HTMLCanvasElement, cfg: BackgroundConfig): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const colors = parsePalette(cfg.palette);
  const paths = makeSuitPaths();
  let w = 0;
  let h = 0;
  let dpr = 1;
  let raf = 0;
  let last = 0;
  /** Real seconds since start. */
  let time = 0;
  const mouse = { tx: 0, ty: 0, x: 0, y: 0, px: -1e4, py: -1e4, active: false };

  let lattice: Emblem[] = [];

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
    // A diagonal swell every `gap` seconds: gold from the top-left corner, then green from the top-right.
    const wave = Math.floor(time / LATTICE.gap);
    const green = wave % 2 === 1;
    const phase = ((time - wave * LATTICE.gap) * cfg.speedMultiplier) / LATTICE.travel;
    const span = (w + h) * Math.SQRT1_2;
    const front = -LATTICE.waveWidth * 2 + phase * (span + LATTICE.waveWidth * 4);
    const tint = green ? colors.emerald : colors.gold;
    const turn = ease(dt, 4);
    const settle = ease(dt, 3);

    for (const e of lattice) {
      const x = e.x + ox;
      const y = e.y + oy;
      const along = ((green ? w - x : x) + y) * Math.SQRT1_2;
      const g = phase <= 1 ? Math.exp(-(((along - front) / LATTICE.waveWidth) ** 2)) : 0;

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
      const color = mix(mix(base, tint, g), colors.stroke, e.glow * 0.5);
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

  function draw(dt: number) {
    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.globalCompositeOperation = "source-over";
    ctx!.globalAlpha = 1;
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    drawLattice(dt);
    applySafeZone();
    paintBackdrop();
  }

  function frame(now: number) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    time += dt;
    const k = ease(dt, 3);
    mouse.x += (mouse.tx - mouse.x) * k;
    mouse.y += (mouse.ty - mouse.y) * k;
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
    dpr = Math.min(window.devicePixelRatio || 1, 2);
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
  const onReduce = () => {
    reduce = reduceQuery.matches;
    start();
  };

  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", onMove);
  document.addEventListener("mouseout", onLeave);
  reduceQuery.addEventListener("change", onReduce);
  start();

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onMove);
    document.removeEventListener("mouseout", onLeave);
    reduceQuery.removeEventListener("change", onReduce);
  };
}
