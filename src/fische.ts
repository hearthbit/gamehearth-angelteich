import type { CatalogOf, Profile, Random } from "@gamehearth/sdk";
import manifest from "../manifest.json";

export type Ids = CatalogOf<typeof manifest>;
export type ItemId = Ids["items"];
export type FlagId = Ids["flags"];
export type OwnProfile = Profile<Ids>;

export type Rarity = "haeufig" | "selten" | "legendaer";

export type FishId =
  | "goldfisch"
  | "rotauge"
  | "barsch"
  | "karpfen"
  | "forelle"
  | "koi"
  | "aal"
  | "hecht"
  | "riesenwels"
  | "koenigskarpfen";

export interface Fish {
  id: FishId;
  rarity: Rarity;
  weight: number;
  minCm: number;
  maxCm: number;
  price: number;
  book: FlagId;
}

export const fishes: readonly Fish[] = [
  { id: "goldfisch", rarity: "haeufig", weight: 3, minCm: 8, maxCm: 18, price: 1, book: "buch-goldfisch" },
  { id: "rotauge", rarity: "haeufig", weight: 3, minCm: 12, maxCm: 26, price: 2, book: "buch-rotauge" },
  { id: "barsch", rarity: "haeufig", weight: 2, minCm: 15, maxCm: 35, price: 2, book: "buch-barsch" },
  { id: "karpfen", rarity: "haeufig", weight: 2, minCm: 25, maxCm: 60, price: 4, book: "buch-karpfen" },
  { id: "forelle", rarity: "selten", weight: 3, minCm: 30, maxCm: 65, price: 7, book: "buch-forelle" },
  { id: "koi", rarity: "selten", weight: 2, minCm: 35, maxCm: 75, price: 10, book: "buch-koi" },
  { id: "aal", rarity: "selten", weight: 3, minCm: 50, maxCm: 110, price: 8, book: "buch-aal" },
  { id: "hecht", rarity: "selten", weight: 2, minCm: 60, maxCm: 130, price: 10, book: "buch-hecht" },
  { id: "riesenwels", rarity: "legendaer", weight: 1, minCm: 160, maxCm: 250, price: 50, book: "buch-riesenwels" },
  { id: "koenigskarpfen", rarity: "legendaer", weight: 1, minCm: 100, maxCm: 160, price: 60, book: "buch-koenigskarpfen" },
];

export type Bite = "nichts" | "stiefel" | Rarity;

export type RodTier = 0 | 1 | 2 | 3;
export type RodItem = "rute-bambus" | "rute-profi" | "rute-gold";

export interface Rod {
  tier: RodTier;
  item: RodItem | null;
  price: number;
  chances: Record<Bite, number>;
}

export const rods: readonly [Rod, Rod, Rod, Rod] = [
  { tier: 0, item: null, price: 0, chances: { nichts: 15, stiefel: 10, haeufig: 62, selten: 12, legendaer: 1 } },
  { tier: 1, item: "rute-bambus", price: 20, chances: { nichts: 12, stiefel: 8, haeufig: 58, selten: 20, legendaer: 2 } },
  { tier: 2, item: "rute-profi", price: 50, chances: { nichts: 10, stiefel: 6, haeufig: 50, selten: 30, legendaer: 4 } },
  { tier: 3, item: "rute-gold", price: 120, chances: { nichts: 8, stiefel: 4, haeufig: 42, selten: 38, legendaer: 8 } },
];

export const baitPrice = 2;
export const baitPack = 5;
export const baitTin = 20;
export const starterBait = 10;
export const starterCoins = 10;
export const bootPrice = 1;

export interface Catch {
  fish: FishId | "stiefel";
  cm: number;
}

export function fishById(id: FishId): Fish {
  const fish = fishes.find((entry) => entry.id === id);
  if (fish === undefined) {
    throw new Error(`Unknown fish ${id}`);
  }
  return fish;
}

export function rodTier(profile: OwnProfile | undefined): RodTier {
  let tier: RodTier = 0;
  for (const rod of rods) {
    if (rod.item !== null && (profile?.items[rod.item] ?? 0) > 0) {
      tier = rod.tier;
    }
  }
  return tier;
}

export function nextRod(tier: RodTier): Rod | undefined {
  return rods.find((rod) => rod.tier === tier + 1);
}

export function rodByItem(item: RodItem): Rod {
  return rods.find((rod) => rod.item === item) ?? rods[0];
}

export function biteTable(tier: RodTier): { bite: Bite; weight: number }[] {
  const chances = rods[tier].chances;
  return (["nichts", "stiefel", "haeufig", "selten", "legendaer"] as const).map((bite) => ({ bite, weight: chances[bite] }));
}

export function rollSize(random: Random, fish: Fish): number {
  const span = fish.maxCm - fish.minCm;
  return fish.minCm + Math.floor((random.int(0, span) + random.int(0, span)) / 2);
}

export function drawCatch(random: Random, tier: RodTier): Catch | null {
  const { bite } = random.weighted(biteTable(tier));
  if (bite === "nichts") {
    return null;
  }
  if (bite === "stiefel") {
    return { fish: "stiefel", cm: 0 };
  }
  const fish = random.weighted(fishes.filter((entry) => entry.rarity === bite));
  return { fish: fish.id, cm: rollSize(random, fish) };
}

export function priceOf(caught: Catch): number {
  return caught.fish === "stiefel" ? bootPrice : fishById(caught.fish).price;
}

export function bucketValue(bucket: readonly Catch[]): number {
  return bucket.reduce((sum, caught) => sum + priceOf(caught), 0);
}

export function bookRecord(value: string | true | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  if (value === true) {
    return 0;
  }
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function bookText(cm: number): string {
  return `${cm} cm`;
}
