# Instructions for AI agents

This repo is a game for **Gamehearth**, a self-hosted game platform. Several people play on their own devices in the browser; the game rules run on the server, the UI runs in each player's browser. Here you build a game together with a person. Read this whole file before you change anything.

## Who you work with

The person probably can't program. They know their game, not the code.

- Talk to the person in the language they write in, and write the whole `README.md` in it. The game speaks the person's language first and English second; for an English-speaking person only English. Deviate only if the person wants it. Everything players read comes in every language of the game: all texts in the game (also the hidden labels for screen readers) and `name`, `description` and every `label` in `manifest.json` (see "Languages"). Code, identifiers, IDs, comments and tests are in English. Labels this file quotes from the example (such as a button group name) change with the language of your game.
- Talk about game rules, not about code. Ask what should happen ("What happens when the deck is empty?"), not how it is built.
- Settle the rules completely before you build them: player count, how a move goes, who sees what, when the game ends, who wins, what happens in a tie. Also ask about variants and house rules people want to set before the match (number of rounds, "stack 7s"); they become options. Write the rules in everyday language in `README.md` and have them confirmed.
- Work in small steps and show something to try out after each step (`npm run dev`, see below). Say in one sentence what changed and what the person should try.
- Use technical terms only with an explanation. Translate error messages into one sentence about what is wrong and what you do about it.
- If the person is not available right now, decide open points sensibly yourself and write them into `README.md` under "Decided by the agent, please check" (in the README's language) so they can confirm or change them later.
- Before the first release, ask about the license and the name (see "Publishing").

## Layout

| Path | Content |
|---|---|
| `manifest.json` | name, version, languages, cover, player count, license, options and the catalog of the profile (`items`, `stats`, `flags`) |
| `ids.lock` | all profile IDs the game ever had; maintained by `npm run check`, belongs in the repo |
| `src/game.ts` | the game rules (reducer), run on the server |
| `src/index.ts` | exports the game as `default` |
| `client/src/main.ts` | connects the UI to the platform and starts Phaser |
| `client/src/scene.ts` | draws the game with Phaser 4 |
| `client/src/view.ts` | everything the UI decides, without Phaser (texts, order, positions); easy to test |
| `client/src/access.ts` | invisible buttons for keyboard and screen readers, one per legal move |
| `client/src/texts.ts` | every text of the UI, one block per language |
| `client/public/cover.svg` | the cover of the game (4:3); the build copies `client/public/` into the client folder |
| `test/` | tests for rules and UI logic (Vitest) |
| `dist/client/` | the built UI (created by `npm run build`, do not change by hand) |

The template contains a small example game, **Card Duel**: everyone plays a card face down at the same time, the highest gets a point, after 3, 5 or 7 rounds (option "Rounds", default 5) whoever has the most points wins. Whoever wins gets a win and a joker in their profile; if you play a card with a joker, it counts double, and the joker is used up. It shows the most important patterns. Replace it completely with the person's game (see "Replacing the example").

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | starts the game locally at http://localhost:5180 with all players side by side |
| `npm test` | tests |
| `npm run typecheck` | type check of rules and UI |
| `npm run check` | checks the game like the platform does: manifest, license, hundreds of matches with random bots, leaks, determinism, run in the server sandbox |
| `npm run pack` | builds the game package `dist/<id>-<version>.zip`, only if `check` reports no errors |

`npm run dev` runs until it is stopped. Start it in the background and read its output: the address is there (usually http://localhost:5180; if the port is taken, for example because `dev` is already running, a different one), and errors from the rules and from the UI show up there as a block of text you can fix directly. If a `dev` is already running for this game, keep using it instead of starting a second one. The person opens the address in the browser. When the rules or the UI change, `dev` reloads by itself and replays the running match with the new code. Stop `dev` at the end together with its child processes (on Windows, for example `taskkill /T /F` on the process at the port from the output).

### Checking the UI

In `dev` the UI runs as isolated as on the platform: in a sandbox iframe without its own origin, also at the addresses of single seats (`/p1`). Some built-in browsers of AI tools do not load such iframes (for example the browser pane of the Claude app: the frames stay empty, the requests fail with `net::ERR_BLOCKED_BY_CLIENT`). There the UI code does not run at all; a terminal without errors then proves nothing. What helps:

- If you have Playwright or a remote-controlled Chrome, operate the page yourself. With Playwright you reach a frame with `page.locator(".seat").nth(0).frameLocator("iframe")`. Via the Chrome DevTools protocol the isolated frames are missing from `Page.getFrameTree` because they run in their own process; you reach them with `Target.setAutoAttach({ autoAttach: true, flatten: true, waitForDebuggerOnStart: false })`. Every frame has the invisible buttons from `client/src/access.ts` (group "Your moves"). Playwright does not belong in the game's `package.json`: install it in a separate folder outside the game (`npm i playwright-core` there) and launch the Chromium that is installed on the machine, or use the remote-controlled Chrome. The invisible buttons are only 1 pixel large and covered by the canvas: press them with `focus()` and `keyboard.press("Enter")`, or with `click({ force: true })`. The box `#state` on the page of `dev` holds the whole state as JSON, for example whose turn it is. The frames side by side are always 360 × 640; also open a single seat (`/p1`) at a small phone size such as 320 × 568. That page keeps the header of `dev` above the frame: make the window taller by the header's height, or measure `.frame`.
- As soon as a browser really loads the frames, errors and `console.log` of the UI show up in the terminal of `dev` with the seat and the place in the source. Read them there.
- What the UI decides (texts, which tap is which move, positions) belongs in `client/src/view.ts` and is tested in `test/view.test.ts`. The more is there, the less you have to look at in the browser.
- If you could not see the UI yourself, say so explicitly at handover and ask the person to open http://localhost:5180 in their normal browser and tell you what they see. That is the most important test anyway.

## Workflow

1. Settle the rules with the person and write them into `README.md`.
2. Design the state: what does everyone see (`public`), what does only one player see (`players[seat]`), what does nobody see (`secret`)? And what stays in the profile beyond the match (see "Profiles")?
3. Write `src/game.ts`, plus tests in `test/rules.test.ts` for every rule, especially for special cases and the end. To test a rule with a particular deck or draw, change `match.state` after `createMatch` and recompute the moves with `refreshMatch` ("A test with a fixed order" in the SDK README).
4. `npm test` and `npm run typecheck`.
5. `npm run check` until no more errors come. Read warnings and decide deliberately.
6. Adapt the UI: first `client/src/view.ts` (with tests in `test/view.test.ts`), then `client/src/scene.ts`.
7. `npm run dev`, the person plays it. Work in the feedback, repeat from step 3.

Before every handover to the person, `npm test`, `npm run typecheck` and `npm run check` must pass without errors.

## The most important rules for `src/`

The game rules are a **reducer**: four pure functions in `defineGame` from `@gamehearth/sdk`.

```ts
setup({ players, random, options, profiles })   // start state; players = ["p1", "p2", …]
legalMoves(state, player, { players, options, profiles })  // all moves this seat may make right now (array, empty = may not)
apply(state, action, { player, players, random, options, profiles, profile, now })  // apply a move; changing state directly is allowed
result(state)                         // undefined while running; otherwise { winners: ["p2"] }
bot(state, player, moves, { players, random, options, profiles, now })  // optional: picks one of moves for a bot seat (see "Bots")
```

1. **No `Math.random()`, no `Date.now()`, no `new Date()`.** Randomness only via `random` (`random.int(1, 6)`, `random.pick(list)`, `random.shuffle(list)` returns a shuffled copy, `random.weighted(table)` draws an entry by its integer `weight`), time only via `ctx.now`. Every match must be exactly repeatable from seed and moves.
2. **The state is plain JSON** with exactly three areas: `public` (everyone sees it), `players` (one entry per seat, only this player sees it), `secret` (nobody sees it). No `Set`, no `Map`, no `Date`, no classes, no `undefined` in arrays.
3. **Put every piece of information in the right area.** The platform uses them to filter what each device gets. Hand cards belong in `players[seat]`, the deck in `secret`. A hidden choice (as in the example) stays with the player until everyone has chosen, and only then moves to `public`.
4. **Moves give nothing away.** Everything in `legalMoves` goes to this player's client. `{ type: "draw" }` is right, `{ type: "draw", card: 17 }` reveals the top card of the deck.
5. **Whose turn it is goes in `public`.** The platform tells nobody who currently has moves. The UI reads it from the state.
6. **`apply` only gets legal moves.** Don't check again in it whether a move is allowed; the platform does that with `legalMoves`.
7. **If nobody can move any more, `result` must return a result.** Otherwise the match hangs. Draw: several winners; everyone lost: `{ winners: [] }`.
8. **Seats instead of names.** Players are called `p1`, `p2`, …; names exist only in the UI via `players`. The order of `players` is the turn order.
9. **No changing variables outside the functions.** On the server many matches run in the same module.
10. **Only the language itself.** The rules run on the server in QuickJS: no `console`, no `structuredClone`, no `Intl`, no network, no files. You may import only files from this folder and `@gamehearth/sdk`, no npm packages with Node functions.
11. **`setup` does not need to check the player count.** The platform only starts with a number from `manifest.json`.

### Patterns

If nothing is hidden (for example in board games), every seat gets an empty object, and `secret` is empty too:

```ts
type Board = GameState<Public, Record<string, never>, Record<string, never>>;

setup({ players }) {
  return {
    public: { /* … */ },
    players: Object.fromEntries(players.map((player) => [player, {}])),
    secret: {},
  };
}
```

Taking turns: whose turn it is goes in `public`; only this seat has moves. The order of the seats is in `ctx.players` (in `legalMoves` in the third parameter) and is always `p1`, `p2`, … like `Object.keys(state.players)`. Whoever is out is skipped when passing on; think of the case that only one is left.

```ts
legalMoves(state, player) {
  if (state.public.winner !== null || player !== state.public.current) {
    return [];
  }
  return freeColumns(state).map((column) => ({ type: "drop", column }));
},

apply(state, action, { player, players }) {
  // … make the move …
  state.public.current = players[(players.indexOf(player) + 1) % players.length]!;
},
```

Everyone chooses face down at the same time: the choice stays with the player (`players[seat]`), `public` only says who has already chosen; only once everyone has chosen does everything move to `public`. The example in `src/game.ts` does it this way.

Who starts is an advantage in many games. If it should be random, `setup` draws it with `random.pick(players)`.

### Options

Variants that are set before the match are in `manifest.json` under `options`, like "Rounds" in Card Duel: either a choice from fixed values (`"type": "choice"` with `choices`, values are integers or short texts) or yes/no (`"type": "boolean"`), always with `label` and `default`. The host sets them in the lobby. Names consist of letters and digits, for example `stackSevens`.

- The rules read them as `ctx.options` in `setup`, `legalMoves`, `apply` and (in realtime games) `tick`, always complete, never as part of the state. You give the type to `defineGame` as the third type parameter, like `Options` in `src/game.ts`.
- `result` gets no options. If the end depends on them, `apply` decides (in the example it sets `finished`) or `setup` writes the value into `public`.
- The UI gets them with every update as `update.options`, in the example for "Round 2 of 5" in `client/src/view.ts`.
- `check` plays every value of every option. Findings name the options, the command to replay sets them with `--option rounds=7`.
- Tests pass the options to `createMatch` (`options: { rounds: 5 }`, see `test/rules.test.ts`); without them `ctx.options` is empty. Whoever calls `legalMoves` directly in a test passes `{ players, options, profiles }` as the third parameter.
- Only ask for an option if the person really wants the variant. If a game needs none, `options` goes out of the manifest and `Options` out of the rules.

### Free inputs (typed text, free positions)

If players type something (a guess, a team name) or pick a free position, the input cannot be listed in `legalMoves`. Put a placeholder in its place: `text({ min: 1, max: 40 })` for a text, `int({ min: 0, max: 99 })` for a whole number, both imported from `@gamehearth/sdk`; that needs `"sdk": "^0.1.7"` in `manifest.json`. Details are in the SDK README under "Free inputs: placeholders".

- `apply` gets the typed value and must cope with every value the placeholder allows: `check` and the bots in `dev` type random texts, with umlauts, emoji and punctuation.
- In the UI, `snapshot.moves` contains the placeholder itself: recognize the move by its `type`; `isPlaceholder` from `@gamehearth/sdk/client` gives you its limits, for example for `maxLength` of an input field.
- Typing needs a real `<input>` element in the HTML, not text drawn on a canvas; only then does the phone show its keyboard. Use a font size of at least 16 px, otherwise the iPhone zooms in. The game frame does not submit forms (a `<form>` never fires `submit`): send on the button's `click` and on Enter (`keydown`, `event.key === "Enter"`, not while `event.isComposing`).
- Who may read a typed text is decided, as always, by where the rules put it: a text that only some players may see goes into their `players[seat]` areas, never into `public`.

### Profiles

What should stay beyond a match goes in the player's **profile**: collected items, wins, best scores, unlocks. The platform keeps one profile per account and game; the game has no database of its own. In Card Duel, whoever wins gets a win (`wins`, with a leaderboard) and a joker (`joker`) they can use in a later match. Ask the person whether anything should stay beyond a match; if not, the game needs no profile.

- **Catalog in the manifest.** Every ID is in `manifest.json` with a display name: `items` (a count, for example jokers or coins), `stats` (numbers; with `"better": "higher"` or `"lower"` the stat gets a leaderboard on the platform's game page, without `better` it is a counter) and `flags` (`true` or a short text, for example for unlocks or "87 cm"; the platform's game page shows `true` as "yes" ("ja") and a text as it is). Names of lowercase letters, digits and `-`.
- **IDs are forever.** `npm run check` enters every ID in `ids.lock`; the file belongs in the repo. Never rename or delete a published ID, but leave it with `"deprecated": true`, otherwise all players lose what they collected. Only IDs that were never published (for example those of the example) may be deleted from `ids.lock` by hand.
- **Reading:** `ctx.profiles[seat]` in `setup`, `legalMoves`, `apply` and `tick`, for example `ctx.profiles[player]?.items.joker ?? 0`. Empty entries are missing.
- **`legalMoves` only offers what the profile allows.** A move that uses up a joker is only in the list if there is one. `check` reports it as an error if that is missing.
- **Writing:** `ctx.profile.add(seat, item, n)`, `use(seat, item, n)` (use up), `stat(seat, name, n)` (change a counter, also for wins), `record(seat, name, value)` (best score: the platform keeps the better one, only for stats with `better`) and `flag(seat, name, value)` (`false` deletes), only in `apply`. Move and profile change together or not at all.
- If an item is gone in the meantime because another match of the same player used it up, the platform rejects the move, and nothing changes. The game does not have to do anything for this.
- Guests have an empty profile that expires after the match; the game does not need to know about guests.
- **Types:** `import manifest from "../manifest.json"` and `CatalogOf<typeof manifest>` as the fourth type parameter of `defineGame` (like `Ids` in `src/game.ts`). Then a typo in an ID is a type error.
- **Tests:** `createMatch` and `applyMove` get `catalog: manifest` and the profiles per seat (`profiles: { p1: { items: { joker: 1 }, stats: {}, flags: {} } }`); the changes of a move are in `outcome.changes`. Whoever calls `legalMoves` directly passes `{ players, options, profiles }`. Examples in `test/rules.test.ts`.
- **UI:** it gets its own profile with every update as `update.profile`, never that of the other players. You give the type to `connect` as the fourth type parameter.
- **In `dev`** every seat has a collapsible profile at the bottom that you can edit, for example to give a seat three jokers. It is stored in `.gamehearth/dev-profiles.json` (listed in `.gitignore`) and stays across matches and restarts; if you change the file directly, start a new match afterwards. "Guest" at a seat lets it play with an empty profile that expires after the match.

Card games:

- **Equal cards get their own names**, for example `cat-1` and `cat-2` instead of `cat` twice. Otherwise `check` takes equal cards at two players for a copy and warns, and real leaks are harder to spot. The leak check does not detect texts under 2 characters and numbers at all; hidden cards as texts like `hearts-7` are therefore safer than numbers (Card Duel uses numbers for simplicity).
- **Drawing from a hidden hand** (for example from the neighbor): the move names only the slot, `{ type: "draw", slot: 2 }`, never the card. The number of moves depends only on the public card count. Shuffle the hidden hand in `apply` with `random.shuffle` before you take the card at the slot, otherwise a sorted hand reveals what is where.
- **What a player lost** does not need to be in the state. Their UI can work it out from their hand before and after. A copy at two players would be a leak or at least a warning.

### Bots

Only a game with a `bot` function offers bots on the platform: the host fills up the lobby with bots (Card Duel for two plus two bots, or alone against bots), and whoever has to go hands their seat to a bot. `bot(state, player, moves, ctx)` in `defineGame` returns one of `moves`, the legal moves of this seat. Card Duel's bot mostly plays its highest card and keeps its joker for the last round.

- A simple bot is enough: it should play sensibly, not perfectly. Prefer moves that bring the match forward, otherwise a table full of bots never finishes.
- `bot` is pure like the rest: state, moves and profiles are read-only (sort a copy, `[...moves].sort(…)`), there is no `ctx.profile`, randomness only from `ctx.random`. `undefined` leaves the choice to the platform (a random legal move).
- `npm run check` plays extra matches in which your bot plays every seat; a bot that throws, picks a move that is not legal, changes what it gets or never finishes a match is an error there. In `npm run dev` the "Bot" switch of a seat plays with your bot.
- If random moves make no sense in the game and a sensible bot is too hard, leave `bot` out; then the platform offers no bots.
- Test it with `botMove` from `@gamehearth/sdk/platform` (`test/rules.test.ts`): it always picks a legal move, and a match of bots ends.

### Playing on without seats that are away

Turn-based matches never pause: whoever is gone simply does not move, and the others wait or hand the seat to a bot. `"away": "play-on"` in the manifest exists only for realtime games.

## The UI

- The UI runs in an isolated iframe. It talks to the platform only via `@gamehearth/sdk/client`: `connect()`, `game.onUpdate(...)`, `game.move(move)`. No `fetch`, no WebSocket, no images or fonts from other addresses; only files from your own build.
- An update contains this player's **snapshot** (`public`, `me` = own area, `moves` = own legal moves, `result`), `players` with names, `options` with the game options of the match and `profile` with the own profile. What is not in the snapshot, the UI does not know; so it cannot give anything away.
- Only send moves from `snapshot.moves`. The new update then comes via `onUpdate`, not as the answer of `move`.
- The platform shows connection drops and errors itself.
- Graphics: easiest to draw with Phaser (as in the example). Your own files go into `client/public/` and need a CC0, CC-BY or CC-BY-SA license; no images from the internet without a clear license. Sound comes from the platform (see "Sound").
- The platform is built for phones first. Test in `dev` with the narrow frames; everything must work by tapping.
- Phaser 4, not Phaser 3: examples on the web are often Phaser 3. Stick to the patterns in `client/src/scene.ts`; error messages about unknown methods usually come from Phaser 3 code.
- **Cover:** `cover` in `manifest.json` names the picture the platform shows for the game, a file in the built client folder (the example's `client/public/cover.svg` ends up as `dist/client/cover.svg`). PNG, WebP or SVG, aspect ratio 4:3, at most 256 KB; `npm run check` checks it. Without image tools, pixel art as SVG is easiest: `<rect>` elements on `viewBox="0 0 64 48"` with `shape-rendering="crispEdges"`. Replace it with a picture of your game.

## Sound

The platform plays the sounds; the UI only names them: `game.sound("coin")` with a name from the SDK (`tap`, `blip`, `select`, `move`, `coin`, `hit`, `pop`, `start`, `tick`, `error`, `win`, `lose`) or `game.sound({ notes: [{ freq: 440, length: 0.1 }] })` with notes of your own (SDK README, "Sound"). No audio files and no Phaser audio (`audio: { noAudio: true }` stays).

- Sounds are for events, not for every frame: Card Duel plays `select` when you play a card, `coin` or `pop` when the cards are revealed and `win` or `lose` at the end (`soundFor` in `client/src/view.ts` compares the previous and the new snapshot). The platform plays at most 12 per second.
- Every player has their own device here, so every sound is personal and comes from that player's phone. In games with a TV, shared sounds (start, end, a point for someone) come from the TV and personal ones (your turn, your card) from the phone.
- Sound is off by default; players turn it on in the menu of the game page, and on an iPhone the ringer switch must be on too. So nothing important may only be heard. `game.soundOn` says whether it is on.
- In `npm run dev` the "Sound" switch at the top turns it on (also off by default); the header names the last sound played, so you can check it without speakers.

## Languages

The example speaks English and German; the German is only an example of a translation. Replace it with the languages of your game (see "Who you work with").

- **`manifest.json`:** `"languages": ["de", "en"]` lists the languages, the first is the default; for an English-speaking person `["en"]`. `name`, `description` and every `label` (options, choices, `items`, `stats`, `flags`) are one text for all languages or one text per language: `"label": { "de": "Runden", "en": "Rounds" }`. `npm run check` reports a missing language as an error and plain texts in a game with several languages as a warning; a text that is the same in every language (a proper name, a number) may stay plain. The name of the game is such a proper name only if it really is one (Mau-Mau); a title that describes the game (Higher or Lower) gets one text per language, in `manifest.json` and in `client/src/texts.ts` (`new --name` writes it into both as one text).
- **UI:** every text players see or hear is in `client/src/texts.ts`, made with `defineTexts` from `@gamehearth/sdk/client`: one block per language with the same keys (a key missing in one language is a type error), functions for numbers and plurals. After `connect()`, `const t = texts(game.language)` takes the language the platform chose; `client/src/main.ts` passes `t` to the scene, to `client/src/access.ts` and to the functions in `client/src/view.ts`. Numbers and times follow the language too (decimal comma in German). Write the blocks in the order of `languages`: the first block is the fallback for every other language (`test/view.test.ts` checks that). Test the main texts in every language in `test/view.test.ts`.
- **The rules produce no texts for players.** The `message` of a rejected move is an English text for developers; if the UI explains a rejection, it shows its own text from `texts.ts` per `code`.
- The language does not change during a match; when a player switches it, the platform reloads the game. In `npm run dev` the selector at the top switches all frames (also `/p1`) and reloads them; look at every language there.

## Typical errors

| Message or symptom | Cause and fix |
|---|---|
| `Math.random() is not allowed in games` | use `random` from `setup` or `ctx.random` in `apply` |
| `on the first run … on the repeat …` | state outside the functions or randomness that cannot be repeated |
| `… is a Set` or `… only JSON values are allowed` | use arrays or objects with `true` values |
| `after apply nobody can move, but result reports no end` | `result` must return a result in this situation, or `legalMoves` forgets moves |
| Leak: moves of p1 depend on hidden values | a move contains something from `secret` or from other players |
| Warning: value is in `public` and at a player at the same time | revealing means moving, not copying |
| Warning: legal move changes nothing | `apply` lacks a case for this move type |
| Match never ends | `result` does not detect the end, or a move does not move the game forward |
| Match never ends only in your own test, or `ctx.options.rounds` is `undefined` | the test calls `createMatch` without `options` |
| `--option rounds=4: there is no such value` | only values from `choices` in the manifest; for yes/no `true` or `false` |
| `The item "…" is not listed under items in manifest.json` | add the ID to the manifest or fix the typo (the message suggests the intended name) |
| `legalMoves offers a move for which an item is missing in the profile` | in `legalMoves` check the stock before a move with `use` is offered |
| `The item "…" is listed in ids.lock, but is missing under items` | put the ID back in the manifest, with `"deprecated": true`; only delete never-published IDs from `ids.lock` |
| `ids.lock is missing` or `is out of date` (in CI) | run `npm run check` locally and commit `ids.lock` |
| `ctx.profile.use exists only in apply, not in tick` | move the use into the move that triggers it |
| `bot threw an error`, `bot returned a move that is not legal`, `bot tried to change the state …` | fix `bot`; the replay command with `--bots` shows the match in which every seat is a bot |
| `Matches in which the game's bot plays every seat do not end` | let `bot` prefer moves that bring the match forward |
| `is outside the game folder` | only import files from this folder and `@gamehearth/sdk` |
| `… has no text for "en"` | add the text in the missing language to this entry in `manifest.json`; remove a language from `languages` only if the person asked for that |
| `cover: … must have the aspect ratio 4:3` or `cover: … is missing in the built client folder` | fix the size (`viewBox`) of the picture, or put it into `client/public/` and build again |
| Type error `Type 'string' is not assignable to type '"play"'` (often with long text about `exactOptionalPropertyTypes`) | a move as an object literal without a type; write `const action: MyMove = { type: "play", … }` |
| UI stays empty, `dev` shows an error from the iframe | read the error message with file and line in the output of `dev` |
| In the browser console: `Unrecognized Content-Security-Policy directive 'webrtc'` | harmless: the platform's isolation forbids WebRTC also for browsers that know the rule; Chromium does not know it yet |

Every finding of `check` names a command that replays exactly this match (`npx gamehearth check . --players 3 --seed check-3-17`, with changed options with `--option`). With it you see all moves one by one.

## Replacing the example

Once your own game stands, nothing of Card Duel may be left:

- `manifest.json`: set `languages`, `name`, `description`, `players`, `roles`, `options`, `items`, `stats` and `flags` to fit (without variants `options` goes away, without a profile `items`, `stats` and `flags` go away). The IDs of the example (`joker`, `wins`) were never published in your game: whatever of them goes away, you also take out of `ids.lock`, otherwise `check` reports it as missing. If no IDs remain at all, delete `ids.lock`; `check` creates it again with the game's first ID. The `id` comes from the folder name. If it does not fit (for example `my-game` from the starter repo), change it now in `manifest.json` and `package.json`: only lowercase letters, digits and hyphens. After the first release it never changes again.
- `package.json`: `description`, in English like the code.
- `src/`, `client/src/`, `test/`: rules, UI and tests of your own game. You may keep or change the file names, only `src/index.ts` must export the game as `default`. `client/src/texts.ts` gets the languages of your game; the example's German goes away unless German is one of them.
- `client/index.html`: title. `client/public/cover.svg`: a cover of your game.
- `README.md`: rules of your own game; remove the note "still contains the example" at the top.
- Finally search for leftovers: `Card Duel`, `Kartenduell`, `duel`, `Duel` in `src/`, `client/`, `test/`, `README.md`, `manifest.json` and `package.json`.
- The original example then stays available for reference under `node_modules/gamehearth/templates/turn-based/`.
- `AGENTS.md` and `CLAUDE.md` stay as they are. They mention Card Duel as the template's example.

## More details

These files always match the installed version. Read them before you use something that is not in here:

- `node_modules/@gamehearth/sdk/README.md`: the full contract for rules and UI, platform errors, limits of the server sandbox
- `node_modules/gamehearth/README.md`: `dev`, `check`, `pack` and catalogs
- A larger example with hidden cards, special rules and a more elaborate UI: Mau-Mau, https://github.com/hearthbit/gamehearth-mau-mau

Don't change anything in `node_modules` and don't switch off any checks. If the contract does not allow something, tell the person what does not work.

## Publishing

Before the first release, ask the person:

- **License:** preset are MIT for the code and CC0 for graphics (see `LICENSE` and `manifest.json`). Explain briefly: everyone may then use, change and pass on the game. Other allowed licenses: any OSI license for code, CC0, CC-BY or CC-BY-SA for graphics.
- **Name in the `LICENSE`:** who is named as the author; this is publicly visible.

Steps:

1. Raise the version in `manifest.json` and `package.json` (`0.1.0` → `0.2.0`), commit.
2. Upload the repo to GitHub. A tag starts the release CI: `git tag v0.2.0 && git push origin v0.2.0`. It builds the game package with `check` and `pack` and attaches it to a release.
3. For a Gamehearth server to install the game, it needs a **catalog**: a repo of its own with a `catalog.json`. Create it and add the game with `npx gamehearth catalog add catalog.json <package-url> --name "My catalog"`. On the server, an admin adds the raw URL of the `catalog.json` in the admin view ("Verwaltung") and installs the game. Details in `node_modules/gamehearth/README.md`.
