# Showdown

Multiplayer card games on Next.js (App Router): **Texas Hold'em** (no-limit), **BS Poker**, **Blackjack**, **Garbage**, **Rummy**, **War**, **Go Fish**, **Thirteen**, **Speed** and **Bouillotte**, online or on one screen.

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
  room/[code]/              Online room (host or guest), shared by every game
  bs-poker/page.tsx         Choose: create a room on this game, join one, or local simulator
  bs-poker/room/[code]/     Old invite links; redirects to room/[code]
  bs-poker/local/           Local simulator (every seat on one screen)
  rules/, rules/demo/       How to play + guided 30-second demo
  texas-holdem/              Hold'em: chooser, room/[code]/ (redirect), local/ (simulator)
  blackjack/                Blackjack: same three routes
  garbage/                  Garbage: same three routes
  rummy/                    Rummy: same three routes
  war/                      War: same three routes
  go-fish/                  Go Fish: same three routes (local/?bots=1 seats you against two bots)
  thirteen/                 Thirteen: chooser and local/ (local/?bots=1 seats you against two bots)
  speed/                    Speed: chooser and local/ (you against a bot)
  bouillotte/               Bouillotte: chooser and local/ (local/?bots=1 seats you against three bots)
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
  war-engine.ts             War: battles, Wars and short stacks, Classic and Tactical, win conditions
  gofish-engine.ts          Go Fish: asks, go fish and lucky catches, books, empty-hand refills, memory
  thirteen-combos.ts        Thirteen: reading plays (Jokers wild), beating them, the 17 bombs, finding bombs in a hand
  thirteen-engine.ts        Thirteen reducer: dealing, the 3♠ opening, tricks, passing and lockout, bombs on 2s, winner stays on
  speed-engine.ts           Speed: real-time play in arrival order, stale moves, stalls and spare flips, slap mode,
                            and the host's clock (countdown, flips)
  bouillotte-engine.ts      Bouillotte: stripped decks, antes and the carré, betting with side pots, brélans,
                            Le Point across every hand dealt, bonuses
  sound-effects.ts          Web Audio table sounds (bomb thump, card slaps, runs, misses), with an on/off switch
  party-engine.ts           Shared rooms: the roster and tonight's wins around whichever game is on
                            (switch game, play again, back to lobby), plus their bots and timers
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
  party/                    Shared online room: game picker, post-game buttons, each game's table
  garbage/                  Boards, piles and chain animations, lobby, how-to-play dialog with demo
  rummy/                    Hand (sort, multi-select), melds, fanned discard pile, lobby, how-to dialog
  war/                      Tug-of-war counter, battle zone, WAR! banner, flip/auto-flip/speed, how-to
  gofish/                   Seats with speech bubbles and memory, hand grouped by rank, history log,
                            and a click-through lesson for first-timers
  thirteen/                 Seats, the trick pile and the bomb moment, an 18-card hand with sorting, bomb
                            finder and live preview, the bomb ladder drawer, and a three-step bomb demo
  speed/                    Piles slammed from both sides, a five-slot hand with 1–5 keys, countdown, flips,
                            the slap race, "Too slow!" bounces, and a three-step reflex drill
  bouillotte/               Seats, the Retourné in its frame, a hand helper, betting controls, the Le Point
                            meter at showdown, and a three-step showdown demo
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
- **Round:** betting has no time limit by default, so nobody is hurried; the host can set 10 s to a minute
  (then nobody betting in time means a fresh timer). Cards come out as soon as everyone has bet, then
  two cards each and one face up for the dealer. With an Ace showing, insurance is offered (half
  the bet, pays 2:1); with an Ace or ten showing, the dealer checks for blackjack first.
- **Moves:** hit, stand, double (first two cards; one card, then stand), split (same rank, up to 4
  hands; split Aces get one card each, and 21 after a split isn't a blackjack). With a betting time
  set, each decision also has 30 s, then you stand.
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

## War (as implemented)

- **Players:** two duel; anyone else in the room watches. With more than two seated, the host picks
  the duelists. Each gets half the deck (27 with Jokers, which beat everything). Suits don't count.
- **Battles:** both flip (button or Space; auto-flip at 1×, 2× or Turbo); the higher card takes both.
  A tie is a War: three face-down cards each (the host can make it 1 or 2), then one face up; the
  higher takes the lot, and further ties stack. The face-down bounty is shown once it's settled.
- **Short stacks:** too few cards for a full War puts down all but the last, which decides it; no
  cards left at all loses. Won cards are shuffled into your deck when it runs out.
- **Winning:** all the cards (default), first to 40, or most cards after 50 battles.
- **Tactical War:** hold three cards and pick one each battle (and to settle a War).

## Go Fish (as implemented)

- **Table:** 2–6 players, one deck; 7 cards each for two or three players, 5 for more. The rest is the pond.
- **Turn:** ask another player who has cards for a rank you hold. They hand over every card of it and
  you go again; otherwise "Go fish!": draw one, and your turn ends unless it's the rank you asked for
  (a lucky catch, shown to everyone; the host can switch this off).
- **Books:** four of a kind goes down at once (or a pair, in the pairs variant). An empty hand draws
  from the pond (1 card, or up to 5). When every card is booked, most books wins; ties share it.
- **Memory helper:** marks the ranks each player is known to hold, from what they've asked for and
  taken. The host can turn it off.

## Thirteen (as implemented)

- **Table:** three play, 18 cards each from 54 (two Jokers). With more in the room the host picks the three;
  with *Winner stays on*, whoever held the most cards at the end gives their seat to the next in line.
- **Order:** 3 low to Ace, then 2 on top. Suits break ties: ♠ < ♣ < ♦ < ♥.
- **Opening:** the 3♠ leads the first hand (the play must include it); after that the last hand's winner leads
  anything. The host can have the 3♠ open every hand.
- **Plays:** singles, pairs, triples, straights of 3 to 11 (no 2s), or a bomb. Follow with the same kind and size,
  higher, or pass. Passing locks you out of the trick (you can still bomb back in unless the host turns that off).
  When everyone else has passed, the last to play leads. First to empty their hand wins.
- **Jokers:** each stands in for one card of any rank (and suit, in a suited dragon). The table reads the
  strongest play the cards make, and you can switch what a Joker counts as. At the top of a play a Joker counts
  below every natural suit.
- **Bombs:** come down only on 2s (as many as the tier allows) or on a weaker bomb, or lead an empty table.

  | Tier | Bomb | Beats | Tier | Bomb | Beats |
  | --- | --- | --- | --- | --- | --- |
  | 1 | 3 consecutive pairs | one 2 | 10 | Dragon (3 to A) | four 2s |
  | 2 | Four of a kind | one 2 | 11 | 2 consecutive quads | four 2s |
  | 3 | 2 consecutive triples | one 2 | 12 | 7 consecutive pairs | five 2s |
  | 4 | 4 consecutive pairs | two 2s | 13 | 4 consecutive triples | five 2s |
  | 5 | Five of a kind | two 2s | 14 | Suited dragon | any |
  | 6 | 5 consecutive pairs | three 2s | 15 | 8 consecutive pairs | any |
  | 7 | 3 consecutive triples | three 2s | 16 | 3 consecutive quads | any |
  | 8 | Six of a kind | three 2s | 17 | 2 consecutive fives | any |
  | 9 | 6 consecutive pairs | four 2s | | | |

  A higher tier always wins; the same tier goes to the higher top card. An exact tie follows the host's rule:
  no Jokers wins, then the higher suit (default); neither can beat the other; or the later bomb wins.

## Speed (as implemented)

- **Table:** two play, 20 cards each (5 in hand, 15 in a face-down stock), five spares either side and one card
  on each middle pile. With more in the room the host picks the two; *Winner stays on* works as in War.
- **Start:** 3, 2, 1 on the host's clock, then both middle cards turn up.
- **Play:** no turns. A card goes on either pile one rank up or down, suits ignored, wrapping K–A–2. By default the
  same rank goes on too, and two to four of a rank go down together. Your hand refills from your stock, or (house
  rule) you draw yourself.
- **Arrival order:** the host applies moves as they reach it. A move made against a pile that has changed still
  lands if it fits the new top; otherwise it comes back as "Too slow!".
- **Stalls:** when neither player can go (or both ask), a spare turns onto each pile after 600 ms. With no spares
  left, everything under the two tops is shuffled into new ones; with nothing to shuffle, fewest cards wins.
- **Winning:** your last card wins, or (arcade) you must then slap Speed first. Get beaten to it and you take back
  the smaller pile (all but its top card).
- **Hands are private:** you see how many cards the other player holds, not which.

## Bouillotte (as implemented)

- **Table:** 3–5 players (down to two as players go broke), each starting with a *cave* of 100 chips (50–500).
  The deck is stripped to the table: A K 9 8 (16 cards) for two or three, plus Q (20) for four, plus J (24) for
  five. Three cards each and one face up in the middle, the *Retourné*; the rest (the stub) stays hidden.
- **Antes and carré:** everyone antes 1 (or 2 or 5), or the dealer antes for the whole table. Before the deal the
  player on the dealer's right may post a blind *carré* the size of the pot; they then act last.
- **Betting:** one round, starting left of the dealer. Pass while nobody has opened, then call, raise, *va-tout*
  or fold. No bet beyond your chips; short all-ins make side pots and don't reopen the raising. Everyone else
  folds: the bet wins without a showdown.
- **Showdown:** a brélan wins: *carré* (three of a rank and the Retourné is the fourth) beats a natural brélan
  beats a *favori* (a pair plus the Retourné; the host can turn it off), then the higher rank. A brélan that takes
  the main pot is paid 1 chip (2 for a carré) by everyone else dealt in, folded or not.
- **Le Point:** no brélan among those still in: every hand dealt is turned up, folded ones too. Each suit's points
  (A 11, K Q J 10, 9 9, 8 8) are added across all of them and the Retourné; the top suit wins (a tie goes to the
  suit with the higher card), and whoever still in holds its highest card takes the pot. Nobody still in holds
  that suit: the next suit down. Side pots are settled the same way among those who reached them.

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
- **War:** in Classic, a bot flips as soon as a battle opens, so your flip settles it at once. In
  Tactical, Easy plays at random; Medium saves Aces and Kings for Wars; Hard baits a War when it holds
  two high cards and throws low cards when the other side probably holds the high ones.
- **Go Fish:** asks come 1.2 s apart. Easy asks anyone for anything it holds; Medium remembers the
  last four asks and goes after whoever just asked for a rank it holds; Hard remembers every ask,
  steal and book, then goes for the rank it holds most of, from whoever has the most cards.
- **Thirteen:** Easy leads its lowest card (alone or in whatever it makes), follows with the lowest play that
  beats the table, and drops a bomb on a 2 half the time. Medium keeps its bombs, 2s and Jokers together until
  someone is down to four cards, then bombs 2s. Hard splits its hand into the fewest plays (Jokers included),
  follows only when it doesn't break that up, cashes cards nobody can beat when it's nearly out, and counts the
  2s already played.
- **Speed:** no turns, so a bot is a reaction time after its own last card (and at least half that after the
  piles change): Easy 1.8–2.6 s, playing one card at a time at random; Medium 1–1.5 s, sets together; Hard
  0.55–0.9 s, starting the longest run it holds and running it at 450 ms a card. The times come from the
  host-stamped state, so they don't restart when the other player moves.
- **Bouillotte:** Easy bets and calls whenever it holds an Ace or King; Medium counts its points in one suit
  with the Retourné (and whether it holds that suit's Ace) and weighs them against the price of a call; Hard
  deals the unseen cards out 300 times (folded hands included, since they count toward Le Point), plays its
  equity against the pot odds, and bluffs holding the Ace of the Retourné's suit or two Aces.

## Shared rooms (as implemented)

- **One code all night:** every online room is a shared room (`/room/CODE`). Creating one from a game's page
  opens it on that game; the host can switch to any game from the lobby (*Change game*) or the winner
  screen (*Switch game*), and nobody reconnects. The new game starts on its default house rules.
- **After a match:** the host can *Play again* (same game and house rules), go back to the *Lobby*, or
  *Switch game*. During a match, *End match* in the header goes back to the lobby.
- **Seats:** the room holds up to 9. A game seats people in room order up to its own limit; the rest sit
  out that game and watch, and are dealt in as soon as a game has room (a smaller game, someone leaving,
  or the next deal). People who arrive mid-match watch until the next deal.
- **War:** the host picks the two duelists; everyone else watches. With *Winner stays on*, the winner keeps
  their seat and the next player round the table takes them on.
- **Wins tonight:** each finished match gives its winner a crown, shown beside their name in the lobby.
  Ending a match early crowns nobody, except at Blackjack, which never finishes with a winner: ending the
  table crowns whoever has the most chips, if they're up. Someone who drops and rejoins keeps theirs.
- **How it's built:** the room is one more game for the host to run (`lib/party-engine.ts`), wrapping the
  games' own reducers, views and bots. Moves inside a game travel as `GAME` actions, sealed like any
  other move, and act only for whoever sent them.

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

Shared rooms seat newcomers at any time (`GameDefinition.seatsOpen`); other games only in the lobby.

**Limits:** the host's tab is the server. If the host closes it, the game pauses until they reopen the room
link in the same tab. A player who loses connection mid-game stays seated, but the game waits on their turn.
The anon key lets anyone who knows a room code join its lobby; the room code is the invite.
