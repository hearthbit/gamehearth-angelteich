import type { PlayerId, Sound, SoundName } from "@gamehearth/sdk/client";
import { fishById, type Catch, type GameEvent, type Rarity } from "../../src/index";
import { isMyTurn, type Snapshot } from "./view";

export type BiteKind = "nichts" | "stiefel" | Rarity;

export const flightSeconds = 0.65;

const splash = { freq: 600, to: 1200, length: 0.06, wave: "sine", volume: 0.7 } as const;

export const castSound: Sound = {
  notes: [
    { freq: 1800, to: 500, length: 0.3, wave: "sine", volume: 0.25 },
    { freq: 240, to: 90, at: flightSeconds, length: 0.14, wave: "sine", volume: 0.6 },
  ],
};

export const biteSounds: Record<BiteKind, Sound> = {
  nichts: {
    notes: [
      { freq: 330, to: 220, length: 0.1, wave: "sine", volume: 0.4 },
      { freq: 262, to: 175, at: 0.16, length: 0.14, wave: "sine", volume: 0.35 },
    ],
  },
  stiefel: {
    notes: [
      { freq: 247, to: 233, length: 0.18, wave: "sawtooth", volume: 0.3 },
      { freq: 220, to: 208, at: 0.2, length: 0.18, wave: "sawtooth", volume: 0.3 },
      { freq: 196, to: 147, at: 0.4, length: 0.45, wave: "sawtooth", volume: 0.3 },
    ],
  },
  haeufig: {
    notes: [splash, { freq: 784, at: 0.1, length: 0.08, wave: "triangle" }, { freq: 1047, at: 0.18, length: 0.14, wave: "triangle" }],
  },
  selten: {
    notes: [
      splash,
      { freq: 659, at: 0.1, length: 0.08, volume: 0.35 },
      { freq: 784, at: 0.18, length: 0.08, volume: 0.35 },
      { freq: 988, at: 0.26, length: 0.08, volume: 0.35 },
      { freq: 1319, at: 0.34, length: 0.24, volume: 0.35 },
    ],
  },
  legendaer: {
    notes: [
      splash,
      { freq: 523, at: 0.1, length: 0.1, volume: 0.4 },
      { freq: 659, at: 0.2, length: 0.1, volume: 0.4 },
      { freq: 784, at: 0.3, length: 0.1, volume: 0.4 },
      { freq: 1047, at: 0.4, length: 0.22, volume: 0.4 },
      { freq: 784, at: 0.62, length: 0.1, volume: 0.4 },
      { freq: 1047, at: 0.72, length: 0.5, volume: 0.4 },
      { freq: 2093, at: 0.8, length: 0.06, wave: "sine", volume: 0.25 },
      { freq: 2637, at: 0.9, length: 0.06, wave: "sine", volume: 0.25 },
      { freq: 3136, at: 1, length: 0.1, wave: "sine", volume: 0.25 },
    ],
  },
};

export const tillSound: Sound = {
  notes: [
    { freq: 1319, length: 0.05, volume: 0.3 },
    { freq: 1760, at: 0.05, length: 0.05, volume: 0.3 },
    { freq: 2637, at: 0.12, length: 0.3, wave: "triangle", volume: 0.4 },
  ],
};

export const rodSound: Sound = {
  notes: [
    { freq: 1319, length: 0.05, volume: 0.3 },
    { freq: 1760, at: 0.05, length: 0.05, volume: 0.3 },
    { freq: 2637, at: 0.12, length: 0.2, wave: "triangle", volume: 0.4 },
    { freq: 523, at: 0.36, length: 0.08, wave: "triangle" },
    { freq: 784, at: 0.44, length: 0.08, wave: "triangle" },
    { freq: 1047, at: 0.52, length: 0.2, wave: "triangle" },
  ],
};

export const turnSound: SoundName = "blip";

export function biteOf(caught: Catch | null): BiteKind {
  if (caught === null) {
    return "nichts";
  }
  return caught.fish === "stiefel" ? "stiefel" : fishById(caught.fish).rarity;
}

export function catchSound(caught: Catch | null): Sound {
  return biteSounds[biteOf(caught)];
}

export function eventSound(event: GameEvent, seat: PlayerId): Sound | undefined {
  if (event.kind === "end" || event.player !== seat) {
    return undefined;
  }
  switch (event.kind) {
    case "sell":
    case "bait":
      return tillSound;
    case "rod":
      return rodSound;
    case "starter":
      return "start";
    case "worm":
      return "pop";
    case "cast":
    case "skip":
      return undefined;
  }
}

export function newEventSound(snapshot: Snapshot, seen: number): Sound | undefined {
  return snapshot.public.events
    .filter((event) => event.nr > seen)
    .map((event) => eventSound(event, snapshot.player))
    .filter((sound) => sound !== undefined)
    .at(-1);
}

export function yourTurn(snapshot: Snapshot): number | undefined {
  return snapshot.players.length > 1 && isMyTurn(snapshot) ? snapshot.public.round : undefined;
}

export function endSound(snapshot: Snapshot): SoundName | undefined {
  if (snapshot.result === undefined) {
    return undefined;
  }
  return snapshot.result.winners.includes(snapshot.player) ? "win" : "lose";
}
