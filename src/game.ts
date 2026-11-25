import { defineGame, type GameState, type PlayerId, type ProfileWriter } from "@gamehearth/sdk";
import {
  baitPack,
  baitPrice,
  baitTin,
  bookRecord,
  bookText,
  bucketValue,
  drawCatch,
  fishById,
  nextRod,
  rodByItem,
  rodTier,
  starterBait,
  starterCoins,
  type Catch,
  type Ids,
  type RodItem,
  type RodTier,
} from "./fische";

export interface Options {
  runden: 3 | 5 | 8;
}

export type GameEvent =
  | { kind: "cast"; nr: number; player: PlayerId; round: number; rod: RodTier; caught: Catch | null }
  | { kind: "sell"; nr: number; player: PlayerId; count: number; coins: number }
  | { kind: "bait"; nr: number; player: PlayerId; count: number; coins: number }
  | { kind: "rod"; nr: number; player: PlayerId; rod: RodItem; coins: number }
  | { kind: "starter"; nr: number; player: PlayerId }
  | { kind: "worm"; nr: number; player: PlayerId }
  | { kind: "skip"; nr: number; player: PlayerId }
  | { kind: "end"; nr: number; sold: Record<PlayerId, number> };

type WithoutNr<E> = E extends unknown ? Omit<E, "nr"> : never;
type NewEvent = WithoutNr<GameEvent>;

export interface Public {
  round: number;
  current: PlayerId;
  bucket: Record<PlayerId, Catch[]>;
  length: Record<PlayerId, number>;
  best: Record<PlayerId, Catch | null>;
  wormUsed: Record<PlayerId, boolean>;
  events: GameEvent[];
  eventCount: number;
  finished: boolean;
}

export type Seat = Record<string, never>;
export type Secret = Record<string, never>;
export type PondState = GameState<Public, Seat, Secret>;

export type PondMove =
  | { type: "cast" }
  | { type: "sell" }
  | { type: "buy-bait"; count: 1 | 5 }
  | { type: "buy-rod"; rod: RodItem }
  | { type: "starter" }
  | { type: "worm" }
  | { type: "skip" };

export const eventLimit = 8;
export const botFullBucket = 5;

export function matchWinners(pub: Public, players: readonly PlayerId[]): PlayerId[] {
  const best = Math.max(0, ...players.map((player) => pub.length[player] ?? 0));
  if (best <= 0) {
    return [];
  }
  return players.filter((player) => (pub.length[player] ?? 0) === best);
}

function log(pub: Public, event: NewEvent): void {
  pub.eventCount += 1;
  pub.events.push({ ...event, nr: pub.eventCount } as GameEvent);
  while (pub.events.length > eventLimit) {
    pub.events.shift();
  }
}

function finish(state: PondState, players: readonly PlayerId[], profile: ProfileWriter<Ids>): void {
  const pub = state.public;
  const sold: Record<PlayerId, number> = {};
  for (const seat of players) {
    const coins = bucketValue(pub.bucket[seat] ?? []);
    sold[seat] = coins;
    if (coins > 0) {
      profile.add(seat, "muenzen", coins);
    }
    pub.bucket[seat] = [];
  }
  pub.finished = true;
  log(pub, { kind: "end", sold });
  for (const seat of matchWinners(pub, players)) {
    profile.stat(seat, "siege", 1);
  }
}

function endTurn(state: PondState, players: readonly PlayerId[], rounds: number, profile: ProfileWriter<Ids>): void {
  const pub = state.public;
  const first = players[0] ?? pub.current;
  const next = players[(players.indexOf(pub.current) + 1) % players.length] ?? first;
  if (next === first) {
    if (pub.round >= rounds) {
      finish(state, players, profile);
      return;
    }
    pub.round += 1;
  }
  pub.current = next;
}

export const angelteich = defineGame<PondState, PondMove, Options, Ids>({
  setup({ players }) {
    const bucket: Record<PlayerId, Catch[]> = {};
    const length: Record<PlayerId, number> = {};
    const best: Record<PlayerId, Catch | null> = {};
    const wormUsed: Record<PlayerId, boolean> = {};
    const seats: Record<PlayerId, Seat> = {};
    for (const player of players) {
      bucket[player] = [];
      length[player] = 0;
      best[player] = null;
      wormUsed[player] = false;
      seats[player] = {};
    }
    return {
      public: { round: 1, current: players[0] ?? "p1", bucket, length, best, wormUsed, events: [], eventCount: 0, finished: false },
      players: seats,
      secret: {},
    };
  },

  legalMoves(state, player, { profiles }) {
    const pub = state.public;
    if (pub.finished || player !== pub.current) {
      return [];
    }
    const profile = profiles[player];
    const bait = profile?.items.koeder ?? 0;
    const coins = profile?.items.muenzen ?? 0;
    const bucket = pub.bucket[player] ?? [];
    const starterOpen = profile?.flags.startpaket === undefined;
    const moves: PondMove[] = [];
    if (starterOpen) {
      moves.push({ type: "starter" });
    }
    if (bucket.length > 0) {
      moves.push({ type: "sell" });
    }
    if (coins >= baitPrice && bait + 1 <= baitTin) {
      moves.push({ type: "buy-bait", count: 1 });
    }
    if (coins >= baitPrice * baitPack && bait + baitPack <= baitTin) {
      moves.push({ type: "buy-bait", count: baitPack });
    }
    const rod = nextRod(rodTier(profile));
    if (rod?.item != null && coins >= rod.price) {
      moves.push({ type: "buy-rod", rod: rod.item });
    }
    const stuck = bait === 0 && !starterOpen && coins + bucketValue(bucket) < baitPrice;
    if (bait > 0) {
      moves.push({ type: "cast" });
    } else if (stuck && pub.wormUsed[player] !== true) {
      moves.push({ type: "worm" });
    } else if (stuck || moves.length === 0) {
      moves.push({ type: "skip" });
    }
    return moves;
  },

  apply(state, action, { player, players, random, options, profiles, profile }) {
    const pub = state.public;
    switch (action.type) {
      case "starter": {
        profile.add(player, "koeder", starterBait);
        profile.add(player, "muenzen", starterCoins);
        profile.flag(player, "startpaket", true);
        log(pub, { kind: "starter", player });
        return;
      }
      case "sell": {
        const bucket = pub.bucket[player] ?? [];
        const coins = bucketValue(bucket);
        if (coins > 0) {
          profile.add(player, "muenzen", coins);
        }
        log(pub, { kind: "sell", player, count: bucket.length, coins });
        pub.bucket[player] = [];
        return;
      }
      case "buy-bait": {
        const coins = baitPrice * action.count;
        profile.use(player, "muenzen", coins);
        profile.add(player, "koeder", action.count);
        log(pub, { kind: "bait", player, count: action.count, coins });
        return;
      }
      case "buy-rod": {
        const rod = rodByItem(action.rod);
        profile.use(player, "muenzen", rod.price);
        profile.add(player, action.rod, 1);
        log(pub, { kind: "rod", player, rod: action.rod, coins: rod.price });
        return;
      }
      case "worm": {
        profile.add(player, "koeder", 1);
        pub.wormUsed[player] = true;
        log(pub, { kind: "worm", player });
        return;
      }
      case "skip": {
        log(pub, { kind: "skip", player });
        endTurn(state, players, options.runden, profile);
        return;
      }
      case "cast": {
        const rod = rodTier(profiles[player]);
        profile.use(player, "koeder", 1);
        const caught = drawCatch(random, rod);
        if (caught !== null) {
          (pub.bucket[player] ??= []).push(caught);
        }
        if (caught !== null && caught.fish !== "stiefel") {
          pub.length[player] = (pub.length[player] ?? 0) + caught.cm;
          const best = pub.best[player];
          if (best == null || caught.cm > best.cm) {
            pub.best[player] = { ...caught };
          }
          profile.stat(player, "fische-gefangen", 1);
          profile.record(player, "groesster-fisch", caught.cm);
          const fish = fishById(caught.fish);
          const known = bookRecord(profiles[player]?.flags[fish.book]);
          if (known === null || caught.cm > known) {
            profile.flag(player, fish.book, bookText(caught.cm));
          }
        }
        log(pub, { kind: "cast", player, round: pub.round, rod, caught: caught === null ? null : { ...caught } });
        endTurn(state, players, options.runden, profile);
        return;
      }
    }
  },

  bot(state, player, moves, { random, profiles }) {
    const profile = profiles[player];
    const coins = profile?.items.muenzen ?? 0;
    const bait = profile?.items.koeder ?? 0;
    const bucket = state.public.bucket[player] ?? [];
    const rod = nextRod(rodTier(profile));
    const reserve = bait > 0 ? 0 : baitPrice;
    const rodPrice = rod === undefined ? Infinity : rod.price + reserve;
    const offered = (type: PondMove["type"]) => moves.find((move) => move.type === type);
    const sell =
      bucket.length >= botFullBucket || (coins < rodPrice && coins + bucketValue(bucket) >= rodPrice) || (bait === 0 && coins < baitPrice) ? offered("sell") : undefined;
    const buyRod = coins >= rodPrice ? offered("buy-rod") : undefined;
    const buyBait = bait === 0 ? (moves.find((move) => move.type === "buy-bait" && move.count === baitPack) ?? offered("buy-bait")) : undefined;
    return offered("starter") ?? sell ?? buyRod ?? buyBait ?? offered("cast") ?? offered("worm") ?? offered("skip") ?? random.pick(moves);
  },

  result(state) {
    return state.public.finished ? { winners: matchWinners(state.public, Object.keys(state.players)) } : undefined;
  },
});
