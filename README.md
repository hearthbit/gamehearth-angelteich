# Angelteich

Angelteich (fishing pond) is a cozy fishing game for the whole family: taking turns, you cast your line, catch fish, sell them in the shop, buy better rods and fill your collection book. A game for [Gamehearth](https://github.com/hearthbit/gamehearth-starter), the self-hosted game platform, in German and English, with a pixel-art cover, bots for empty seats and sounds.

The game gets onto a Gamehearth server through a catalog, for example the [Gamehearth catalog](https://github.com/hearthbit/gamehearth-catalog): add the catalog in the admin view ("Verwaltung") and install Angelteich.

## Rules

For 1 to 4 players, each on their own phone.

- A fixed number of rounds is played (3, 5 or 8). In every round everyone has one turn, always in the same order (seat 1 starts).
- Whoever's turn it is casts the line. That costs 1 bait. Without bait you can't fish.
- What bites is a matter of luck: usually a common fish, sometimes a rare one, very rarely a legendary one. Now and then nothing bites at all, or you pull out an old boot. Every fish has a size in centimeters that is a little random.
- **Who wins:** every fish counts as many points as it is centimeters long. After the last round the longest fish chain wins, that is, whoever caught the most centimeters in total. Boots don't count. In a tie, everyone with the longest chain wins; if nobody caught a fish, nobody wins.
- Caught fish (and boots) go into the bucket. In the shop ("Laden") you can sell the bucket at any time during your turn. You keep the centimeters anyway. At the end of the match the shop buys all remaining fish.
- The shop has bait (1 bait for 2 coins, 5 bait for 10 coins; the bait tin holds at most 20) and the next better rod. Buying and selling work only during your own turn and don't end it; only casting ends the turn.

### Fish

| Species | Rarity | Size | Price in the shop |
|---|---|---|---|
| Goldfish (Goldfisch) | common | 8–18 cm | 1 coin |
| Roach (Rotauge) | common | 12–26 cm | 2 coins |
| Perch (Barsch) | common | 15–35 cm | 2 coins |
| Carp (Karpfen) | common | 25–60 cm | 4 coins |
| Trout (Forelle) | rare | 30–65 cm | 7 coins |
| Koi | rare | 35–75 cm | 10 coins |
| Eel (Aal) | rare | 50–110 cm | 8 coins |
| Pike (Hecht) | rare | 60–130 cm | 10 coins |
| Giant catfish (Riesenwels) | legendary | 160–250 cm | 50 coins |
| King carp (Königskarpfen) | legendary | 100–160 cm | 60 coins |
| Old boot (Alter Stiefel) | – | doesn't count | 1 coin |

### Rods

Everyone has a wooden rod from the start. Better rods make rare and legendary fish more likely. The shop only ever has the next better one.

| Rod | Price | nothing | boot | common | rare | legendary |
|---|---|---|---|---|---|---|
| Wooden rod (Holzrute) | – | 15% | 10% | 62% | 12% | 1% |
| Bamboo rod (Bambusrute) | 20 coins | 12% | 8% | 58% | 20% | 2% |
| Pro rod (Profirute) | 50 coins | 10% | 6% | 50% | 30% | 4% |
| Gold rod (Goldrute) | 120 coins | 8% | 4% | 42% | 38% | 8% |

### What stays beyond the match

- Coins, bait and rods stay in your own profile and are there again next time.
- **Starter pack:** whoever plays for the first time can open a starter pack with 10 bait and 10 coins once. Never again after that.
- **Emergency worm:** whoever has no bait and can't afford any even by selling the bucket finds a worm in the grass once per match. If that doesn't work either any more, you have to sit out.
- **Collection book:** it remembers for every player which fish species they have already caught, and the biggest catch of each species. In the game under "📖 Book" ("📖 Sammelbuch").
- **Leaderboard:** the biggest fish anyone has ever caught is on the leaderboard on the platform's game page. The profile also counts caught fish and wins.
- Guests play with an empty profile that expires after the match.

## Options

- **Rounds** ("Runden"): 3, 5 (default) or 8. The host sets them in the lobby.

## Bots

The host can fill empty seats with bots in the lobby, for example to fish alone against two bots, and whoever has to leave during a match can let a bot play for them until they come back. The bot opens the starter pack if it still can, sells its bucket once it holds 5 catches or when the coins pay for the next better rod or for bait, buys that rod as soon as it can afford it (keeping 2 coins for a bait if it has none left), buys bait (a pack of five if it can) when it has none left, and otherwise casts. Without bait and coins it looks for the emergency worm or sits out, so it never holds up the match. A bot from the lobby plays with an empty profile like a guest; a seat handed over to a bot keeps its player's profile, so the bot fishes with that player's rods and may spend their coins on bait and a better rod.

## Sound

The phone plays sounds when the sound switch in the game menu is on (it is off by default; on an iPhone the ringer has to be on too):

- **Casting:** a whoosh of the line and a plop when the bobber lands.
- **What bites:** a sad "blub" when nothing bites, a comic "wah-wah" for the old boot, a short jingle for a common fish, a longer one for a rare fish and a fanfare for a legendary one.
- **Shop:** the till rings when you sell or buy bait, with a little tune on top for a new rod; a tune when you open the starter pack and a pop when you find the worm.
- **Your turn:** a blip when it is your turn again (not when you fish alone).
- **End:** a win or lose tune when the results appear.

Every phone shows every cast, so the casting and biting sounds play for everyone's casts; the shop, your turn and the end only sound on your own phone.

## Languages

German (the default) and English. The platform picks the language of each device, so everyone at the same pond can play in their own language; in `npm run dev` the selector at the top switches it. All texts of the game are in `client/src/texts.ts`, including the fish, rod and rarity names and the descriptions for screen readers; the manifest has the description, the option and every item, stat and flag label in both languages. The values of the collection book flags stay in the form "87 cm" in both languages.

## Cover

`client/public/cover.svg` shows the pond at sunset with a rod, a red bobber and an orange fish next to the hook, in pixel art (64 × 48 pixels, 4:3), drawn for Gamehearth and released under CC0. The manifest names it with `"cover": "cover.svg"`, the build copies it into `dist/client`, and the platform shows it as the screen of the game's arcade cabinet.

## Try it out

You need Node 22 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5180. All players sit there side by side; you can play each seat yourself or give it to the game's bot. Below each seat you can expand the profile and change it, for example to give someone coins. The "Sound" switch at the top turns the sounds on and names the last one played.

## Develop

This game is easy to build on with an AI agent (Claude Code, Cursor, Copilot …). The instructions for the agent are in [AGENTS.md](AGENTS.md).

| Command | What it does |
|---|---|
| `npm run dev` | starts the game locally with all players in the browser |
| `npm test` | tests |
| `npm run typecheck` | type check |
| `npm run check` | checks the game like the platform does, with hundreds of random matches and matches in which the game's bot plays every seat |
| `npm run pack` | builds the game package for a catalog |

## License

Code under MIT, graphics under CC0 (see [LICENSE](LICENSE) and `manifest.json`). All images in the game are drawn with Phaser; the only image file is the cover, drawn for Gamehearth. The sounds are notes the platform synthesizes, so there are no sound files either. There are no third-party graphics files.
