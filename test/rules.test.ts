import {
  SeededRandom,
  applyChange,
  applyMove,
  botMove,
  createMatch,
  randomStateFromSeed,
  refreshMatch,
  type Match,
  type ProfileChange,
  type ProfileData,
  type ProfileWriter,
  type Random,
} from "@gamehearth/sdk/platform";
import { describe, expect, it } from "vitest";
import manifest from "../manifest.json";
import {
  angelteich,
  baitTin,
  biteTable,
  botFullBucket,
  bucketValue,
  drawCatch,
  fishById,
  fishes,
  rods,
  type Catch,
  type Ids,
  type Options,
  type PondMove,
  type PondState,
} from "../src";

type PondMatch = Match<PondState, PondMove>;
type Profiles = Record<string, ProfileData>;

const catalog = manifest;

function profile(items: Record<string, number> = {}, flags: Record<string, string | true> = { startpaket: true }, stats: Record<string, number> = {}): ProfileData {
  return { items: { ...items }, stats: { ...stats }, flags: { ...flags } };
}

const newcomer = (): ProfileData => ({ items: {}, stats: {}, flags: {} });

function start(playerCount: number, profiles: Profiles = {}, options: Options = { runden: 5 }, seed = "test"): PondMatch {
  const created = createMatch(angelteich, { playerCount, seed, options, catalog, profiles });
  if (!created.ok) {
    throw new Error(created.error.message);
  }
  return created.match;
}

function move(match: PondMatch, player: string, action: PondMove, profiles: Profiles): { match: PondMatch; changes: ProfileChange[] } {
  const outcome = applyMove(angelteich, match, { player, action, now: 0 }, { catalog, profiles });
  if (!outcome.ok) {
    throw new Error(`${player} ${JSON.stringify(action)}: ${outcome.error.code} ${outcome.error.message}`);
  }
  return { match: outcome.match, changes: outcome.changes ?? [] };
}

function applyChanges(profiles: Profiles, changes: readonly ProfileChange[]): Profiles {
  const next: Profiles = structuredClone(profiles);
  for (const change of changes) {
    const problem = applyChange((next[change.player] ??= newcomer()), change, catalog);
    if (problem !== undefined) {
      throw new Error(problem.message);
    }
  }
  return next;
}

function scripted(picks: string[], ints: number[] = []): Random {
  return {
    next: () => 0,
    int: (min, max) => {
      const value = ints.shift();
      return value === undefined ? min : Math.min(max, Math.max(min, value));
    },
    pick: <T>(items: readonly T[]) => items[0] as T,
    shuffle: <T>(items: readonly T[]) => [...items],
    weighted: <T extends { readonly weight: number }>(entries: readonly T[]) => {
      const want = picks.shift();
      const found = entries.find((entry) => {
        const row = entry as unknown as { bite?: string; id?: string };
        return row.bite === want || row.id === want;
      });
      if (found === undefined) {
        throw new Error(`Kein Eintrag ${want}`);
      }
      return found;
    },
  };
}

function recorder(): { changes: ProfileChange[]; writer: ProfileWriter<Ids> } {
  const changes: ProfileChange[] = [];
  const writer: ProfileWriter<Ids> = {
    add: (player, id, value) => void changes.push({ player, op: "add", id, value }),
    use: (player, id, value) => void changes.push({ player, op: "use", id, value }),
    stat: (player, id, value) => void changes.push({ player, op: "stat", id, value }),
    record: (player, id, value) => void changes.push({ player, op: "record", id, value }),
    flag: (player, id, value) => void changes.push({ player, op: "flag", id, value }),
  };
  return { changes, writer };
}

function castWith(state: PondState, player: string, random: Random, profiles: Profiles, players = ["p1", "p2"]): { state: PondState; changes: ProfileChange[] } {
  const next = structuredClone(state) as PondState;
  next.public.current = player;
  const { changes, writer } = recorder();
  angelteich.apply(next, { type: "cast" }, { player, players, random, options: { runden: 5 }, profiles, profile: writer, now: 0, away: [] });
  return { state: next, changes };
}

function sizeInts(cm: number, min: number): number[] {
  return [cm - min, cm - min];
}

describe("Setup", () => {
  it("starts with p1 in round 1, everyone with an empty bucket", () => {
    const pub = start(4).state.public;
    expect(pub.round).toBe(1);
    expect(pub.current).toBe("p1");
    expect(pub.bucket).toEqual({ p1: [], p2: [], p3: [], p4: [] });
    expect(pub.length).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
    expect(pub.best).toEqual({ p1: null, p2: null, p3: null, p4: null });
  });

  it("gives moves only to the seat whose turn it is, and passes on in turn", () => {
    const profiles = { p1: profile({ koeder: 3 }), p2: profile({ koeder: 3 }), p3: profile({ koeder: 3 }) };
    let match = start(3, profiles);
    expect(match.moves["p1"]).toEqual([{ type: "cast" }]);
    expect(match.moves["p2"]).toEqual([]);
    match = move(match, "p1", { type: "cast" }, profiles).match;
    expect(match.state.public.current).toBe("p2");
    match = move(match, "p2", { type: "cast" }, profiles).match;
    expect(match.state.public.current).toBe("p3");
    expect(match.state.public.round).toBe(1);
    match = move(match, "p3", { type: "cast" }, profiles).match;
    expect(match.state.public.current).toBe("p1");
    expect(match.state.public.round).toBe(2);
  });
});

describe("Starter pack", () => {
  it("offers new players only the starter pack", () => {
    const match = start(1, { p1: newcomer() });
    expect(match.moves["p1"]).toEqual([{ type: "starter" }]);
  });

  it("gives 10 bait and 10 coins once, and the turn goes on afterwards", () => {
    let profiles: Profiles = { p1: newcomer() };
    const opened = move(start(1, profiles), "p1", { type: "starter" }, profiles);
    expect(opened.changes).toEqual([
      { player: "p1", op: "add", id: "koeder", value: 10 },
      { player: "p1", op: "add", id: "muenzen", value: 10 },
      { player: "p1", op: "flag", id: "startpaket", value: true },
    ]);
    profiles = applyChanges(profiles, opened.changes);
    expect(opened.match.state.public.current).toBe("p1");
    expect(opened.match.moves["p1"]).toEqual([
      { type: "buy-bait", count: 1 },
      { type: "buy-bait", count: 5 },
      { type: "cast" },
    ]);
    expect(opened.match.state.public.events.at(-1)).toMatchObject({ kind: "starter", player: "p1" });

    const nextMatch = start(1, profiles);
    expect(nextMatch.moves["p1"]?.some((entry) => entry.type === "starter")).toBe(false);
  });

  it("does not give the starter pack again, no matter what the flag holds", () => {
    const match = start(1, { p1: profile({}, { startpaket: "ja" }) });
    expect(match.moves["p1"]?.some((entry) => entry.type === "starter")).toBe(false);
  });
});

describe("Fishing", () => {
  it("needs a bait, uses it up and passes the turn on", () => {
    const profiles = { p1: profile({ koeder: 2 }), p2: profile({ koeder: 2 }) };
    const match = start(2, profiles);
    const current = match.state.public.current;
    const cast = move(match, current, { type: "cast" }, profiles);
    expect(cast.changes[0]).toEqual({ player: current, op: "use", id: "koeder", value: 1 });
    expect(cast.match.state.public.current).not.toBe(current);
    expect(cast.match.state.public.events.at(-1)).toMatchObject({ kind: "cast", player: current, round: 1, rod: 0 });
  });

  it("offers no casting without bait", () => {
    const match = start(1, { p1: profile({ muenzen: 4 }) });
    expect(match.moves["p1"]?.some((entry) => entry.type === "cast")).toBe(false);
    expect(match.moves["p1"]).toContainEqual({ type: "buy-bait", count: 1 });
  });

  it("puts a fish into the bucket, counts its centimeters and enters it in the collection book", () => {
    const profiles = { p1: profile({ koeder: 1 }) };
    const state = start(2, profiles).state;
    const hecht = fishById("hecht");
    const { state: after, changes } = castWith(state, "p1", scripted(["selten", "hecht"], sizeInts(87, hecht.minCm)), profiles);
    expect(after.public.bucket["p1"]).toEqual([{ fish: "hecht", cm: 87 }]);
    expect(after.public.length["p1"]).toBe(87);
    expect(after.public.best["p1"]).toEqual({ fish: "hecht", cm: 87 });
    expect(changes).toEqual([
      { player: "p1", op: "use", id: "koeder", value: 1 },
      { player: "p1", op: "stat", id: "fische-gefangen", value: 1 },
      { player: "p1", op: "record", id: "groesster-fisch", value: 87 },
      { player: "p1", op: "flag", id: "buch-hecht", value: "87 cm" },
    ]);
  });

  it("keeps only a new record for this species in the collection book", () => {
    const hecht = fishById("hecht");
    const known = { p1: profile({ koeder: 1 }, { startpaket: true, "buch-hecht": "90 cm" }) };
    const state = start(2, known).state;
    const smaller = castWith(state, "p1", scripted(["selten", "hecht"], sizeInts(70, hecht.minCm)), known);
    expect(smaller.changes.some((change) => change.op === "flag")).toBe(false);
    const bigger = castWith(state, "p1", scripted(["selten", "hecht"], sizeInts(101, hecht.minCm)), known);
    expect(bigger.changes).toContainEqual({ player: "p1", op: "flag", id: "buch-hecht", value: "101 cm" });
  });

  it("does not count an old boot, but puts it into the bucket", () => {
    const profiles = { p1: profile({ koeder: 1 }) };
    const state = start(2, profiles).state;
    const { state: after, changes } = castWith(state, "p1", scripted(["stiefel"]), profiles);
    expect(after.public.bucket["p1"]).toEqual([{ fish: "stiefel", cm: 0 }]);
    expect(after.public.length["p1"]).toBe(0);
    expect(after.public.best["p1"]).toBeNull();
    expect(changes).toEqual([{ player: "p1", op: "use", id: "koeder", value: 1 }]);
    expect(after.public.events.at(-1)).toMatchObject({ kind: "cast", caught: { fish: "stiefel", cm: 0 } });
  });

  it("sometimes lets nothing bite at all", () => {
    const profiles = { p1: profile({ koeder: 1 }) };
    const state = start(2, profiles).state;
    const { state: after } = castWith(state, "p1", scripted(["nichts"]), profiles);
    expect(after.public.bucket["p1"]).toEqual([]);
    expect(after.public.events.at(-1)).toMatchObject({ kind: "cast", caught: null });
  });

  it("keeps the biggest fish of the match", () => {
    const profiles = { p1: profile({ koeder: 3 }) };
    let state = start(2, profiles).state;
    const karpfen = fishById("karpfen");
    const goldfisch = fishById("goldfisch");
    state = castWith(state, "p1", scripted(["haeufig", "karpfen"], sizeInts(50, karpfen.minCm)), profiles).state;
    state = castWith(state, "p1", scripted(["haeufig", "goldfisch"], sizeInts(12, goldfisch.minCm)), profiles).state;
    expect(state.public.best["p1"]).toEqual({ fish: "karpfen", cm: 50 });
    expect(state.public.length["p1"]).toBe(62);
  });
});

describe("Randomness and rods", () => {
  it("distributes exactly 100 chances for every rod", () => {
    for (const rod of rods) {
      expect(biteTable(rod.tier).reduce((sum, row) => sum + row.weight, 0)).toBe(100);
    }
  });

  it("makes rare and legendary fish more likely with every better rod", () => {
    for (let tier = 1; tier < rods.length; tier++) {
      const better = rods[tier]!.chances;
      const worse = rods[tier - 1]!.chances;
      expect(better.selten).toBeGreaterThan(worse.selten);
      expect(better.legendaer).toBeGreaterThan(worse.legendaer);
      expect(better.nichts + better.stiefel).toBeLessThan(worse.nichts + worse.stiefel);
    }
  });

  it("draws sizes within the range of each species, and legendary fish only very rarely", () => {
    const random = new SeededRandom(randomStateFromSeed("viele-wuerfe"));
    const counts: Record<string, number> = {};
    const draws = 20000;
    for (let index = 0; index < draws; index++) {
      const caught = drawCatch(random, 0);
      const key = caught === null ? "nichts" : caught.fish;
      counts[key] = (counts[key] ?? 0) + 1;
      if (caught !== null && caught.fish !== "stiefel") {
        const fish = fishById(caught.fish);
        expect(caught.cm).toBeGreaterThanOrEqual(fish.minCm);
        expect(caught.cm).toBeLessThanOrEqual(fish.maxCm);
      }
    }
    const legendary = (counts["riesenwels"] ?? 0) + (counts["koenigskarpfen"] ?? 0);
    expect(legendary / draws).toBeGreaterThan(0.005);
    expect(legendary / draws).toBeLessThan(0.02);
    expect((counts["nichts"] ?? 0) / draws).toBeCloseTo(0.15, 1);
    for (const fish of fishes) {
      expect(counts[fish.id] ?? 0).toBeGreaterThan(0);
    }
  });

  it("catches rare fish much more often with the gold rod than with the wooden rod", () => {
    const rare = (tier: 0 | 3) => {
      const random = new SeededRandom(randomStateFromSeed(`rute-${tier}`));
      let hits = 0;
      for (let index = 0; index < 10000; index++) {
        const caught = drawCatch(random, tier);
        if (caught !== null && caught.fish !== "stiefel" && fishById(caught.fish).rarity !== "haeufig") {
          hits++;
        }
      }
      return hits;
    };
    expect(rare(3)).toBeGreaterThan(rare(0) * 3);
  });

  it("casts with the best rod you own", () => {
    const profiles = { p1: profile({ koeder: 1, "rute-bambus": 1, "rute-profi": 1 }) };
    const match = start(1, profiles);
    const cast = move(match, "p1", { type: "cast" }, profiles);
    expect(cast.match.state.public.events.at(-1)).toMatchObject({ kind: "cast", rod: 2 });
  });
});

describe("Shop", () => {
  function withBucket(bucket: Catch[], items: Record<string, number>): { match: PondMatch; profiles: Profiles } {
    const profiles = { p1: profile(items) };
    const match = start(1, profiles);
    const state = structuredClone(match.state) as PondState;
    state.public.bucket["p1"] = bucket;
    state.public.length["p1"] = 99;
    const refreshed = { ...match, state, moves: { p1: angelteich.legalMoves(state, "p1", { players: ["p1"], options: { runden: 5 }, profiles }) } };
    return { match: refreshed, profiles };
  }

  it("sells all fish at once, the centimeters stay", () => {
    const bucket: Catch[] = [
      { fish: "hecht", cm: 80 },
      { fish: "goldfisch", cm: 10 },
      { fish: "stiefel", cm: 0 },
    ];
    const { match, profiles } = withBucket(bucket, { koeder: 1 });
    expect(match.moves["p1"]).toContainEqual({ type: "sell" });
    const sold = move(match, "p1", { type: "sell" }, profiles);
    expect(bucketValue(bucket)).toBe(10 + 1 + 1);
    expect(sold.changes).toEqual([{ player: "p1", op: "add", id: "muenzen", value: 12 }]);
    expect(sold.match.state.public.bucket["p1"]).toEqual([]);
    expect(sold.match.state.public.length["p1"]).toBe(99);
    expect(sold.match.state.public.current).toBe("p1");
    expect(sold.match.state.public.events.at(-1)).toMatchObject({ kind: "sell", count: 3, coins: 12 });
  });

  it("sells bait singly and in packs of five, but only until the bait tin is full", () => {
    const rich = start(1, { p1: profile({ muenzen: 100, koeder: 3 }) });
    expect(rich.moves["p1"]).toContainEqual({ type: "buy-bait", count: 1 });
    expect(rich.moves["p1"]).toContainEqual({ type: "buy-bait", count: 5 });
    const almostFull = start(1, { p1: profile({ muenzen: 100, koeder: baitTin - 2 }) });
    expect(almostFull.moves["p1"]).toContainEqual({ type: "buy-bait", count: 1 });
    expect(almostFull.moves["p1"]).not.toContainEqual({ type: "buy-bait", count: 5 });
    const full = start(1, { p1: profile({ muenzen: 100, koeder: baitTin }) });
    expect(full.moves["p1"]?.some((entry) => entry.type === "buy-bait")).toBe(false);
    const poor = start(1, { p1: profile({ muenzen: 9 }) });
    expect(poor.moves["p1"]).toContainEqual({ type: "buy-bait", count: 1 });
    expect(poor.moves["p1"]).not.toContainEqual({ type: "buy-bait", count: 5 });
  });

  it("deducts the coins when buying bait", () => {
    const profiles = { p1: profile({ muenzen: 10 }) };
    const bought = move(start(1, profiles), "p1", { type: "buy-bait", count: 5 }, profiles);
    expect(bought.changes).toEqual([
      { player: "p1", op: "use", id: "muenzen", value: 10 },
      { player: "p1", op: "add", id: "koeder", value: 5 },
    ]);
  });

  it("only ever offers the next better rod, if you can pay for it", () => {
    expect(start(1, { p1: profile({ muenzen: 19, koeder: 1 }) }).moves["p1"]?.some((entry) => entry.type === "buy-rod")).toBe(false);
    expect(start(1, { p1: profile({ muenzen: 500, koeder: 1 }) }).moves["p1"]).toContainEqual({ type: "buy-rod", rod: "rute-bambus" });
    expect(start(1, { p1: profile({ muenzen: 500, koeder: 1, "rute-bambus": 1 }) }).moves["p1"]).toContainEqual({ type: "buy-rod", rod: "rute-profi" });
    expect(start(1, { p1: profile({ muenzen: 500, koeder: 1, "rute-profi": 1 }) }).moves["p1"]).toContainEqual({ type: "buy-rod", rod: "rute-gold" });
    expect(start(1, { p1: profile({ muenzen: 500, koeder: 1, "rute-gold": 1 }) }).moves["p1"]?.some((entry) => entry.type === "buy-rod")).toBe(false);
  });

  it("buys a rod for coins, and it stays in the profile", () => {
    const profiles = { p1: profile({ muenzen: 25, koeder: 1 }) };
    const bought = move(start(1, profiles), "p1", { type: "buy-rod", rod: "rute-bambus" }, profiles);
    expect(bought.changes).toEqual([
      { player: "p1", op: "use", id: "muenzen", value: 20 },
      { player: "p1", op: "add", id: "rute-bambus", value: 1 },
    ]);
  });
});

describe("When the bait runs out", () => {
  it("lets you look for a worm once per match if you can't afford bait", () => {
    let profiles: Profiles = { p1: profile({ muenzen: 1 }) };
    let match = start(1, profiles);
    expect(match.moves["p1"]).toEqual([{ type: "worm" }]);
    const dug = move(match, "p1", { type: "worm" }, profiles);
    expect(dug.changes).toEqual([{ player: "p1", op: "add", id: "koeder", value: 1 }]);
    profiles = applyChanges(profiles, dug.changes);
    match = dug.match;
    expect(match.state.public.current).toBe("p1");
    expect(match.moves["p1"]).toEqual([{ type: "cast" }]);
    const cast = move(match, "p1", { type: "cast" }, profiles);
    profiles = applyChanges(profiles, cast.changes);
    expect(cast.match.state.public.round).toBe(2);
    expect(cast.match.moves["p1"]?.some((entry) => entry.type === "worm")).toBe(false);
  });

  it("first sends you to sell if the fish in the bucket are enough for a bait", () => {
    const profiles = { p1: profile({}) };
    const state = structuredClone(start(1, profiles).state) as PondState;
    state.public.bucket["p1"] = [{ fish: "karpfen", cm: 40 }];
    expect(angelteich.legalMoves(state, "p1", { players: ["p1"], options: { runden: 5 }, profiles })).toEqual([{ type: "sell" }]);
  });

  it("lets you sit out when really nothing works any more", () => {
    const profiles = { p1: profile({}), p2: profile({ koeder: 1 }) };
    const state = structuredClone(start(2, profiles).state) as PondState;
    state.public.current = "p1";
    state.public.wormUsed["p1"] = true;
    expect(angelteich.legalMoves(state, "p1", { players: ["p1", "p2"], options: { runden: 5 }, profiles })).toEqual([{ type: "skip" }]);
  });

  it("also lets you sit out when the bucket brings too little for a bait", () => {
    const profiles = { p1: profile({}), p2: profile({ koeder: 1 }) };
    const state = structuredClone(start(2, profiles).state) as PondState;
    state.public.wormUsed["p1"] = true;
    state.public.bucket["p1"] = [{ fish: "goldfisch", cm: 11 }];
    expect(angelteich.legalMoves(state, "p1", { players: ["p1", "p2"], options: { runden: 5 }, profiles })).toEqual([{ type: "sell" }, { type: "skip" }]);
  });
});

describe("End of the match", () => {
  function playTurn(match: PondMatch, profiles: Profiles): { match: PondMatch; profiles: Profiles; changes: ProfileChange[] } {
    const player = match.state.public.current;
    let current = match;
    let currentProfiles = profiles;
    const all: ProfileChange[] = [];
    for (let step = 0; step < 10; step++) {
      const moves = current.moves[player] ?? [];
      const action =
        moves.find((entry) => entry.type === "starter") ??
        moves.find((entry) => entry.type === "cast") ??
        moves.find((entry) => entry.type === "worm") ??
        moves.find((entry) => entry.type === "skip");
      if (action === undefined) {
        throw new Error(`${player} hat keinen passenden Zug: ${JSON.stringify(moves)}`);
      }
      const done = move(current, player, action, currentProfiles);
      current = done.match;
      currentProfiles = applyChanges(currentProfiles, done.changes);
      all.push(...done.changes);
      if (action.type === "cast" || action.type === "skip") {
        return { match: current, profiles: currentProfiles, changes: all };
      }
    }
    throw new Error("Zug endet nicht");
  }

  it.each([3, 5, 8] as const)("ends after %i rounds in which everyone had one turn per round", (runden) => {
    let profiles: Profiles = { p1: newcomer(), p2: newcomer(), p3: newcomer() };
    let match = start(3, profiles, { runden }, `ende-${runden}`);
    const casts: Record<string, number> = { p1: 0, p2: 0, p3: 0 };
    const changes: ProfileChange[] = [];
    let turns = 0;
    while (match.result === undefined) {
      const player = match.state.public.current;
      const step = playTurn(match, profiles);
      match = step.match;
      profiles = step.profiles;
      changes.push(...step.changes);
      casts[player] = (casts[player] ?? 0) + 1;
      turns++;
      expect(turns).toBeLessThanOrEqual(runden * 3);
    }
    expect(turns).toBe(runden * 3);
    expect(casts).toEqual({ p1: runden, p2: runden, p3: runden });
    const pub = match.state.public;
    expect(pub.finished).toBe(true);
    for (const seat of match.players) {
      expect(match.moves[seat]).toEqual([]);
      expect(pub.bucket[seat]).toEqual([]);
    }
    const best = Math.max(...match.players.map((seat) => pub.length[seat] ?? 0));
    const winners = best > 0 ? match.players.filter((seat) => pub.length[seat] === best) : [];
    expect(match.result?.winners).toEqual(winners);
    for (const seat of winners) {
      expect(changes).toContainEqual({ player: seat, op: "stat", id: "siege", value: 1 });
    }
    expect(pub.events.at(-1)?.kind).toBe("end");
  });

  it("sells all remaining fish at the end and gives the longest catch a win", () => {
    const profiles = { p1: profile({ koeder: 1 }), p2: profile({ koeder: 1 }) };
    const state = structuredClone(start(2, profiles, { runden: 3 }).state) as PondState;
    state.public.round = 3;
    state.public.current = "p2";
    state.public.bucket = { p1: [{ fish: "koi", cm: 50 }], p2: [] };
    state.public.length = { p1: 50, p2: 0 };
    const random = scripted(["nichts"]);
    const { changes, writer } = recorder();
    angelteich.apply(state, { type: "cast" }, { player: "p2", players: ["p1", "p2"], random, options: { runden: 3 }, profiles, profile: writer, now: 0, away: [] });
    expect(state.public.finished).toBe(true);
    expect(changes).toEqual([
      { player: "p2", op: "use", id: "koeder", value: 1 },
      { player: "p1", op: "add", id: "muenzen", value: 10 },
      { player: "p1", op: "stat", id: "siege", value: 1 },
    ]);
    expect(state.public.events.at(-1)).toMatchObject({ kind: "end", sold: { p1: 10, p2: 0 } });
    expect(angelteich.result(state)).toEqual({ winners: ["p1"] });
  });

  it("lets all the best win with equally long catches, and nobody without a catch", () => {
    const state = structuredClone(start(3).state) as PondState;
    state.public.finished = true;
    state.public.length = { p1: 40, p2: 40, p3: 12 };
    expect(angelteich.result(state)).toEqual({ winners: ["p1", "p2"] });
    state.public.length = { p1: 0, p2: 0, p3: 0 };
    expect(angelteich.result(state)).toEqual({ winners: [] });
  });

  it("keeps only the latest events", () => {
    let profiles: Profiles = { p1: profile({ muenzen: 100 }) };
    let match = start(1, profiles, { runden: 8 });
    for (let index = 0; index < 12; index++) {
      const done = move(match, "p1", { type: "buy-bait", count: 1 }, profiles);
      match = done.match;
      profiles = applyChanges(profiles, done.changes);
    }
    expect(match.state.public.events).toHaveLength(8);
    expect(match.state.public.events.at(-1)?.nr).toBe(12);
  });
});

describe("Profile from another match", () => {
  it("rejects casting if the bait is gone in the meantime", () => {
    const match = start(1, { p1: profile({ koeder: 1 }) });
    const outcome = applyMove(angelteich, match, { player: "p1", action: { type: "cast" }, now: 0 }, { catalog, profiles: { p1: profile({}) } });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? undefined : outcome.error.code).toBe("missing-item");
  });
});

describe("Bot", () => {
  const rodItems = ["rute-bambus", "rute-profi", "rute-gold"] as const;

  function randomProfile(random: Random): ProfileData {
    if (random.next() < 0.2) {
      return newcomer();
    }
    const items: Record<string, number> = {};
    if (random.next() < 0.7) {
      items["muenzen"] = random.pick([1, 2, 9, 10, 19, 20, 22, 50, 52, 120, 122, 200]);
    }
    if (random.next() < 0.6) {
      items["koeder"] = random.int(1, baitTin);
    }
    for (const rod of rodItems) {
      if (random.next() < 0.25) {
        items[rod] = 1;
      }
    }
    return profile(items);
  }

  function randomBucket(random: Random): Catch[] {
    return Array.from({ length: random.int(0, botFullBucket + 2) }, () => drawCatch(random, random.pick([0, 1, 2, 3] as const)) ?? { fish: "stiefel", cm: 0 });
  }

  function refreshed(match: PondMatch, profiles: Profiles): PondMatch {
    const outcome = refreshMatch(angelteich, match, { catalog, profiles });
    if (!outcome.ok) {
      throw new Error(outcome.error.message);
    }
    return outcome.match;
  }

  function situation(seed: string): { match: PondMatch; profiles: Profiles } {
    const random = new SeededRandom(randomStateFromSeed(seed));
    const playerCount = random.int(1, 4);
    const runden = random.pick([3, 5, 8] as const);
    const profiles: Profiles = {};
    for (let seat = 1; seat <= playerCount; seat++) {
      profiles[`p${seat}`] = randomProfile(random);
    }
    const created = start(playerCount, profiles, { runden }, seed);
    const state = structuredClone(created.state) as PondState;
    state.public.round = random.int(1, runden);
    state.public.current = random.pick(created.players);
    for (const seat of created.players) {
      state.public.bucket[seat] = randomBucket(random);
      state.public.wormUsed[seat] = random.next() < 0.5;
    }
    return { match: refreshed({ ...created, state }, profiles), profiles };
  }

  function choose(match: PondMatch, player: string, profiles: Profiles): PondMove {
    const choice = botMove(angelteich, match, player, { now: 0, catalog, profiles });
    expect(choice.problem).toBeUndefined();
    expect(choice.chosen).toBe("bot");
    expect(match.moves[player]).toContainEqual(choice.action);
    return choice.action as PondMove;
  }

  function botTurn(match: PondMatch, profiles: Profiles): { match: PondMatch; profiles: Profiles; actions: PondMove[] } {
    const player = match.state.public.current;
    let current = match;
    let currentProfiles = profiles;
    const actions: PondMove[] = [];
    for (let step = 0; step < 10; step++) {
      const action = choose(current, player, currentProfiles);
      actions.push(action);
      const done = move(current, player, action, currentProfiles);
      current = done.match;
      currentProfiles = applyChanges(currentProfiles, done.changes);
      if (action.type === "cast" || action.type === "skip") {
        return { match: current, profiles: currentProfiles, actions };
      }
    }
    throw new Error(`The bot of ${player} does not end its turn: ${JSON.stringify(actions)}`);
  }

  function setUp(items: Record<string, number>, bucket: Catch[] = [], flags?: Record<string, string | true>, wormUsed = false): { match: PondMatch; profiles: Profiles } {
    const profiles = { p1: profile(items, flags), p2: profile({ koeder: 1 }) };
    const created = start(2, profiles);
    const state = structuredClone(created.state) as PondState;
    state.public.bucket["p1"] = bucket;
    state.public.wormUsed["p1"] = wormUsed;
    return { match: refreshed({ ...created, state }, profiles), profiles };
  }

  const goldfish = (count: number): Catch[] => Array.from({ length: count }, () => ({ fish: "goldfisch", cm: 10 }));

  it("always picks a legal move, for many random situations and profiles", () => {
    for (let index = 0; index < 400; index++) {
      const { match, profiles } = situation(`bot-legal-${index}`);
      choose(match, match.state.public.current, profiles);
    }
  });

  it("always ends its turn after a few moves, also without bait and money", () => {
    for (let index = 0; index < 200; index++) {
      const { match, profiles } = situation(`bot-turn-${index}`);
      expect(botTurn(match, profiles).actions.length).toBeLessThanOrEqual(8);
    }
  });

  it.each([1, 2, 3, 4])("finishes every match in which bots play all %i seats", (playerCount) => {
    for (const runden of [3, 5, 8] as const) {
      for (let game = 0; game < 4; game++) {
        const seed = `bot-match-${playerCount}-${runden}-${game}`;
        const random = new SeededRandom(randomStateFromSeed(seed));
        let profiles: Profiles = {};
        for (let seat = 1; seat <= playerCount; seat++) {
          profiles[`p${seat}`] = game === 0 ? newcomer() : randomProfile(random);
        }
        let match = start(playerCount, profiles, { runden }, seed);
        let turns = 0;
        while (match.result === undefined) {
          ({ match, profiles } = botTurn(match, profiles));
          turns++;
          expect(turns).toBeLessThanOrEqual(runden * playerCount);
        }
        expect(turns).toBe(runden * playerCount);
        expect(match.state.public.finished).toBe(true);
      }
    }
  });

  it("opens the starter pack first, as a bot from the lobby with an empty profile does", () => {
    const { match, profiles } = setUp({}, [], {});
    expect(botTurn(match, profiles).actions).toEqual([{ type: "starter" }, { type: "cast" }]);
  });

  it("buys the next better rod as soon as it can afford it", () => {
    const rich = setUp({ muenzen: 25, koeder: 3 });
    expect(choose(rich.match, "p1", rich.profiles)).toEqual({ type: "buy-rod", rod: "rute-bambus" });
    const owner = setUp({ muenzen: 60, koeder: 3, "rute-bambus": 1 });
    expect(choose(owner.match, "p1", owner.profiles)).toEqual({ type: "buy-rod", rod: "rute-profi" });
    const poor = setUp({ muenzen: 19, koeder: 3 });
    expect(choose(poor.match, "p1", poor.profiles)).toEqual({ type: "cast" });
  });

  it("sells first when the bucket pays for the rod, then buys it", () => {
    const { match, profiles } = setUp({ muenzen: 15, koeder: 3 }, [{ fish: "koi", cm: 50 }]);
    expect(botTurn(match, profiles).actions).toEqual([{ type: "sell" }, { type: "buy-rod", rod: "rute-bambus" }, { type: "cast" }]);
  });

  it("keeps enough coins for bait instead of buying a rod it could not fish with", () => {
    const { match, profiles } = setUp({ muenzen: 20 });
    expect(botTurn(match, profiles).actions).toEqual([{ type: "buy-bait", count: 5 }, { type: "cast" }]);
  });

  it("sells a full bucket and keeps a smaller one", () => {
    const full = setUp({ koeder: 3 }, goldfish(botFullBucket));
    expect(choose(full.match, "p1", full.profiles)).toEqual({ type: "sell" });
    const small = setUp({ koeder: 3 }, goldfish(botFullBucket - 1));
    expect(choose(small.match, "p1", small.profiles)).toEqual({ type: "cast" });
  });

  it("buys bait when it runs out, a pack of five if it can", () => {
    const pack = setUp({ muenzen: 12 });
    expect(choose(pack.match, "p1", pack.profiles)).toEqual({ type: "buy-bait", count: 5 });
    const single = setUp({ muenzen: 3 });
    expect(choose(single.match, "p1", single.profiles)).toEqual({ type: "buy-bait", count: 1 });
    const fromBucket = setUp({ muenzen: 1 }, [{ fish: "goldfisch", cm: 10 }]);
    expect(botTurn(fromBucket.match, fromBucket.profiles).actions).toEqual([{ type: "sell" }, { type: "buy-bait", count: 1 }, { type: "cast" }]);
  });

  it("looks for a worm without bait and money, and sits out once the worm is used up", () => {
    const worm = setUp({});
    expect(botTurn(worm.match, worm.profiles).actions).toEqual([{ type: "worm" }, { type: "cast" }]);
    const used = setUp({}, [], undefined, true);
    expect(botTurn(used.match, used.profiles).actions).toEqual([{ type: "skip" }]);
  });
});
