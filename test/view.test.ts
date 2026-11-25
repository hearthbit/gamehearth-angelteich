import { soundProblem, type Sound } from "@gamehearth/sdk/platform";
import { describe, expect, it } from "vitest";
import type { GameEvent, OwnProfile } from "../src";
import {
  bookEntries,
  bookNews,
  bookSummary,
  bucketLine,
  chipPositions,
  describeMove,
  describeTable,
  endSaleText,
  eventText,
  gridCells,
  inventoryLine,
  joinNames,
  layout,
  endShown,
  mainAction,
  newCasts,
  ranking,
  rankLine,
  rulesLines,
  shopRows,
  shownBucket,
  shownLength,
  shownSnapshot,
  statsLine,
  statusLine,
  visibleEvents,
  type CastEvent,
  type Players,
  type Snapshot,
} from "../client/src/view";
import { biteOf, biteSounds, castSound, catchSound, endSound, eventSound, flightSeconds, newEventSound, rodSound, tillSound, turnSound, yourTurn } from "../client/src/sounds";
import { texts } from "../client/src/texts";

const de = texts("de");
const en = texts("en");

const players: Players = {
  p1: { name: "Anna", connected: true, you: true },
  p2: { name: "Ben", connected: true, you: false },
  p3: { name: "Clara", connected: false, you: false },
};

function own(items: Record<string, number> = {}, flags: Record<string, string | true> = { startpaket: true }, stats: Record<string, number> = {}): OwnProfile {
  return { items, stats, flags } as OwnProfile;
}

function snapshot(extra: Partial<Snapshot> = {}, pub: Partial<Snapshot["public"]> = {}): Snapshot {
  return {
    player: "p1",
    players: ["p1", "p2", "p3"],
    public: {
      round: 2,
      current: "p1",
      bucket: { p1: [{ fish: "hecht", cm: 80 }], p2: [], p3: [] },
      length: { p1: 80, p2: 35, p3: 0 },
      best: { p1: { fish: "hecht", cm: 80 }, p2: { fish: "barsch", cm: 35 }, p3: null },
      wormUsed: { p1: false, p2: false, p3: false },
      events: [],
      eventCount: 0,
      finished: false,
      ...pub,
    },
    me: {},
    moves: [{ type: "sell" }, { type: "buy-bait", count: 1 }, { type: "cast" }],
    version: 4,
    ...extra,
  };
}

const cast = (nr: number, player: string, caught: CastEvent["caught"]): CastEvent => ({ kind: "cast", nr, player, round: 1, rod: 0, caught });

describe("Status line", () => {
  it("says whose turn it is and which round is running", () => {
    expect(statusLine(de, snapshot(), players, { runden: 5 })).toBe("Runde 2 von 5 · Du bist dran!");
    expect(statusLine(de, snapshot({}, { current: "p2" }), players, { runden: 8 })).toBe("Runde 2 von 8 · Ben ist dran");
  });

  it("names the winner, a tie and the case without a catch", () => {
    expect(statusLine(de, snapshot({ result: { winners: ["p1"] } }), players, { runden: 5 })).toBe("Du gewinnst! 🏆");
    expect(statusLine(de, snapshot({ result: { winners: ["p3"] } }), players, { runden: 5 })).toBe("Clara gewinnt! 🏆");
    expect(statusLine(de, snapshot({ result: { winners: ["p2", "p3"] } }), players, { runden: 5 })).toBe("Gleichstand: Ben und Clara gewinnen!");
    expect(statusLine(de, snapshot({ result: { winners: [] } }), players, { runden: 5 })).toBe("Niemand hat etwas gefangen.");
  });
});

describe("End only after the last catch", () => {
  const lastCast = cast(7, "p2", { fish: "hecht", cm: 90 });
  const over = snapshot({ moves: [], result: { winners: ["p2"] } }, { round: 3, current: "p2", finished: true, events: [lastCast, { kind: "end", nr: 8, sold: {} }], eventCount: 8 });

  it("does not reveal the winner while the last catch animation is running", () => {
    expect(endShown(over, 6)).toBe(false);
    const hidden = shownSnapshot(over, 6);
    expect(hidden.result).toBeUndefined();
    expect(statusLine(de, hidden, players, { runden: 3 })).toBe("Runde 3 von 3 · Letzter Wurf …");
    expect(mainAction(de, hidden, own(), players)).toMatchObject({ kind: "wait", label: "Letzter Wurf …" });
    expect(shopRows(de, hidden, own({ muenzen: 50 })).find((row) => row.key === "bait-1")?.note).toBe("Gleich ist Schluss");
  });

  it("shows winner and end as soon as everything is revealed", () => {
    expect(endShown(over, 8)).toBe(true);
    const visible = shownSnapshot(over, 8);
    expect(statusLine(de, visible, players, { runden: 3 })).toBe("Ben gewinnt! 🏆");
    expect(mainAction(de, visible, own(), players)).toMatchObject({ kind: "wait", label: "Die Partie ist vorbei" });
  });
});

describe("Big button", () => {
  it("offers the starter pack first, then casting", () => {
    const fresh = mainAction(de, snapshot({ moves: [{ type: "starter" }] }), own({}, {}), players);
    expect(fresh).toMatchObject({ kind: "move", move: { type: "starter" }, label: "🎁 Startpaket öffnen" });
    const ready = mainAction(de, snapshot(), own({ koeder: 7 }), players);
    expect(ready).toMatchObject({ kind: "move", move: { type: "cast" }, label: "🎣 Angel auswerfen", hint: "Kostet 1 Köder. Du hast 7 Köder." });
  });

  it("sends you to the shop without bait, otherwise to the worm or to sitting out", () => {
    expect(mainAction(de, snapshot({ moves: [{ type: "buy-bait", count: 1 }] }), own({ muenzen: 4 }), players).kind).toBe("shop");
    expect(mainAction(de, snapshot({ moves: [{ type: "worm" }] }), own(), players)).toMatchObject({ kind: "move", move: { type: "worm" } });
    expect(mainAction(de, snapshot({ moves: [{ type: "skip" }] }), own(), players)).toMatchObject({ kind: "move", move: { type: "skip" }, label: "Aussetzen" });
  });

  it("waits when it is someone else's turn or the match is over", () => {
    expect(mainAction(de, snapshot({ moves: [] }, { current: "p2" }), own(), players)).toMatchObject({ kind: "wait", label: "Ben angelt gerade …" });
    expect(mainAction(de, snapshot({ moves: [], result: { winners: ["p1"] } }), own(), players).kind).toBe("wait");
  });
});

describe("Shop", () => {
  it("shows prices, what you can buy and why something is not possible", () => {
    const rows = shopRows(de, snapshot({ moves: [{ type: "sell" }, { type: "buy-bait", count: 1 }, { type: "cast" }] }), own({ muenzen: 3, koeder: 2 }));
    expect(rows.map((row) => [row.key, row.price, row.move !== undefined, row.note])).toEqual([
      ["sell", "+10 🪙", true, ""],
      ["bait-1", "2 🪙", true, ""],
      ["bait-5", "10 🪙", false, "Zu wenig Münzen"],
      ["rod", "20 🪙", false, "Zu wenig Münzen"],
    ]);
    expect(rows[3]?.title).toBe("Bambusrute");
    expect(rows[3]?.detail).toBe("Mehr seltene Fische: 20 statt 12 von 100 Würfen, legendäre: 2 statt 1.");
  });

  it("says when the bait tin is full or it is not your turn", () => {
    const full = shopRows(de, snapshot({ moves: [{ type: "cast" }] }), own({ muenzen: 50, koeder: 20 }));
    expect(full.find((row) => row.key === "bait-1")?.note).toBe("Köderdose voll (höchstens 20)");
    const waiting = shopRows(de, snapshot({ moves: [] }, { current: "p2" }), own({ muenzen: 50, koeder: 2 }));
    expect(waiting.every((row) => row.move === undefined)).toBe(true);
    expect(waiting.find((row) => row.key === "sell")?.note).toBe("Nur wenn du dran bist");
  });

  it("shows no further rod after the gold rod", () => {
    const rows = shopRows(de, snapshot(), own({ muenzen: 500, "rute-gold": 1 }));
    expect(rows.at(-1)).toMatchObject({ key: "rod", detail: "Du hast schon die beste Rute!", move: undefined });
  });
});

describe("Collection book", () => {
  it("shows caught species with their record and the rest as unknown", () => {
    const profile = own({}, { startpaket: true, "buch-hecht": "87 cm", "buch-koi": true });
    const entries = bookEntries(profile);
    expect(entries).toHaveLength(10);
    expect(entries.find((entry) => entry.fish.id === "hecht")).toMatchObject({ caught: true, best: 87 });
    expect(entries.find((entry) => entry.fish.id === "koi")).toMatchObject({ caught: true, best: null });
    expect(entries.find((entry) => entry.fish.id === "aal")).toMatchObject({ caught: false, best: null });
    expect(bookSummary(de, profile)).toBe("2 von 10 Fischarten");
    expect(statsLine(de, own({}, {}, { "fische-gefangen": 12, "groesster-fisch": 120, siege: 2 }))).toBe("Gefangen: 12 · Größter: 120 cm · Siege: 2");
  });

  it("detects new species and new records in the profile", () => {
    const before = own({}, { "buch-hecht": "60 cm" });
    const after = own({}, { "buch-hecht": "90 cm", "buch-aal": "55 cm" });
    expect(bookNews(before, after)).toEqual([
      { fish: "aal", kind: "neu" },
      { fish: "hecht", kind: "rekord" },
    ]);
    expect(bookNews(undefined, after)).toEqual([]);
  });
});

describe("Events", () => {
  it("tells what happens at the pond", () => {
    expect(eventText(de, cast(1, "p2", { fish: "hecht", cm: 87 }), players)).toBe("Ben hat einen Hecht gefangen: 87 cm! Selten!");
    expect(eventText(de, cast(1, "p1", { fish: "forelle", cm: 40 }), players)).toBe("Du hast eine Forelle gefangen: 40 cm! Selten!");
    expect(eventText(de, cast(1, "p1", { fish: "rotauge", cm: 20 }), players)).toBe("Du hast ein Rotauge gefangen: 20 cm!");
    expect(eventText(de, cast(1, "p3", { fish: "riesenwels", cm: 200 }), players)).toBe("Clara hat einen Riesenwels gefangen: 200 cm! ✨ Legendär!");
    expect(eventText(de, cast(1, "p2", { fish: "stiefel", cm: 0 }), players)).toBe("Ben hat einen alten Stiefel geangelt!");
    expect(eventText(de, cast(1, "p1", null), players)).toBe("Bei dir hat nichts angebissen.");
    const others: GameEvent[] = [
      { kind: "sell", nr: 2, player: "p2", count: 3, coins: 12 },
      { kind: "bait", nr: 3, player: "p1", count: 5, coins: 10 },
      { kind: "rod", nr: 4, player: "p2", rod: "rute-bambus", coins: 20 },
      { kind: "starter", nr: 5, player: "p3" },
      { kind: "worm", nr: 6, player: "p1" },
      { kind: "skip", nr: 7, player: "p2" },
      { kind: "end", nr: 8, sold: { p1: 4 } },
    ];
    expect(others.map((event) => eventText(de, event, players))).toEqual([
      "Ben hat 3 Fänge für 12 Münzen verkauft.",
      "Du hast 5 Köder gekauft.",
      "Ben hat sich eine Bambusrute gekauft!",
      "Clara hat das Startpaket geöffnet.",
      "Du hast im Gras einen Wurm gefunden.",
      "Ben muss aussetzen: keine Köder mehr.",
      "Feierabend! Der Laden hat alle übrigen Fische gekauft.",
    ]);
  });

  it("reveals a catch only when the fishing animation is finished", () => {
    const pending = cast(3, "p1", { fish: "hecht", cm: 80 });
    const later = cast(4, "p2", { fish: "barsch", cm: 35 });
    const events: GameEvent[] = [{ kind: "bait", nr: 2, player: "p1", count: 1, coins: 2 }, pending, later];
    const state = snapshot({}, { events, eventCount: 4 });
    expect(newCasts(state, 2)).toEqual([pending, later]);
    expect(newCasts(state, 4)).toEqual([]);
    expect(visibleEvents(state, 2, 2).map((event) => event.nr)).toEqual([2]);
    expect(shownLength(state, "p1", 2)).toBe(0);
    expect(shownLength(state, "p2", 2)).toBe(0);
    expect(shownLength(state, "p2", 3)).toBe(0);
    expect(shownLength(state, "p1", 3)).toBe(80);
    expect(shownLength(state, "p2", 4)).toBe(35);
    expect(shownBucket(state, 2)).toEqual([]);
    expect(shownBucket(state, 3)).toHaveLength(1);
  });
});

describe("Result", () => {
  it("sorts by the longest fish chain", () => {
    const rows = ranking(de, snapshot({ result: { winners: ["p1"] } }), players);
    expect(rows.map((row) => row.seat)).toEqual(["p1", "p2", "p3"]);
    expect(rankLine(de, rows[0]!, 1)).toBe("1. Du: 80 cm (größter: Hecht, 80 cm)");
    expect(rankLine(de, rows[2]!, 3)).toBe("3. Clara: 0 cm (kein Fisch)");
    expect(rows[0]?.winner).toBe(true);
  });

  it("names the coins from the sale at the end", () => {
    const state = snapshot({}, { events: [{ kind: "end", nr: 9, sold: { p1: 14, p2: 0 } }] });
    expect(endSaleText(de, state)).toBe("Der Laden hat deine übrigen Fische für 14 Münzen gekauft.");
    expect(endSaleText(de, snapshot({ player: "p2" }, { events: [{ kind: "end", nr: 9, sold: { p1: 14, p2: 0 } }] }))).toBe("");
    expect(endSaleText(de, snapshot({ player: "p2" }, { events: [{ kind: "end", nr: 9, sold: { p2: 1 } }] }))).toBe("Der Laden hat deine übrigen Fische für 1 Münze gekauft.");
    expect(eventText(de, { kind: "sell", nr: 3, player: "p2", count: 1, coins: 1 }, players)).toBe("Ben hat 1 Fang für 1 Münze verkauft.");
  });
});

describe("Texts and controls without a screen", () => {
  it("explains the winning rule with the number of rounds", () => {
    const lines = rulesLines(de, { runden: 8 });
    expect(lines[0]).toBe("Ihr spielt 8 Runden. Reihum ist jeder einmal pro Runde dran.");
    expect(lines.some((line) => line.includes("längste Fischkette"))).toBe(true);
  });

  it("describes moves and the table for screen readers", () => {
    expect(describeMove(de, { type: "buy-bait", count: 5 })).toBe("5 Köder für 10 Münzen kaufen");
    expect(describeMove(de, { type: "buy-rod", rod: "rute-profi" })).toBe("Profirute für 50 Münzen kaufen");
    expect(describeMove(de, { type: "cast" })).toBe("Angel auswerfen (1 Köder)");
    const text = describeTable(de, snapshot(), players, own({ muenzen: 3, koeder: 2 }, { "buch-hecht": "80 cm" }));
    expect(text).toContain("Fischketten: Du: 80 cm, Ben: 35 cm, Clara: 0 cm.");
    expect(text).toContain("Deine Sachen: 3 Münzen, 2 Köder, Holzrute.");
    expect(text).toContain("Sammelbuch: 1 von 10 Fischarten.");
  });

  it("shows supplies and bucket", () => {
    expect(inventoryLine(de, own({ muenzen: 12, koeder: 4, "rute-bambus": 1 }))).toBe("🪙 12   🪱 4   🎣 Bambusrute");
    expect(bucketLine(de, [])).toBe("Eimer: leer");
    expect(bucketLine(de, [{ fish: "karpfen", cm: 40 }, { fish: "stiefel", cm: 0 }])).toBe("Eimer: 2 Fänge, im Laden 5 🪙 wert");
    expect(joinNames(de, ["Anna", "Ben", "Clara"])).toBe("Anna, Ben und Clara");
  });
});

describe("English", () => {
  it("says whose turn it is and who won", () => {
    expect(statusLine(en, snapshot(), players, { runden: 5 })).toBe("Round 2 of 5 · Your turn!");
    expect(statusLine(en, snapshot({}, { current: "p2" }), players, { runden: 8 })).toBe("Round 2 of 8 · Ben's turn");
    expect(statusLine(en, snapshot({ result: { winners: ["p1"] } }), players, { runden: 5 })).toBe("You win! 🏆");
    expect(statusLine(en, snapshot({ result: { winners: ["p2", "p3"] } }), players, { runden: 5 })).toBe("Tie: Ben and Clara win!");
    expect(statusLine(en, snapshot({ result: { winners: [] } }), players, { runden: 5 })).toBe("Nobody caught anything.");
  });

  it("labels the big button and the shop", () => {
    expect(mainAction(en, snapshot({ moves: [{ type: "starter" }] }), own({}, {}), players)).toMatchObject({
      label: "🎁 Open the starter pack",
      hint: "New at the pond? A one-time gift of 10 bait and 10 coins.",
    });
    expect(mainAction(en, snapshot(), own({ koeder: 7 }), players)).toMatchObject({ label: "🎣 Cast your line", hint: "Costs 1 bait. You have 7 bait." });
    expect(mainAction(en, snapshot({ moves: [] }, { current: "p2" }), own(), players)).toMatchObject({ label: "Ben is fishing …" });
    const rows = shopRows(en, snapshot({ moves: [{ type: "sell" }, { type: "buy-bait", count: 1 }, { type: "cast" }] }), own({ muenzen: 3, koeder: 2 }));
    expect(rows.map((row) => [row.title, row.note])).toEqual([
      ["Sell all fish", ""],
      ["1 bait", ""],
      ["5 bait", "Not enough coins"],
      ["Bamboo rod", "Not enough coins"],
    ]);
    expect(rows[0]?.detail).toBe("1 catch in your bucket. You keep the centimeters!");
    expect(rows[3]?.detail).toBe("More rare fish: 20 instead of 12 in 100 casts, legendary: 2 instead of 1.");
  });

  it("tells what happens at the pond", () => {
    expect(eventText(en, cast(1, "p2", { fish: "hecht", cm: 87 }), players)).toBe("Ben caught a pike: 87 cm! Rare!");
    expect(eventText(en, cast(1, "p1", { fish: "aal", cm: 60 }), players)).toBe("You caught an eel: 60 cm! Rare!");
    expect(eventText(en, cast(1, "p3", { fish: "riesenwels", cm: 200 }), players)).toBe("Clara caught a giant catfish: 200 cm! ✨ Legendary!");
    expect(eventText(en, cast(1, "p2", { fish: "stiefel", cm: 0 }), players)).toBe("Ben fished out an old boot!");
    expect(eventText(en, cast(1, "p1", null), players)).toBe("Nothing bit on your line.");
    expect(eventText(en, cast(1, "p2", null), players)).toBe("Nothing bit on Ben's line.");
    expect(eventText(en, { kind: "sell", nr: 2, player: "p2", count: 1, coins: 1 }, players)).toBe("Ben sold 1 catch for 1 coin.");
    expect(eventText(en, { kind: "rod", nr: 4, player: "p2", rod: "rute-bambus", coins: 20 }, players)).toBe("Ben bought a bamboo rod!");
    expect(eventText(en, { kind: "skip", nr: 7, player: "p1" }, players)).toBe("You have to sit out: no bait left.");
    expect(eventText(en, { kind: "end", nr: 8, sold: {} }, players)).toBe("Closing time! The shop bought all the remaining fish.");
  });

  it("names fish, the book and the result", () => {
    const profile = own({}, { startpaket: true, "buch-hecht": "87 cm", "buch-koi": true });
    expect(bookSummary(en, profile)).toBe("2 of 10 species");
    expect(statsLine(en, own({}, {}, { "fische-gefangen": 12, "groesster-fisch": 120, siege: 2 }))).toBe("Caught: 12 · Biggest: 120 cm · Wins: 2");
    const rows = ranking(en, snapshot({ result: { winners: ["p1"] } }), players);
    expect(rankLine(en, rows[0]!, 1)).toBe("1. You: 80 cm (biggest: Pike, 80 cm)");
    expect(rankLine(en, rows[2]!, 3)).toBe("3. Clara: 0 cm (no fish)");
    expect(endSaleText(en, snapshot({}, { events: [{ kind: "end", nr: 9, sold: { p1: 14 } }] }))).toBe("The shop bought your remaining fish for 14 coins.");
    expect(rulesLines(en, { runden: 3 })[0]).toBe("You play 3 rounds. Taking turns, everyone has one turn per round.");
  });

  it("describes moves, supplies and the table for screen readers", () => {
    expect(describeMove(en, { type: "buy-bait", count: 5 })).toBe("Buy 5 bait for 10 coins");
    expect(describeMove(en, { type: "buy-rod", rod: "rute-profi" })).toBe("Buy a pro rod for 50 coins");
    expect(describeMove(en, { type: "cast" })).toBe("Cast your line (1 bait)");
    expect(inventoryLine(en, own({ muenzen: 12, koeder: 4, "rute-bambus": 1 }))).toBe("🪙 12   🪱 4   🎣 Bamboo rod");
    expect(bucketLine(en, [{ fish: "karpfen", cm: 40 }, { fish: "stiefel", cm: 0 }])).toBe("Bucket: 2 catches, worth 5 🪙 at the shop");
    const text = describeTable(en, snapshot(), players, own({ muenzen: 1, koeder: 2 }, { "buch-hecht": "80 cm" }));
    expect(text).toContain("Fish chains: You: 80 cm, Ben: 35 cm, Clara: 0 cm.");
    expect(text).toContain("Your things: 1 coin, 2 bait, Wooden rod.");
    expect(text).toContain("Collection book: 1 of 10 species.");
    expect(en.yourMoves).toBe("Your moves");
  });

  it("falls back to German, the game's default, for other languages", () => {
    expect(texts("de-CH").fish("koenigskarpfen")).toBe("Königskarpfen");
    expect(texts("en-US").fish("koenigskarpfen")).toBe("King carp");
    expect(texts("fr").yourMoves).toBe("Deine Züge");
  });
});

describe("Screen layout", () => {
  it("fits on a narrow phone without areas overlapping", () => {
    const parts = layout(360, 640, 1);
    const order = [parts.header, parts.pond, parts.news, parts.inventory, parts.primary, parts.hint, parts.secondary];
    for (let index = 1; index < order.length; index++) {
      expect(order[index]!.y).toBeGreaterThanOrEqual(order[index - 1]!.y + order[index - 1]!.height - 0.001);
    }
    expect(parts.secondary.y + parts.secondary.height).toBeLessThanOrEqual(640);
    expect(parts.pond.height).toBeGreaterThanOrEqual(150);
  });

  it("keeps the column centered on wide screens", () => {
    const parts = layout(1200, 800, 2);
    expect(parts.column.width).toBe(1040);
    expect(parts.column.x).toBe(80);
  });

  it("distributes boxes in rows and grids", () => {
    expect(chipPositions(2, { x: 0, y: 0, width: 210, height: 40 }, 10).map((cell) => cell.x)).toEqual([0, 110]);
    const grid = gridCells(4, 2, { x: 0, y: 0, width: 210, height: 210 }, 10);
    expect(grid.map((cell) => [cell.x, cell.y])).toEqual([
      [0, 0],
      [110, 0],
      [0, 110],
      [110, 110],
    ]);
  });
});

describe("Name of the game", () => {
  it("is translated, because it describes the game", () => {
    expect(texts("de").name).toBe("Angelteich");
    expect(texts("en").name).toBe("Fishing Pond");
  });
});

describe("Buying a rod", () => {
  it("speaks to the player in German without a grammar slip", () => {
    expect(texts("de").boughtRod(true, "Anna", "eine Bambusrute")).toBe("Du hast dir eine Bambusrute gekauft!");
    expect(texts("de").boughtRod(false, "Ben", "eine Bambusrute")).toBe("Ben hat sich eine Bambusrute gekauft!");
  });
});

describe("Sounds", () => {
  const custom = [castSound, tillSound, rodSound, ...Object.values(biteSounds)];

  it("only uses sounds the platform can play", () => {
    for (const sound of [...custom, turnSound, "start", "pop", "win", "lose"]) {
      expect(soundProblem(sound)).toBeUndefined();
    }
  });

  it("lets the bobber land when the cast animation does", () => {
    const notes = typeof castSound === "string" ? [] : castSound.notes;
    expect(notes.at(-1)?.at).toBe(flightSeconds);
  });

  it("sounds different for nothing, an old boot and common, rare and legendary fish", () => {
    expect(biteOf(null)).toBe("nichts");
    expect(biteOf({ fish: "stiefel", cm: 0 })).toBe("stiefel");
    expect(biteOf({ fish: "barsch", cm: 20 })).toBe("haeufig");
    expect(biteOf({ fish: "hecht", cm: 80 })).toBe("selten");
    expect(biteOf({ fish: "koenigskarpfen", cm: 120 })).toBe("legendaer");
    expect(catchSound({ fish: "riesenwels", cm: 200 })).toBe(biteSounds.legendaer);
    expect(new Set(Object.values(biteSounds).map((sound) => JSON.stringify(sound))).size).toBe(5);
    const length = (sound: Sound) => (typeof sound === "string" ? 0 : sound.notes.length);
    expect(length(biteSounds.selten)).toBeGreaterThan(length(biteSounds.haeufig));
    expect(length(biteSounds.legendaer)).toBeGreaterThan(length(biteSounds.selten));
  });

  it("rings the till only for your own shopping", () => {
    expect(eventSound({ kind: "sell", nr: 2, player: "p1", count: 3, coins: 12 }, "p1")).toBe(tillSound);
    expect(eventSound({ kind: "bait", nr: 3, player: "p1", count: 5, coins: 10 }, "p1")).toBe(tillSound);
    expect(eventSound({ kind: "rod", nr: 4, player: "p1", rod: "rute-bambus", coins: 20 }, "p1")).toBe(rodSound);
    expect(eventSound({ kind: "starter", nr: 5, player: "p1" }, "p1")).toBe("start");
    expect(eventSound({ kind: "worm", nr: 6, player: "p1" }, "p1")).toBe("pop");
    expect(eventSound({ kind: "skip", nr: 7, player: "p1" }, "p1")).toBeUndefined();
    expect(eventSound(cast(8, "p1", null), "p1")).toBeUndefined();
    expect(eventSound({ kind: "end", nr: 9, sold: { p1: 4 } }, "p1")).toBeUndefined();
    expect(eventSound({ kind: "sell", nr: 2, player: "p2", count: 3, coins: 12 }, "p1")).toBeUndefined();
  });

  it("plays the newest of your own shop events since the last update", () => {
    const events: GameEvent[] = [
      { kind: "sell", nr: 2, player: "p1", count: 3, coins: 12 },
      { kind: "rod", nr: 3, player: "p1", rod: "rute-bambus", coins: 20 },
      { kind: "bait", nr: 4, player: "p2", count: 1, coins: 2 },
      cast(5, "p2", null),
    ];
    const state = snapshot({}, { events, eventCount: 5 });
    expect(newEventSound(state, 1)).toBe(rodSound);
    expect(newEventSound(state, 2)).toBe(rodSound);
    expect(newEventSound(state, 3)).toBeUndefined();
    expect(newEventSound(state, 5)).toBeUndefined();
  });

  it("announces your turn once per round, but not when you fish alone", () => {
    expect(yourTurn(snapshot({}, { round: 3 }))).toBe(3);
    expect(yourTurn(snapshot({}, { current: "p2" }))).toBeUndefined();
    expect(yourTurn(snapshot({}, { finished: true }))).toBeUndefined();
    expect(yourTurn(snapshot({ result: { winners: ["p1"] } }))).toBeUndefined();
    expect(yourTurn(snapshot({ players: ["p1"] }))).toBeUndefined();
    expect(turnSound).toBe("blip");
  });

  it("plays win or lose at the end", () => {
    expect(endSound(snapshot())).toBeUndefined();
    expect(endSound(snapshot({ result: { winners: ["p1"] } }))).toBe("win");
    expect(endSound(snapshot({ result: { winners: ["p1", "p2"] } }))).toBe("win");
    expect(endSound(snapshot({ result: { winners: ["p2"] } }))).toBe("lose");
    expect(endSound(snapshot({ result: { winners: [] } }))).toBe("lose");
  });
});
