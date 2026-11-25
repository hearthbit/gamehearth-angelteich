import type { PlayerId, PlayerInfo, PlayerSnapshot } from "@gamehearth/sdk/client";
import {
  baitPack,
  baitPrice,
  baitTin,
  bookRecord,
  bucketValue,
  fishById,
  fishes,
  nextRod,
  rodByItem,
  rodTier,
  rods,
  starterBait,
  starterCoins,
  type Catch,
  type Fish,
  type FishId,
  type GameEvent,
  type Options,
  type OwnProfile,
  type PondMove,
  type Public,
  type Rarity,
  type RodTier,
  type Seat,
} from "../../src/index";
import type { Texts } from "./texts";

export type Snapshot = PlayerSnapshot<Public, Seat, PondMove>;
export type Players = Record<PlayerId, PlayerInfo>;
export type CastEvent = Extract<GameEvent, { kind: "cast" }>;

export const coinIcon = "🪙";
export const baitIcon = "🪱";

export function nameOf(t: Texts, seat: PlayerId, players: Players): string {
  const info = players[seat];
  if (info === undefined) {
    return seat;
  }
  return info.you ? t.you : info.name;
}

export function isYou(seat: PlayerId, players: Players): boolean {
  return players[seat]?.you === true;
}

export function joinNames(t: Texts, names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }
  return `${names.slice(0, -1).join(", ")} ${t.and} ${names.at(-1)}`;
}

export interface Inventory {
  coins: number;
  bait: number;
  tier: RodTier;
  rodName: string;
}

export function inventory(t: Texts, profile: OwnProfile): Inventory {
  const tier = rodTier(profile);
  return { coins: profile.items.muenzen ?? 0, bait: profile.items.koeder ?? 0, tier, rodName: t.rod(tier) };
}

export function inventoryLine(t: Texts, profile: OwnProfile): string {
  const own = inventory(t, profile);
  return `${coinIcon} ${own.coins}   ${baitIcon} ${own.bait}   🎣 ${own.rodName}`;
}

export function isMyTurn(snapshot: Snapshot): boolean {
  return snapshot.result === undefined && !snapshot.public.finished && snapshot.public.current === snapshot.player;
}

export function canDo(snapshot: Snapshot, type: PondMove["type"]): boolean {
  return snapshot.moves.some((entry) => entry.type === type);
}

export function findMove(snapshot: Snapshot, wanted: PondMove): PondMove | undefined {
  return snapshot.moves.find((entry) => JSON.stringify(entry) === JSON.stringify(wanted));
}

export function cmText(cm: number): string {
  return `${cm} cm`;
}

export function statusLine(t: Texts, snapshot: Snapshot, players: Players, options: Options): string {
  if (snapshot.result !== undefined) {
    const winners = snapshot.result.winners;
    if (winners.length === 0) {
      return t.noCatch;
    }
    if (winners.length === 1 && winners[0] === snapshot.player) {
      return t.youWin;
    }
    if (winners.length === 1) {
      return t.wins(nameOf(t, winners[0] as PlayerId, players));
    }
    return t.tie(joinNames(t, winners.map((seat) => nameOf(t, seat, players))));
  }
  const round = t.round(snapshot.public.round, options.runden);
  if (snapshot.public.finished) {
    return `${round} · ${t.lastCast}`;
  }
  if (isMyTurn(snapshot)) {
    return `${round} · ${t.yourTurn}`;
  }
  return `${round} · ${t.whoseTurn(nameOf(t, snapshot.public.current, players))}`;
}

export function endShown(snapshot: Snapshot, revealed: number): boolean {
  return snapshot.result !== undefined && revealed >= snapshot.public.eventCount;
}

export function shownSnapshot(snapshot: Snapshot, revealed: number): Snapshot {
  if (snapshot.result === undefined || endShown(snapshot, revealed)) {
    return snapshot;
  }
  const { result: _hidden, ...rest } = snapshot;
  return rest;
}

export type MainAction =
  | { kind: "move"; move: PondMove; label: string; hint: string }
  | { kind: "shop"; label: string; hint: string }
  | { kind: "wait"; label: string; hint: string };

export function mainAction(t: Texts, snapshot: Snapshot, profile: OwnProfile, players: Players): MainAction {
  if (snapshot.result !== undefined) {
    return { kind: "wait", label: t.matchOver, hint: t.hostStarts };
  }
  if (snapshot.public.finished) {
    return { kind: "wait", label: t.lastCast, hint: t.lastCastHint };
  }
  if (!isMyTurn(snapshot)) {
    return { kind: "wait", label: t.fishingNow(nameOf(t, snapshot.public.current, players)), hint: t.waitHint };
  }
  const own = inventory(t, profile);
  if (canDo(snapshot, "starter")) {
    return { kind: "move", move: { type: "starter" }, label: t.openStarter, hint: t.starterHint(starterBait, starterCoins) };
  }
  if (canDo(snapshot, "cast")) {
    return { kind: "move", move: { type: "cast" }, label: t.castLine, hint: t.castHint(own.bait) };
  }
  if (canDo(snapshot, "worm")) {
    return { kind: "move", move: { type: "worm" }, label: `${baitIcon} ${t.findWorm}`, hint: t.wormHint };
  }
  if (canDo(snapshot, "skip")) {
    return { kind: "move", move: { type: "skip" }, label: t.skip, hint: t.skipHint };
  }
  return { kind: "shop", label: t.toShop, hint: t.toShopHint };
}

export interface ShopRow {
  key: string;
  title: string;
  detail: string;
  price: string;
  move: PondMove | undefined;
  note: string;
}

export function chancesText(t: Texts, tier: RodTier): string {
  const chances = rods[tier].chances;
  return t.chances(chances.selten, chances.legendaer);
}

function unavailable(t: Texts, snapshot: Snapshot, reason: string): string {
  if (snapshot.result !== undefined) {
    return t.matchOver;
  }
  if (snapshot.public.finished) {
    return t.almostOver;
  }
  if (!isMyTurn(snapshot)) {
    return t.onlyOnYourTurn;
  }
  return reason;
}

export function shopRows(t: Texts, snapshot: Snapshot, profile: OwnProfile): ShopRow[] {
  const own = inventory(t, profile);
  const bucket = snapshot.public.bucket[snapshot.player] ?? [];
  const value = bucketValue(bucket);
  const rows: ShopRow[] = [];
  const sell = findMove(snapshot, { type: "sell" });
  rows.push({
    key: "sell",
    title: t.sellAll,
    detail: bucket.length === 0 ? t.bucketEmpty : t.inBucket(t.catches(bucket.length)),
    price: `+${value} ${coinIcon}`,
    move: sell,
    note: sell !== undefined || bucket.length === 0 ? "" : unavailable(t, snapshot, ""),
  });
  for (const count of [1, baitPack] as const) {
    const buy = findMove(snapshot, { type: "buy-bait", count });
    const reason = own.bait + count > baitTin ? t.tinFull(baitTin) : t.tooFewCoins;
    rows.push({
      key: `bait-${count}`,
      title: t.bait(count),
      detail: count === 1 ? t.oneBait : t.baitPack,
      price: `${baitPrice * count} ${coinIcon}`,
      move: buy,
      note: buy !== undefined ? "" : unavailable(t, snapshot, reason),
    });
  }
  const rod = nextRod(own.tier);
  if (rod === undefined || rod.item === null) {
    rows.push({ key: "rod", title: t.rod(3), detail: t.bestRod, price: "", move: undefined, note: t.nothingMore });
  } else {
    const buy = findMove(snapshot, { type: "buy-rod", rod: rod.item });
    const current = rods[own.tier].chances;
    rows.push({
      key: "rod",
      title: t.rod(rod.tier),
      detail: t.betterRod(rod.chances.selten, current.selten, rod.chances.legendaer, current.legendaer),
      price: `${rod.price} ${coinIcon}`,
      move: buy,
      note: buy !== undefined ? "" : unavailable(t, snapshot, t.tooFewCoins),
    });
  }
  return rows;
}

export interface BookEntry {
  fish: Fish;
  caught: boolean;
  best: number | null;
}

export function bookEntries(profile: OwnProfile): BookEntry[] {
  return fishes.map((fish) => {
    const best = bookRecord(profile.flags[fish.book]);
    return { fish, caught: best !== null, best: best !== null && best > 0 ? best : null };
  });
}

export function bookCount(profile: OwnProfile): number {
  return bookEntries(profile).filter((entry) => entry.caught).length;
}

export function bookSummary(t: Texts, profile: OwnProfile): string {
  return t.species(bookCount(profile), fishes.length);
}

export function bookEntryLine(t: Texts, entry: BookEntry): string {
  if (!entry.caught) {
    return t.notCaughtYet;
  }
  return entry.best === null ? t.caught : t.record(cmText(entry.best));
}

export function statsLine(t: Texts, profile: OwnProfile): string {
  const caught = profile.stats["fische-gefangen"] ?? 0;
  const biggest = profile.stats["groesster-fisch"] ?? 0;
  const wins = profile.stats.siege ?? 0;
  return t.stats(caught, cmText(biggest), wins);
}

export interface BookNews {
  fish: FishId;
  kind: "neu" | "rekord";
}

export function bookNews(before: OwnProfile | undefined, after: OwnProfile): BookNews[] {
  if (before === undefined) {
    return [];
  }
  const news: BookNews[] = [];
  for (const fish of fishes) {
    const old = bookRecord(before.flags[fish.book]);
    const now = bookRecord(after.flags[fish.book]);
    if (now === null) {
      continue;
    }
    if (old === null) {
      news.push({ fish: fish.id, kind: "neu" });
    } else if (now > old) {
      news.push({ fish: fish.id, kind: "rekord" });
    }
  }
  return news;
}

export function catchName(t: Texts, caught: Catch | null): string {
  if (caught === null) {
    return t.nothing;
  }
  return caught.fish === "stiefel" ? t.oldBoot : t.fish(caught.fish);
}

export function rarityOf(caught: Catch | null): Rarity | null {
  return caught === null || caught.fish === "stiefel" ? null : fishById(caught.fish).rarity;
}

export function catchDetail(t: Texts, caught: Catch | null): string {
  if (caught === null) {
    return t.nothingBit;
  }
  if (caught.fish === "stiefel") {
    return t.bootDetail;
  }
  const rarity = fishById(caught.fish).rarity;
  return `${cmText(caught.cm)} · ${t.rarity(rarity)}`;
}

export function eventText(t: Texts, event: GameEvent, players: Players): string {
  if (event.kind === "end") {
    return t.closingTime;
  }
  const you = isYou(event.player, players);
  const name = nameOf(t, event.player, players);
  switch (event.kind) {
    case "cast": {
      const caught = event.caught;
      if (caught === null) {
        return t.caughtNothing(you, name);
      }
      if (caught.fish === "stiefel") {
        return t.caughtBoot(you, name);
      }
      const rarity = fishById(caught.fish).rarity;
      const star = rarity === "legendaer" ? t.legendaryStar : rarity === "selten" ? t.rareStar : "";
      return t.caughtFish(you, name, t.aFish(caught.fish), cmText(caught.cm), star);
    }
    case "sell":
      return t.sold(you, name, t.catches(event.count), t.coins(event.coins));
    case "bait":
      return t.boughtBait(you, name, t.bait(event.count));
    case "rod":
      return t.boughtRod(you, name, t.aRod(rodByItem(event.rod).tier));
    case "starter":
      return t.openedStarter(you, name);
    case "worm":
      return t.foundWorm(you, name);
    case "skip":
      return t.satOut(you, name);
  }
}

export function castingText(t: Texts, event: CastEvent, players: Players): string {
  return t.casting(isYou(event.player, players), nameOf(t, event.player, players));
}

export function visibleEvents(snapshot: Snapshot, revealed: number, count: number): GameEvent[] {
  return snapshot.public.events.filter((event) => event.nr <= revealed).slice(-count);
}

export function newCasts(snapshot: Snapshot, seen: number): CastEvent[] {
  return snapshot.public.events.filter((event): event is CastEvent => event.kind === "cast" && event.nr > seen);
}

export function hiddenCasts(snapshot: Snapshot, revealed: number): CastEvent[] {
  return snapshot.public.events.filter((event): event is CastEvent => event.kind === "cast" && event.nr > revealed);
}

export function shownLength(snapshot: Snapshot, seat: PlayerId, revealed: number): number {
  const length = snapshot.public.length[seat] ?? 0;
  const hidden = hiddenCasts(snapshot, revealed)
    .filter((event) => event.player === seat)
    .reduce((sum, event) => sum + (event.caught === null || event.caught.fish === "stiefel" ? 0 : event.caught.cm), 0);
  return Math.max(0, length - hidden);
}

export function shownBucket(snapshot: Snapshot, revealed: number): Catch[] {
  const bucket = snapshot.public.bucket[snapshot.player] ?? [];
  const hidden = hiddenCasts(snapshot, revealed).filter((event) => event.player === snapshot.player && event.caught !== null).length;
  return hidden === 0 ? bucket : bucket.slice(0, Math.max(0, bucket.length - hidden));
}

export function bucketLine(t: Texts, bucket: readonly Catch[]): string {
  if (bucket.length === 0) {
    return t.bucketEmptyLine;
  }
  return t.bucket(t.catches(bucket.length), `${bucketValue(bucket)} ${coinIcon}`);
}

export interface RankRow {
  seat: PlayerId;
  name: string;
  cm: number;
  best: Catch | null;
  winner: boolean;
}

export function ranking(t: Texts, snapshot: Snapshot, players: Players): RankRow[] {
  const winners = snapshot.result?.winners ?? [];
  return snapshot.players
    .map((seat, index) => ({
      index,
      row: {
        seat,
        name: nameOf(t, seat, players),
        cm: snapshot.public.length[seat] ?? 0,
        best: snapshot.public.best[seat] ?? null,
        winner: winners.includes(seat),
      },
    }))
    .sort((a, b) => b.row.cm - a.row.cm || a.index - b.index)
    .map((entry) => entry.row);
}

export function rankLine(t: Texts, row: RankRow, place: number): string {
  const best = row.best === null ? t.noFish : t.biggest(catchName(t, row.best), cmText(row.best.cm));
  return `${place}. ${row.name}: ${cmText(row.cm)} (${best})`;
}

export function endSaleText(t: Texts, snapshot: Snapshot): string {
  const end = snapshot.public.events.find((event) => event.kind === "end");
  if (end === undefined || end.kind !== "end") {
    return "";
  }
  const coins = end.sold[snapshot.player] ?? 0;
  return coins > 0 ? t.endSale(t.coins(coins)) : "";
}

export function rulesLines(t: Texts, options: Options): string[] {
  return [t.rulesRounds(options.runden), t.rulesCast, t.rulesLuck, t.rulesWinning, t.rulesShop, t.rulesKeep, t.rulesStarter(starterBait, starterCoins)];
}

export function describeMove(t: Texts, move: PondMove): string {
  switch (move.type) {
    case "cast":
      return t.castMove;
    case "sell":
      return t.sellMove;
    case "buy-bait":
      return t.buyBaitMove(t.bait(move.count), t.coins(move.count * baitPrice));
    case "buy-rod": {
      const rod = rodByItem(move.rod);
      return t.buyRodMove(rod.tier, t.coins(rod.price));
    }
    case "starter":
      return t.starterMove;
    case "worm":
      return t.findWorm;
    case "skip":
      return t.skip;
  }
}

export function describeTable(t: Texts, snapshot: Snapshot, players: Players, profile: OwnProfile): string {
  const scores = ranking(t, snapshot, players)
    .map((row) => `${row.name}: ${cmText(row.cm)}`)
    .join(", ");
  const last = snapshot.public.events.at(-1);
  const news = last === undefined ? "" : `${eventText(t, last, players)} `;
  const own = inventory(t, profile);
  const bucket = bucketLine(t, snapshot.public.bucket[snapshot.player] ?? []);
  return t.table(news, scores, t.coins(own.coins), t.bait(own.bait), own.rodName, bucket, bookSummary(t, profile));
}

export interface FishLook {
  shape: "round" | "slim" | "eel" | "catfish";
  body: number;
  belly: number;
  fin: number;
  pattern: "none" | "stripes" | "spots" | "patches";
  patternColor: number;
  crown: boolean;
}

const looks: Record<FishId, FishLook> = {
  goldfisch: { shape: "round", body: 0xff8c1a, belly: 0xffc04d, fin: 0xff6a00, pattern: "none", patternColor: 0, crown: false },
  rotauge: { shape: "round", body: 0xb8c6cf, belly: 0xeef3f6, fin: 0xe8452c, pattern: "none", patternColor: 0, crown: false },
  barsch: { shape: "round", body: 0x8fae3a, belly: 0xe7e3a0, fin: 0xf2562b, pattern: "stripes", patternColor: 0x3d5220, crown: false },
  karpfen: { shape: "round", body: 0xb08a3e, belly: 0xe8cf8a, fin: 0x8a6424, pattern: "none", patternColor: 0, crown: false },
  forelle: { shape: "slim", body: 0x7f9a86, belly: 0xf3e6dc, fin: 0x6c8475, pattern: "spots", patternColor: 0x2f3b33, crown: false },
  koi: { shape: "round", body: 0xfaf6ee, belly: 0xffffff, fin: 0xf6efe2, pattern: "patches", patternColor: 0xf26b1d, crown: false },
  aal: { shape: "eel", body: 0x5d5a3c, belly: 0xc9c08a, fin: 0x4a4830, pattern: "none", patternColor: 0, crown: false },
  hecht: { shape: "slim", body: 0x5f8f3e, belly: 0xe4e8b8, fin: 0x7a6a2a, pattern: "spots", patternColor: 0xd9e59a, crown: false },
  riesenwels: { shape: "catfish", body: 0x5a5148, belly: 0xb8ab98, fin: 0x463f38, pattern: "spots", patternColor: 0x3b342e, crown: false },
  koenigskarpfen: { shape: "round", body: 0xf5c518, belly: 0xffe680, fin: 0xe0a100, pattern: "none", patternColor: 0, crown: true },
};

export function fishLook(id: FishId): FishLook {
  return looks[id];
}

export const rarityColors: Record<Rarity, number> = {
  haeufig: 0x4caf50,
  selten: 0x7e57c2,
  legendaer: 0xf5a700,
};

export function drawLength(cm: number, base: number): number {
  return base * Math.min(1.25, Math.max(0.55, Math.sqrt(cm / 40)));
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  column: Rect;
  header: Rect;
  pond: Rect;
  news: Rect;
  inventory: Rect;
  primary: Rect;
  hint: Rect;
  secondary: Rect;
}

export function layout(width: number, height: number, u: number): Layout {
  const margin = 12 * u;
  const columnWidth = Math.min(width, 520 * u);
  const left = (width - columnWidth) / 2;
  const inner = { x: left + margin, width: columnWidth - 2 * margin };
  const secondaryHeight = 44 * u;
  const hintHeight = 34 * u;
  const primaryHeight = 56 * u;
  const inventoryHeight = 48 * u;
  const newsHeight = 50 * u;
  const headerHeight = 86 * u;
  const secondary = { ...inner, y: height - margin - secondaryHeight, height: secondaryHeight };
  const hint = { ...inner, y: secondary.y - hintHeight - 4 * u, height: hintHeight };
  const primary = { ...inner, y: hint.y - primaryHeight, height: primaryHeight };
  const inventoryBox = { ...inner, y: primary.y - inventoryHeight - 8 * u, height: inventoryHeight };
  const news = { ...inner, y: inventoryBox.y - newsHeight - 6 * u, height: newsHeight };
  const header = { x: left, width: columnWidth, y: 0, height: headerHeight };
  const pondTop = header.height;
  const pond = { x: left, width: columnWidth, y: pondTop, height: Math.max(80 * u, news.y - 6 * u - pondTop) };
  return { column: { x: left, y: 0, width: columnWidth, height }, header, pond, news, inventory: inventoryBox, primary, hint, secondary };
}

export function chipPositions(count: number, area: Rect, gap: number): Rect[] {
  if (count === 0) {
    return [];
  }
  const width = (area.width - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({ x: area.x + index * (width + gap), y: area.y, width, height: area.height }));
}

export function gridCells(count: number, columns: number, area: Rect, gap: number): Rect[] {
  const rows = Math.ceil(count / columns);
  const width = (area.width - gap * (columns - 1)) / columns;
  const height = (area.height - gap * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, index) => ({
    x: area.x + (index % columns) * (width + gap),
    y: area.y + Math.floor(index / columns) * (height + gap),
    width,
    height,
  }));
}
