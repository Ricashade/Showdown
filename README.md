# Showdown

Multiplayer card games on Next.js (App Router): **BS Poker** now, **Texas Hold'em** in Phase 2.

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # engine, game-loop and online-room tests (vitest)
npm run build
```

## Structure

```
app/
  page.tsx                  Main menu
  bs-poker/page.tsx         Choose: create room, join room, or local simulator
  bs-poker/room/[code]/     Online room (host or guest)
  bs-poker/local/           Local simulator (every seat on one screen)
  rules/, rules/demo/       How to play + guided 30-second demo
  texas-holdem/page.tsx     Placeholder
types/
  cards.ts                  Card, Rank, Suit
  game.ts                   Mode-agnostic: PlayerSeed, BasePlayer (isBot, botDifficulty), ActionResult
  bs-poker.ts               Bid, Settings, BsPokerState, BsPokerAction, ShowdownResult
lib/
  cards.ts                  Deck, seeded PRNG (mulberry32), shuffle, labels
  bs-poker-engine.ts        isBidHigher, evaluateBid / doesHandExistInPool, hand rules, bid ladder
  bs-poker-game.ts          Pure transitions: createRoom, joinRoom, startGame, placeBid, callBS,
                            nextRound, applyAction; getPlayerView (hidden info), getLegalActions
  turn-controller.ts        BotController interface + registry (no AI yet)
  multiplayer/              Room protocol (room.ts), encryption (crypto.ts), channels: Supabase,
                            same-browser tabs, in-memory (tests)
  multiplayer/transport.ts  LocalTransport for the simulator
  hooks/                    useOnlineRoom, useGameRoom, useBotTurns
components/
  ui/                       PlayingCard (flip/deal animations), Toggle/Stepper/Segmented
  bs-poker/                 TableScreen (shared), LocalGame, OnlineGame, Lobby, GameTable, BidBuilder, …
  rules/                    Rules tabs, QuickDemo
tests/                      Engine, game-loop and online-room tests
```

## Bid rules (as implemented)

Every round, **5 table cards** are dealt face up for everyone, on top of each player's hidden hand. A bid
claims a hand exists in the table cards plus every hand combined, so a real 5-card hand is always possible
and the pool grows as players lose rounds and take cards. (Because the table uses 5 cards, an 8-player
table caps hands at 5 cards.)

A bid claims a hand exists somewhere in **all** dealt cards combined. Only the cards the hand
needs have to exist:

| Bid | Needs |
| --- | --- |
| X High | one X |
| Pair / Trips / Quads of X | 2 / 3 / 4 × X |
| Two Pair H & L | 2 × H and 2 × L (H > L) |
| X-high Straight | one each of X-4…X (5-high = A-2-3-4-5) |
| **X-high Flush** | 5 cards of one suit whose top card is exactly X (6-high … Ace-high) |
| T full of P | 3 × T and 2 × P |
| X-high Straight Flush | X-4…X all in one suit (Ace-high = Royal Flush) |

The host can ban straights, flushes and straight flushes independently: for the whole game, or once any
player holds a set number of cards. Banned hands drop out of the bid ladder for that round.

Flushes are bid by top card only, not suit, so the bid ladder stays strictly ordered. As with
straights, a higher flush doesn't make a lower one exist. Wilds (Jokers, plus 2s when deuces
are wild) can fill any missing card. With deuces wild, a 2 counts only as a wild.

## Online play (Supabase Realtime)

Rooms run over Supabase Realtime **Broadcast + Presence** only: no database tables, no server code.

1. Create a free project at supabase.com. In **Project Settings → API**, copy the project URL and the anon
   (or "publishable") key.
2. Add both to Vercel (**Project → Settings → Environment Variables**) and to `.env.local` for local dev:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
   ```
3. Redeploy. If Realtime is set to **private channels only** (Realtime settings), turn that off: rooms use
   public channels.

Without the keys, online rooms fall back to a test mode that connects tabs in the same browser.

**How a room works** (`lib/multiplayer/room.ts`): the host's tab runs `applyAction` and holds the only full
`GameState`. Guests announce themselves (name + public key) through Presence and send moves over Broadcast.
After every change, the host sends each player *their own* `getPlayerView`, encrypted with a key only that player
shares (ECDH P-256 → AES-GCM), so nobody can read anyone else's cards off the wire. The same keys authenticate
moves, so a player can't act in someone else's name, and recorded messages can't be replayed. The shuffle seed
never leaves the host.

**Limits:** the host's tab is the server. If the host closes it, the game pauses until they reopen the room
link in the same tab. A player who loses connection mid-game stays seated, but the game waits on their turn.
The anon key lets anyone who knows a room code join its lobby; the room code is the invite.
