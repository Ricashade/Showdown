import { ImageResponse } from "next/og";
import { GAMES } from "@/lib/games";

export const alt = "Showdown: card games online with friends";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TAGLINE = "Card games online with friends";

/** A Google font as TTF (the image renderer can't read woff2), cut down to the characters drawn. */
async function loadFont(family: string, weight: number, text: string): Promise<ArrayBuffer> {
  const query = `family=${family.replaceAll(" ", "+")}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(`https://fonts.googleapis.com/css2?${query}`)).text();
  const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
  if (!url) throw new Error(`No TTF for ${family}`);
  return (await fetch(url)).arrayBuffer();
}

/** The site's two fonts, or none (the renderer's default) if they can't be fetched. */
async function loadFonts(games: string[]) {
  try {
    const [display, body] = await Promise.all([
      loadFont("Big Shoulders", 800, "Showdown"),
      loadFont("Atkinson Hyperlegible Next", 700, TAGLINE + games.join("") + "AK"),
    ]);
    return [
      { name: "Big Shoulders", data: display, weight: 800 as const },
      { name: "Atkinson", data: body, weight: 700 as const },
    ];
  } catch {
    return undefined;
  }
}

function Spade({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#14100e">
      <path d="M12 2C9 6 3 9.5 3 14a4.5 4.5 0 0 0 7.6 3.2c-.3 1.8-1 3.3-2.1 4.8h7c-1.1-1.5-1.8-3-2.1-4.8A4.5 4.5 0 0 0 21 14c0-4.5-6-8-9-12z" />
    </svg>
  );
}

function Card({ rank, rotate, overlap = 0 }: { rank: string; rotate: number; overlap?: number }) {
  return (
    <div
      style={{
        width: 130,
        height: 182,
        borderRadius: 14,
        background: "#f2ebdd",
        color: "#14100e",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "12px 16px",
        fontSize: 38,
        fontWeight: 700,
        transform: `rotate(${rotate}deg)`,
        boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
        marginLeft: -overlap,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span>{rank}</span>
        <Spade size={30} />
      </div>
      <div style={{ display: "flex", alignSelf: "center", marginBottom: 20 }}>
        <Spade size={68} />
      </div>
    </div>
  );
}

export default async function OpengraphImage() {
  const games = Object.values(GAMES).map((game) => game.title);
  const fonts = await loadFonts(games);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#14100e", fontFamily: fonts ? "Atkinson" : undefined, fontWeight: 700 }}>
        <div
          style={{
            width: 1080,
            height: 510,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "56px 72px",
            borderRadius: 64,
            background: "#0e5c3a",
            border: "16px solid #3a1f16",
            boxShadow: "inset 0 0 0 3px #7a5c2e, inset 0 0 120px rgba(0,0,0,0.35)",
            color: "#f2ebdd",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 136, lineHeight: 1, fontFamily: fonts ? "Big Shoulders" : undefined, fontWeight: 800 }}>Showdown</div>
              <div style={{ fontSize: 40, color: "#d3cab9", marginTop: 16 }}>{TAGLINE}</div>
            </div>
            <div style={{ display: "flex", marginTop: 8, marginRight: 8 }}>
              <Card rank="A" rotate={-8} />
              <Card rank="K" rotate={7} overlap={36} />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", rowGap: 6, columnGap: 26, fontSize: 30, color: "#d6b67f" }}>
            {games.map((title) => (
              <span key={title}>{title}</span>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
