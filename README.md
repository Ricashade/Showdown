# Showdown

Multiplayer card games on Next.js (App Router): **Texas Hold'em** (no-limit), **BS Poker**, **Blackjack**, **Garbage** and **Rummy**, online or on one screen.

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # engine, game-loop and online-room tests (vitest)
npm run build
```

## Structure

```
app/
  page.tsx                  Main menu: one-game-at-a-time carousel (components/menu/)
  bs-poker/page.tsx         Choose: create room, join room, or local simulator
  bs-poker/room/[code]/     Online room (host or guest)
  bs-poker/local/           Local simulator (every seat on one screen)
  rules/, rules/demo/       How to play + guided 30-second demo
  texas-holdem/              Hold'em: chooser, room/[code]/ (online), local/ (simulator)
  blackjack/                Blackjack: same three routes
  garbage/                  Garbage: same three routes
  rummy/                    Rummy: same three routes
types/
  cards.ts                  Card, Rank, Suit
  game.ts                   Mode-agnostic: PlayerSeed, BasePlayer (isBot, botDifficulty), ActionResult
  bs-poker.ts               Bid, Settings, BsPokerState, BsPokerAction, ShowdownResult
lib/
  cards.ts                  Deck, seeded PRNG (mulberry32), shuffle, labels
  bs-poker-engine.ts        isBidHigher, evaluateBid / doesHandExistInPool, hand rules, bid ladder
  holdem-hand.ts            Best 5 of 7 cards, full kicker comparison
  holdem-pots.ts            Side pots (layered by contribution) and split pots with odd chips
  holdem-game.ts            Hold'em reducer: blinds, betting rules, streets, runouts, showdown
  blackjack-engine.ts       Blackjack: hand values, reducer (bets, insurance, hit/stand/double/split,
                            dealer, payouts), views, and the host's clock (blackjackClock)
  garbage-engine.ts         Garbage: face-card roles, legal slots, chain turns, shrinking rounds, views
  rummy-melds.ts            Rummy sets and runs (Aces, Jokers), lay-offs, finding melds in a hand, points
  rummy-engine.ts           Rummy reducer: draw (incl. Rummy 500 digs), meld, lay off, discard, scoring
  bs-poker-game.ts          Pure transitions: createRoom, joinRoom, startGame, placeBid, callBS,
                            nextRound, applyAction; getPlayerView (hidden info), getLegalActions
  bot-ai.ts                 Bots for every game (entry point); brains in bots/*-bot.ts
  multiplayer/              Room protocol (room.ts), encryption (crypto.ts), channels: Supabase,
                            same-browser tabs, in-memory (tests)
  multiplayer/transport.ts  LocalTransport for the simulator
  hooks/                    useOnlineRoom, useGameRoom, useBotDriver, useTableClock
components/
  ui/                       PlayingCard (flip/deal animations), Toggle/Stepper/Segmented
  bs-poker/                 TableScreen (shared), LocalGame, OnlineGame, Lobby, GameTable, BidBuilder, …
  rules/                    Rules tabs, QuickDemo; HowToDialog (guide + demo dialog shared by Hold'em and Blackjack)
  holdem/                   Hold'em table, actions, results, HoldemHowTo
  blackjack/                Table, lobby, actions, round results, how-to-play dialog with demo
  menu/                     Game carousel, join-with-code dialog
  garbage/                  Boards, piles and chain animations, lobby, how-to-play dialog with demo
  rummy/                    Hand (sort, multi-select), melds, fanned discard pile, lobby, how-to dialog
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

## Texas Hold'em (as implemented)

- **Defaults:** 1,000 chips, blinds 10/20; the host can change both, and switch on blinds that
  multiply (×1.5 or ×2) every N hands. Blinds never rise by default.
- **Betting:** no-limit. Minimum raise is the last full raise; a short all-in doesn't reopen
  betting for players who already acted. Heads-up, the button posts the small blind.
- **Pots:** side pots are layered from what each player put in; folded chips stay in but can't
  win, unmatched bets are returned. Ties split the pot; odd chips go to the first winner left of
  the button. All-in hands run the board out automatically.
- **Online:** the host deals each new hand with *Next hand*; hole cards, the unturned board and
  the burns never leave the host.

## Blackjack (as implemented)

- **Table:** 1–7 players against an automated dealer; 1,000 chips, 6-deck shoe reshuffled at 75%,
  minimum bet 10 (quick chips 10/25/50/100). The host can change chips, decks and betting time.
- **Round:** 15 s to bet (deals as soon as everyone has bet; nobody bet means a fresh timer), then
  two cards each and one face up for the dealer. With an Ace showing, insurance is offered (half
  the bet, pays 2:1); with an Ace or ten showing, the dealer checks for blackjack first.
- **Moves:** hit, stand, double (first two cards; one card, then stand), split (same rank, up to 4
  hands; split Aces get one card each, and 21 after a split isn't a blackjack). Each decision has
  30 s, then you stand.
- **Dealer:** turns the hole card and draws one card at a time, hitting soft 17.
- **Payouts:** natural 3:2 (rounded down), win 1:1, tie pushes. Results show for 7 s, then the next
  betting round opens on its own; the host can deal sooner. Under 10 chips you're out; when
  everyone is out, the house wins.
- **Timers online:** the reducer takes `now` as an argument and the host stamps its own clock on
  every move; `useTableClock` on the host fires TIME_UP / DEALER_STEP / NEXT_ROUND when due.

## Garbage (as implemented)

- **Table:** 2–6 players; one deck for two players, two decks for three or more. An empty draw pile
  is rebuilt from the discards (all but the top card). One card starts the discard pile.
- **Boards:** 10 face-down slots (A–5 on top, 6–10 below). Clear your board and you get one fewer
  slot next round; the first to clear a one-slot board wins.
- **Turn:** draw from the stock, or take the top discard if you can play it. Put a number in its
  own slot and pick up the face-down card there; a wild goes in any face-down slot. The real number
  bumps a wild out of its slot, and the wild moves on. A card with nowhere to go (a dead face card,
  a slot you've already filled, a number above your slot count) is discarded and ends your turn.
- **Face cards:** Queens and Kings wild, Jacks garbage by default; the host can make Jacks wild
  instead, or set each face card.
- **End of a round:** once someone clears their board, everyone else gets one last turn. Then they
  turn over their face-down cards and can swap them between those slots; anyone whose slots all end
  up holding their own number (or a wild) clears too. Bots lay theirs out the best way. Each player
  presses Done, or the host ends it. The host can switch the last turn and reveal off, and the
  round then ends as soon as a board is cleared.

## Rummy (as implemented)

- **Table:** 2–6 players. Two players get 10 cards each (13 if the host picks it), three or more get 7;
  one deck up to four players, two for five or six, plus two Jokers per deck if wild Jokers are on.
- **Turn:** draw from the stock or the top of the discard pile, put down sets (3–4 of a rank, different
  suits) and runs (3+ in a row, one suit), lay off on any meld on the table, then discard. Empty
  your hand and the round ends. Aces play low or high (Q-K-A) by default; the host can make them
  low only, or allow K-A-2.
- **Classic:** whoever goes out scores the cards left in the other hands (A 1, 2–10 face value,
  J/Q/K 10, Jokers 15). Match to 100 by default.
- **Rummy 500:** the discard pile is spread out; take any card in it plus everything on top, if you
  play that card the same turn. Everyone scores what they put on the table (2–9 are 5, 10–K 10,
  A 15 or 5 when played low, Jokers 15) minus what's left in hand. Match to 500 by default.
- **Rummy:** going out in one turn without having melded before doubles the points.

## Bots

The host can seat Easy, Medium or Hard bots in any game, mixed freely with people.

- **No cheating:** a bot only gets an observation built from its own redacted view (the same
  `getPlayerView` real players get). Tests check a bot's choice doesn't change when the hidden
  cards of others do.
- **Pacing:** 0.9–1.8 s of "Thinking…", plus time for any deal animation still running.
- **Who runs them:** the local simulator, or the online host's tab only, so each bot move is made
  once and broadcast like any other.
- **BS Poker:** Easy bids by feel; Medium runs 100 Monte Carlo rollouts (calls BS under 22%);
  Hard runs 350 with bid inference (earlier bidders likely hold what they bid), calls under 28%,
  and makes occasional pressure bids.
- **Hold'em:** Easy is loose-passive; Medium is tight-aggressive with 150-run equity vs pot odds;
  Hard plays position-aware ranges, 400-run equity, thin value bets, semi-bluffs, and respects
  heavy action on scary boards.
- **Blackjack:** Easy hits until it gets nervous (14–17); Medium plays the rule of thumb (hit 11
  or less, stand on 12–16 against 2–6) plus doubling 10/11 and splitting Aces and 8s; Hard plays
  full basic strategy. Only Easy ever takes insurance.
- **Garbage:** each step of a bot's chain is 900 ms apart so you can follow it. Easy takes a
  playable discard half the time and puts wilds in the first open slot; Medium always takes it and
  puts wilds where that number has shown up most; Hard puts wilds where the fewest copies are left
  unseen (discards and every board).
- **Rummy:** a bot's melds, lay-offs and discard come 900 ms apart. Easy draws from the stock 80% of
  the time, melds when it can and discards at random; Medium takes the top discard when it makes a
  meld, lays off, and throws away its highest unconnected card; Hard also weighs every Rummy 500
  dig, drops pairs and near-runs whose cards are all gone, and avoids discards that would feed the
  table or the next player.

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
