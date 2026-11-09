# Showdown

A card table in your browser. Open a room, send the code to your friends, and play poker, rummy, war and more together, or deal yourself in against bots when nobody's around. No accounts, no downloads, nothing to install.

**[Play now at showdowncards.vercel.app](https://showdowncards.vercel.app)**

- Texas Hold'em
- BS Poker
- Blackjack
- Garbage
- Rummy
- War
- Go Fish
- Thirteen
- Speed
- Bouillotte

## What's at the table

- **One code for the whole night.** A room isn't tied to a game. The host can switch from Hold'em to Go Fish to Speed and everyone stays put.
- **Play with friends or bots.** Fill empty seats with Easy, Medium or Hard bots, mixed in with real players however you like. Every game can also be played solo.
- **Big groups.** A room holds up to 9 people. If the game has fewer seats, the host can split the room into as many as 4 tables, and you can watch the other tables from the side while you play.
- **House rules.** Each game has its own settings: starting chips, wild cards, win conditions, variants and more.
- **Chat and reactions** at the table, plus a crown next to your name for every match you win that night.
- **Learn as you go.** Every game has a rules guide and a short interactive demo you can open without leaving the room.
- **Fair deals.** Shuffles use a cryptographic random source, and your cards are encrypted so only you can see them. Bots only see what a real player in their seat would see.

## The games

### **Texas Hold'em**

No-limit Hold'em for 2 to 9 players. Everyone starts with 1,000 chips and the blinds are 10/20. The host can change both, or set the blinds to climb every few hands. You get two hole cards, five go on the board over the flop, turn and river, and the best five-card hand takes the pot. Side pots and split pots are handled for you, and when everyone's all in the board runs out on its own.

### **BS Poker**

A bluffing game built on poker hands. Five cards are dealt face up on the table, and everyone also holds a few hidden cards of their own. Take turns bidding that a poker hand exists somewhere in *all* the cards combined, yours, everyone else's and the table's. Each bid has to beat the last one. If you think someone's lying, call BS: whoever was wrong takes an extra card next round. Hold too many cards and you're out. The last player standing wins.

Only the cards a hand needs have to exist. "Pair of Kings" just needs two Kings somewhere, and a flush is bid by its top card ("Jack-high flush"). The host can turn on wild Jokers or deuces, and ban straights or flushes outright or once someone holds enough cards.

### **Blackjack**

You and up to 6 others against the dealer, from a six-deck shoe. Place a bet, then hit, stand, double down or split (up to four hands). The dealer hits soft 17. Blackjack pays 3:2, insurance is offered when the dealer shows an Ace, and a new round opens on its own a few seconds after the last one ends. The host can set the starting chips, the number of decks and a betting timer.

### **Garbage**

Each player has ten face-down cards laid out in slots from Ace to 10. On your turn, draw a card and put it in its matching slot, then pick up the face-down card that was there and play that one too. Keep going until you turn up a card with nowhere to go. Queens and Kings are wild, Jacks are garbage, and the host can change both. Fill every slot and you play the next round with one slot fewer. The first player to clear a single-slot board wins.

### **Rummy**

Draw, put down sets (three or four of a rank) and runs (three or more in a row in one suit), lay cards off on melds already on the table, and discard. Empty your hand to end the round, and the other players' leftover cards count toward your score. Play to 100 points in Classic, or switch to **Rummy 500**, where you can dig deep into the discard pile and score the cards you meld yourself. Going out in one turn with no earlier melds ("Rummy!") doubles your points.

### **War**

Two players split the deck and flip at the same time, and the higher card takes both. When the cards tie it's **War**: three cards face down each, then one face up for the whole pile. Flip by hand, press Space, or turn on auto-flip at normal, fast or turbo speed. Play until someone has every card, race to 40, or see who has the most after 50 battles. **Tactical War** gives you a hand of three to choose from each battle.

### **Go Fish**

Ask another player for a rank you're holding. If they have any, they hand them all over and you go again. If not, *go fish* and draw from the pond. Collect all four of a rank to lay down a book, and once every card is booked, whoever has the most books wins. A memory helper keeps track of who's asked for what, and the host can switch to books of pairs for a quicker game.

### **Thirteen**

A climbing game for three players with 18 cards each. Twos are the highest cards. The 3♠ leads the first hand, then play singles, pairs, triples or straights, beating whatever's on the table with the same kind of play, or pass. Pass and you're out of that trick. Get rid of every card to win.

The real fun is **bombs**: combinations like three consecutive pairs, four of a kind, or a full 3-to-Ace dragon that can beat 2s. There are 17 tiers of them, and the in-game bomb ladder shows what beats what. Jokers are wild.

### **Speed**

No turns, just reflexes. Both players race to play cards onto two middle piles, one rank up or down (King wraps around to Ace and 2). When neither of you can move, new cards flip onto the piles. Get rid of every card first to win, or in arcade mode, slap **Speed** before your opponent does. Use the 1 to 5 keys to play straight from your hand.

### **Bouillotte**

A French ancestor of poker for 3 to 5 players, played with a stripped deck. You get three cards, and one more card, the *Retourné*, is turned face up in the middle. There's a single round of betting. Three of a kind (a *brélan*) wins, and four of a kind with the Retourné (a *carré*) beats it. If nobody has one, every hand is turned over and the pot goes to the player holding the best card in the suit with the most points on the table.

## Updates

### Version 1.00: Initial release

- Ten games: Texas Hold'em, BS Poker, Blackjack, Garbage, Rummy, War, Go Fish, Thirteen, Speed and Bouillotte
- Online rooms with shared codes, game switching, room locking and up to 4 tables
- Easy, Medium and Hard bots for every game
- Room chat, reactions and nightly win crowns
- Rules guides and interactive demos for every game

## Running it yourself

Showdown is a [Next.js](https://nextjs.org) app. Online rooms run over [Supabase Realtime](https://supabase.com/docs/guides/realtime), with no database or server code needed.

```bash
npm install
npm run dev      # http://localhost:3000
npm test
```

To play online, create a free Supabase project and add its URL and anon key to `.env.local` (see `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

If Realtime is set to private channels only, turn that off, since rooms use public channels. Without these keys, online rooms still work between tabs of the same browser, which is handy for testing.

The host's browser runs the game: it shuffles, deals and sends each player only their own cards, encrypted end to end. If the host closes their tab, the game pauses until they come back.
