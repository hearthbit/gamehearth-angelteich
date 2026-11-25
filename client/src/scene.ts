import Phaser from "phaser";
import type { GameConnection, GameUpdate } from "@gamehearth/sdk/client";
import { type Catch, type FishId, type RodTier, type Ids, type Options, type PondMove, type PondState } from "../../src/index";
import {
  bookEntries,
  bookEntryLine,
  bookNews,
  bookSummary,
  bucketLine,
  castingText,
  catchDetail,
  catchName,
  chipPositions,
  cmText,
  coinIcon,
  baitIcon,
  drawLength,
  endShown,
  endSaleText,
  eventText,
  fishLook,
  gridCells,
  inventory,
  inventoryLine,
  isMyTurn,
  layout,
  mainAction,
  nameOf,
  newCasts,
  ranking,
  rankLine,
  rarityColors,
  rarityOf,
  rulesLines,
  shopRows,
  shownBucket,
  shownLength,
  shownSnapshot,
  statsLine,
  statusLine,
  visibleEvents,
  type BookNews,
  type CastEvent,
  type Layout,
  type Rect,
  type Snapshot,
} from "./view";
import type { Texts } from "./texts";
import { castSound, catchSound, endSound, flightSeconds, newEventSound, turnSound, yourTurn } from "./sounds";

type Update = GameUpdate<PondState, PondMove, Options, Ids>;
type Panel = "none" | "shop" | "book" | "rules" | "end";

const font = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";

const colors = {
  skyTop: 0x8fd3ff,
  skyBottom: 0xd6f1ff,
  hill: 0x8fd17a,
  hillFar: 0xa9dd95,
  grass: 0x6cc04a,
  grassDark: 0x58a83b,
  waterTop: 0x4fc3f7,
  waterBottom: 0x1e88c7,
  waterEdge: 0xc9a46a,
  pad: 0x4caf50,
  padDark: 0x388e3c,
  paper: 0xfffaf0,
  paperLine: 0xe8dcc2,
  text: "#2b3a2e",
  muted: "#5d6b60",
  light: "#ffffff",
  primary: 0xff7a45,
  primaryDark: 0xd95b2a,
  button: 0xffffff,
  buttonLine: 0x9ccc65,
  disabled: 0xd9d9d9,
  current: 0xffd54f,
  bobberRed: 0xe53935,
};

const rodColors: Record<RodTier, number> = { 0: 0x8d5524, 1: 0xc9a227, 2: 0x37474f, 3: 0xffc107 };

export class PondScene extends Phaser.Scene {
  readonly #connection: GameConnection<PondState, PondMove, Options, Ids>;
  readonly #u: number;
  readonly #t: Texts;
  #update: Update | undefined;
  #previousProfile: Update["profile"] | undefined;
  #busy = false;
  #panel: Panel = "none";
  #endSeen = false;
  #endSounded = false;
  #announced: number | undefined;
  #seen = -1;
  #revealed = -1;
  #pending: CastEvent | undefined;
  #queued: CastEvent | undefined;
  #news: BookNews[] = [];
  #layout!: Layout;
  #background!: Phaser.GameObjects.Graphics;
  #life!: Phaser.GameObjects.Container;
  #line!: Phaser.GameObjects.Graphics;
  #bobber!: Phaser.GameObjects.Container;
  #ui!: Phaser.GameObjects.Container;
  #fx!: Phaser.GameObjects.Container;
  #bobberHome = { x: 0, y: 0 };
  #rodTip = { x: 0, y: 0 };
  #rodBase = { x: 0, y: 0 };
  #bobberFlying = false;
  #ownRod: RodTier = 0;

  constructor(connection: GameConnection<PondState, PondMove, Options, Ids>, dpr: number, t: Texts) {
    super("angelteich");
    this.#connection = connection;
    this.#u = dpr;
    this.#t = t;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(colors.grass);
    this.#background = this.add.graphics();
    this.#life = this.add.container(0, 0);
    this.#line = this.add.graphics();
    this.#bobber = this.add.container(0, 0);
    this.#fx = this.add.container(0, 0);
    this.#ui = this.add.container(0, 0);
    this.#buildBobber();
    this.#relayout();
    this.scale.on("resize", () => {
      this.#relayout();
      this.#render();
    });
    this.#connection.onUpdate((update) => this.#receive(update));
  }

  override update(time: number): void {
    const u = this.#u;
    if (!this.#bobberFlying) {
      this.#bobber.y = this.#bobberHome.y + Math.sin(time / 420) * 2.5 * u;
      this.#bobber.x = this.#bobberHome.x;
    }
    const g = this.#line;
    g.clear();
    g.lineStyle(5 * u, rodColors[this.#pending?.rod ?? this.#ownRod], 1);
    g.lineBetween(this.#rodBase.x, this.#rodBase.y, this.#rodTip.x, this.#rodTip.y);
    g.fillStyle(0x424242, 1);
    g.fillCircle(this.#rodBase.x + (this.#rodTip.x - this.#rodBase.x) * 0.18, this.#rodBase.y + (this.#rodTip.y - this.#rodBase.y) * 0.18, 6 * u);
    g.lineStyle(1.5 * u, 0xffffff, 0.9);
    const midX = (this.#rodTip.x + this.#bobber.x) / 2;
    const midY = Math.max(this.#rodTip.y, this.#bobber.y) + 18 * u;
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(this.#rodTip.x, this.#rodTip.y),
      new Phaser.Math.Vector2(midX, midY),
      new Phaser.Math.Vector2(this.#bobber.x, this.#bobber.y - 6 * u),
    );
    curve.draw(g, 24);
  }

  #receive(update: Update): void {
    const snapshot = update.snapshot as Snapshot;
    const latest = snapshot.public.eventCount;
    const news = bookNews(this.#previousProfile, update.profile);
    if (news.length > 0) {
      this.#news = news;
    }
    this.#previousProfile = update.profile;
    this.#update = update;
    if (this.#seen < 0 || latest < this.#seen) {
      this.#seen = latest;
      this.#revealed = latest;
      this.#queued = undefined;
      this.#endSounded = snapshot.result !== undefined;
      this.#announced = yourTurn(snapshot);
      this.#render();
      return;
    }
    const sound = newEventSound(snapshot, this.#seen);
    if (sound !== undefined) {
      this.#connection.sound(sound);
    }
    const casts = newCasts(snapshot, this.#seen);
    this.#seen = latest;
    const newest = casts.at(-1);
    if (newest === undefined) {
      if (this.#pending === undefined) {
        this.#revealed = latest;
      }
    } else if (this.#pending === undefined) {
      this.#startCast(newest);
    } else {
      this.#queued = newest;
    }
    this.#render();
    this.#announce();
  }

  #announce(): void {
    const snapshot = this.#update?.snapshot as Snapshot | undefined;
    if (snapshot === undefined || this.#pending !== undefined) {
      return;
    }
    const turn = yourTurn(snapshot);
    if (turn !== undefined && turn !== this.#announced) {
      this.#connection.sound(turnSound);
    }
    this.#announced = turn;
  }

  #startCast(event: CastEvent): void {
    this.#pending = event;
    this.#revealed = event.nr - 1;
    this.#animateCast(event, () => {
      this.#revealed = Math.max(this.#revealed, event.nr);
      this.#pending = undefined;
      const queued = this.#queued;
      this.#queued = undefined;
      if (queued !== undefined && queued.nr > event.nr) {
        this.#revealed = queued.nr - 1;
        this.#startCast(queued);
      } else {
        this.#revealed = this.#update?.snapshot.public.eventCount ?? this.#revealed;
      }
      this.#render();
      this.#announce();
    });
  }

  #relayout(): void {
    const u = this.#u;
    this.#layout = layout(this.scale.width, this.scale.height, u);
    const pond = this.#water();
    this.#rodBase = { x: pond.x - pond.width * 0.08, y: this.#layout.pond.y + this.#layout.pond.height + 4 * u };
    this.#rodTip = { x: pond.x + pond.width * 0.3, y: pond.y + pond.height * 0.05 };
    this.#bobberHome = { x: pond.x + pond.width * 0.62, y: pond.y + pond.height * 0.6 };
    this.#drawBackground();
    this.#buildLife();
  }

  #water(): Rect {
    const pond = this.#layout.pond;
    const height = pond.height * 0.6;
    const width = Math.min(pond.width * 0.88, height * 2.8);
    return { x: pond.x + (pond.width - width) / 2, y: pond.y + pond.height * 0.34, width, height };
  }

  #drawBackground(): void {
    const u = this.#u;
    const width = this.scale.width;
    const { pond, header } = this.#layout;
    const g = this.#background;
    g.clear();
    const skyBottom = pond.y + pond.height * 0.3;
    g.fillGradientStyle(colors.skyTop, colors.skyTop, colors.skyBottom, colors.skyBottom, 1, 1, 1, 1);
    g.fillRect(0, 0, width, skyBottom);
    g.fillStyle(0xfff59d, 1);
    g.fillCircle(pond.x + pond.width * 0.86, header.height + pond.height * 0.1, 18 * u);
    g.fillStyle(0xffffff, 0.9);
    for (const [cx, cy, size] of [
      [0.2, 0.08, 1],
      [0.55, 0.14, 0.8],
    ] as const) {
      const x = pond.x + pond.width * cx;
      const y = header.height + pond.height * cy;
      g.fillEllipse(x, y, 54 * u * size, 18 * u * size);
      g.fillEllipse(x + 14 * u * size, y - 8 * u * size, 30 * u * size, 18 * u * size);
    }
    g.fillStyle(colors.hillFar, 1);
    g.fillEllipse(pond.x + pond.width * 0.2, skyBottom + 4 * u, pond.width * 0.7, pond.height * 0.22);
    g.fillStyle(colors.hill, 1);
    g.fillEllipse(pond.x + pond.width * 0.8, skyBottom + 6 * u, pond.width * 0.8, pond.height * 0.2);
    g.fillStyle(colors.grass, 1);
    g.fillRect(0, skyBottom, width, this.scale.height - skyBottom);
    g.fillStyle(colors.grassDark, 1);
    for (let index = 0; index < 18; index++) {
      const x = ((index * 97) % 100) / 100;
      const y = ((index * 61) % 100) / 100;
      const tx = pond.x + pond.width * x;
      const ty = skyBottom + 10 * u + (pond.height * 0.7 - 10 * u) * y;
      g.fillTriangle(tx, ty, tx + 3 * u, ty - 9 * u, tx + 6 * u, ty);
    }
    const water = this.#water();
    g.fillStyle(colors.waterEdge, 1);
    g.fillEllipse(water.x + water.width / 2, water.y + water.height / 2, water.width + 12 * u, water.height + 10 * u);
    const steps = 6;
    for (let step = 0; step < steps; step++) {
      const t = step / (steps - 1);
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(colors.waterTop),
        Phaser.Display.Color.ValueToColor(colors.waterBottom),
        steps - 1,
        step,
      );
      g.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 1);
      const scale = 1 - t * 0.55;
      g.fillEllipse(water.x + water.width / 2, water.y + water.height / 2 - water.height * 0.06 * t, water.width * scale, water.height * scale, 48);
    }
    g.fillStyle(0xffffff, 0.25);
    g.fillEllipse(water.x + water.width * 0.3, water.y + water.height * 0.25, water.width * 0.25, 5 * u);
    g.fillEllipse(water.x + water.width * 0.7, water.y + water.height * 0.75, water.width * 0.18, 4 * u);
  }

  #buildLife(): void {
    const u = this.#u;
    this.tweens.killTweensOf(this.#life.list);
    this.#life.removeAll(true);
    const water = this.#water();
    const cx = water.x + water.width / 2;
    const cy = water.y + water.height / 2;
    for (const [fx, fy, size, duration] of [
      [0.3, 0.55, 1, 7000],
      [0.62, 0.35, 0.8, 9000],
      [0.45, 0.78, 0.65, 6000],
    ] as const) {
      const shadow = this.add.graphics();
      shadow.fillStyle(0x0d47a1, 0.28);
      const length = 34 * u * size;
      shadow.fillEllipse(0, 0, length, length * 0.4);
      shadow.fillTriangle(-length * 0.45, 0, -length * 0.75, -length * 0.22, -length * 0.75, length * 0.22);
      const fish = this.add.container(water.x + water.width * fx, water.y + water.height * fy, [shadow]);
      this.#life.add(fish);
      const reach = water.width * 0.18;
      this.tweens.add({
        targets: fish,
        x: fish.x + reach,
        duration,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
        onYoyo: () => fish.setScale(-1, 1),
        onRepeat: () => fish.setScale(1, 1),
      });
    }
    for (const [fx, fy, radius, flower] of [
      [0.16, 0.45, 13, true],
      [0.25, 0.7, 10, false],
      [0.84, 0.5, 12, false],
      [0.76, 0.78, 9, true],
    ] as const) {
      const pad = this.add.graphics();
      const r = radius * u;
      pad.fillStyle(colors.pad, 1);
      pad.slice(0, 0, r, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(340), false);
      pad.fillPath();
      pad.lineStyle(1.5 * u, colors.padDark, 1);
      pad.lineBetween(0, 0, -r * 0.7, 0);
      pad.lineBetween(0, 0, -r * 0.4, r * 0.6);
      pad.lineBetween(0, 0, -r * 0.4, -r * 0.6);
      if (flower) {
        pad.fillStyle(0xf48fb1, 1);
        for (let petal = 0; petal < 5; petal++) {
          const angle = (petal / 5) * Math.PI * 2;
          pad.fillEllipse(-r * 0.2 + Math.cos(angle) * 4 * u, Math.sin(angle) * 4 * u, 6 * u, 6 * u);
        }
        pad.fillStyle(0xfff176, 1);
        pad.fillCircle(-r * 0.2, 0, 2.5 * u);
      }
      pad.setPosition(water.x + water.width * fx, water.y + water.height * fy);
      pad.setRotation(fx * 7);
      this.#life.add(pad);
    }
    for (const side of [-1, 1] as const) {
      const reeds = this.add.graphics();
      const baseX = side < 0 ? water.x + water.width * 0.04 : water.x + water.width * 0.96;
      const baseY = cy + water.height * 0.15;
      for (let index = 0; index < 4; index++) {
        const x = baseX + side * index * 5 * u;
        const top = baseY - (32 + ((index * 13) % 18)) * u;
        reeds.lineStyle(2.5 * u, 0x558b2f, 1);
        reeds.lineBetween(x, baseY, x + side * 2 * u, top);
        reeds.fillStyle(0x6d4c41, 1);
        reeds.fillRoundedRect(x + side * 2 * u - 3 * u, top, 6 * u, 13 * u, 3 * u);
      }
      this.#life.add(reeds);
    }
    for (let index = 0; index < 3; index++) {
      const ripple = this.add.graphics();
      ripple.lineStyle(1.5 * u, 0xffffff, 0.7);
      ripple.strokeEllipse(0, 0, 26 * u, 8 * u);
      ripple.setPosition(cx + (index - 1) * water.width * 0.22, cy + (index % 2 === 0 ? -1 : 1) * water.height * 0.15);
      ripple.setAlpha(0);
      this.#life.add(ripple);
      this.tweens.add({
        targets: ripple,
        scaleX: { from: 0.4, to: 1.6 },
        scaleY: { from: 0.4, to: 1.6 },
        alpha: { from: 0.8, to: 0 },
        duration: 2400,
        delay: index * 900,
        repeat: -1,
      });
    }
  }

  #buildBobber(): void {
    const u = this.#u;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(0, 0, 6 * u);
    g.fillStyle(colors.bobberRed, 1);
    g.slice(0, 0, 6 * u, Math.PI, 0, false);
    g.fillPath();
    g.lineStyle(1.5 * u, 0x5d4037, 1);
    g.lineBetween(0, -6 * u, 0, -11 * u);
    this.#bobber.add(g);
  }

  #animateCast(event: CastEvent, done: () => void): void {
    const u = this.#u;
    const players = this.#update?.players ?? {};
    const water = this.#water();
    const target = {
      x: water.x + water.width * (0.42 + ((event.nr * 37) % 30) / 100),
      y: water.y + water.height * (0.4 + ((event.nr * 53) % 30) / 100),
    };
    this.#fx.removeAll(true);
    const banner = this.#label(this.#layout.pond.x + this.#layout.pond.width / 2, this.#layout.pond.y + 8 * u, castingText(this.#t, event, players), 15, colors.text, true, 0xffffff);
    this.#fx.add(banner);
    this.#connection.sound(castSound);
    this.#bobberFlying = true;
    const start = { x: this.#rodTip.x, y: this.#rodTip.y };
    const flight = { t: 0 };
    this.#bobber.setPosition(start.x, start.y);
    this.tweens.add({
      targets: flight,
      t: 1,
      duration: flightSeconds * 1000,
      ease: "Sine.easeOut",
      onUpdate: () => {
        const t = flight.t;
        this.#bobber.x = start.x + (target.x - start.x) * t;
        this.#bobber.y = start.y + (target.y - start.y) * t - Math.sin(t * Math.PI) * 50 * u;
      },
      onComplete: () => {
        this.#splash(target.x, target.y);
        this.#bobberHome = { ...target };
        this.#bobberFlying = false;
        this.time.delayedCall(900, () => this.#bite(event, target, banner, done));
      },
    });
  }

  #bite(event: CastEvent, target: { x: number; y: number }, banner: Phaser.GameObjects.Container, done: () => void): void {
    const u = this.#u;
    const caught = event.caught;
    if (caught === null) {
      this.#connection.sound(catchSound(null));
      this.#bobberFlying = true;
      this.tweens.add({ targets: this.#bobber, x: target.x + 6 * u, yoyo: true, repeat: 2, duration: 140 });
      this.time.delayedCall(900, () => {
        this.#bobberFlying = false;
        banner.destroy();
        this.#showCard(event, null, done);
      });
      return;
    }
    this.#bobberFlying = true;
    this.tweens.add({
      targets: this.#bobber,
      y: target.y + 9 * u,
      duration: 160,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        this.#bobberFlying = false;
        this.#splash(target.x, target.y);
        this.#connection.sound(catchSound(caught));
        banner.destroy();
        const jumper = this.add.container(target.x, target.y);
        const g = this.add.graphics();
        this.#drawCatch(g, caught, 54 * u);
        jumper.add(g);
        jumper.setScale(0.3);
        this.#fx.add(jumper);
        this.tweens.add({
          targets: jumper,
          y: target.y - 60 * u,
          scale: 1,
          angle: -15,
          duration: 450,
          ease: "Back.easeOut",
          onComplete: () => {
            this.tweens.add({ targets: jumper, alpha: 0, duration: 250, onComplete: () => jumper.destroy() });
            this.#showCard(event, caught, done);
          },
        });
      },
    });
  }

  #showCard(event: CastEvent, caught: Catch | null, done: () => void): void {
    const u = this.#u;
    const pond = this.#layout.pond;
    const width = Math.min(pond.width - 32 * u, 300 * u);
    const height = Math.min(pond.height - 16 * u, caught === null ? 96 * u : 170 * u);
    const card = this.add.container(pond.x + pond.width / 2, pond.y + pond.height / 2);
    const g = this.add.graphics();
    const rarity = rarityOf(caught);
    g.fillStyle(colors.paper, 0.97);
    g.fillRoundedRect(-width / 2, -height / 2, width, height, 16 * u);
    g.lineStyle(4 * u, rarity === null ? 0xb0bec5 : rarityColors[rarity], 1);
    g.strokeRoundedRect(-width / 2, -height / 2, width, height, 16 * u);
    card.add(g);
    const players = this.#update?.players ?? {};
    const t = this.#t;
    const title = caught === null ? t.nothingBitTitle : `${catchName(t, caught)}!`;
    const top = -height / 2 + 10 * u;
    const owner = players[event.player]?.you === true ? t.yourCatch : t.catchOf(nameOf(t, event.player, players));
    card.add(this.#plainText(0, top, owner, 13, colors.muted, false));
    card.add(this.#plainText(0, top + 18 * u, title, 22, colors.text, true));
    if (caught !== null) {
      const art = this.add.graphics();
      this.#drawCatch(art, caught, Math.min(drawLength(caught.cm, 80 * u), width * 0.6));
      art.setPosition(0, top + 82 * u);
      card.add(art);
      if (rarity === "legendaer") {
        const sparkle = this.#plainText(width * 0.32, top + 54 * u, "✨", 22, colors.text, false);
        card.add(sparkle);
        this.tweens.add({ targets: sparkle, angle: 20, scale: 1.3, yoyo: true, repeat: -1, duration: 400 });
      }
      card.add(this.#plainText(0, top + 112 * u, catchDetail(t, caught), 16, colors.text, true));
      const mine = this.#update?.players[event.player]?.you === true;
      const news = mine && caught.fish !== "stiefel" ? this.#news.find((entry) => entry.fish === caught.fish) : undefined;
      if (news !== undefined) {
        card.add(this.#plainText(0, top + 134 * u, news.kind === "neu" ? t.newInBook : t.newRecord, 14, "#7e57c2", true));
      }
    } else {
      card.add(this.#plainText(0, top + 50 * u, catchDetail(t, null), 14, colors.muted, false));
    }
    card.setScale(0.6);
    card.setAlpha(0);
    this.#fx.add(card);
    this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 260, ease: "Back.easeOut" });
    const stay = caught === null ? 1300 : rarity === "legendaer" ? 3400 : 2400;
    this.time.delayedCall(stay, () => {
      this.tweens.add({
        targets: card,
        alpha: 0,
        duration: 250,
        onComplete: () => {
          this.tweens.killTweensOf(card.list);
          card.destroy();
          this.#news = [];
          done();
        },
      });
    });
  }

  #splash(x: number, y: number): void {
    const u = this.#u;
    for (let index = 0; index < 2; index++) {
      const ring = this.add.graphics();
      ring.lineStyle(2 * u, 0xffffff, 0.9);
      ring.strokeEllipse(0, 0, 22 * u, 7 * u);
      ring.setPosition(x, y);
      this.#fx.add(ring);
      this.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 650, delay: index * 160, onComplete: () => ring.destroy() });
    }
  }

  #drawCatch(g: Phaser.GameObjects.Graphics, caught: Catch, length: number): void {
    if (caught.fish === "stiefel") {
      this.#drawBoot(g, length);
    } else {
      this.#drawFish(g, caught.fish, length, false);
    }
  }

  #drawBoot(g: Phaser.GameObjects.Graphics, size: number): void {
    const s = size / 60;
    g.fillStyle(0x6d4c41, 1);
    g.fillRoundedRect(-14 * s, -26 * s, 20 * s, 34 * s, 4 * s);
    g.fillRoundedRect(-14 * s, 0, 40 * s, 16 * s, 8 * s);
    g.fillStyle(0x3e2723, 1);
    g.fillRect(-14 * s, 14 * s, 40 * s, 5 * s);
    g.fillStyle(0x8d6e63, 1);
    g.fillRect(-16 * s, -28 * s, 24 * s, 6 * s);
    g.fillStyle(0x4fc3f7, 0.9);
    g.fillCircle(20 * s, -8 * s, 3 * s);
    g.fillCircle(26 * s, -16 * s, 2 * s);
  }

  #drawFish(g: Phaser.GameObjects.Graphics, id: FishId, length: number, silhouette: boolean): void {
    const look = fishLook(id);
    const u = this.#u;
    const proportions = { round: [0.72, 0.42], slim: [0.8, 0.26], eel: [0.9, 0.13], catfish: [0.78, 0.3] }[look.shape];
    const bodyW = length * (proportions[0] ?? 0.7);
    const bodyH = length * (proportions[1] ?? 0.4);
    const half = bodyW / 2;
    const shade = (color: number) => (silhouette ? 0x546e7a : color);
    const tailX = -half + bodyW * 0.06;
    const tail = look.shape === "eel" ? bodyH * 0.9 : bodyH * 0.55;
    g.fillStyle(shade(look.fin), 1);
    g.fillTriangle(tailX, 0, tailX - length * 0.18, -tail, tailX - length * 0.18, tail);
    g.fillTriangle(-bodyW * 0.1, -bodyH * 0.4, bodyW * 0.15, -bodyH * 0.42, -bodyW * 0.18, -bodyH * 0.78);
    g.fillStyle(shade(look.body), 1);
    g.fillEllipse(0, 0, bodyW, bodyH, 32);
    if (!silhouette) {
      g.fillStyle(look.belly, 1);
      g.fillEllipse(bodyW * 0.04, bodyH * 0.2, bodyW * 0.78, bodyH * 0.45, 24);
      const inside = (x: number) => (bodyH / 2) * Math.sqrt(Math.max(0, 1 - (x / half) ** 2));
      if (look.pattern === "stripes") {
        g.fillStyle(look.patternColor, 0.85);
        for (const fx of [-0.3, -0.05, 0.2]) {
          const x = fx * bodyW;
          const h = inside(x) * 0.85;
          g.fillRect(x - bodyW * 0.03, -h, bodyW * 0.06, h * 1.5);
        }
      } else if (look.pattern === "spots") {
        g.fillStyle(look.patternColor, 0.9);
        for (const [fx, fy] of [
          [-0.25, -0.15],
          [-0.05, -0.25],
          [0.12, -0.08],
          [-0.15, 0.08],
          [0.25, -0.22],
        ] as const) {
          g.fillCircle(fx * bodyW, fy * bodyH, Math.max(1.2 * u, bodyH * 0.07));
        }
      } else if (look.pattern === "patches") {
        g.fillStyle(look.patternColor, 1);
        g.fillEllipse(-bodyW * 0.12, -bodyH * 0.12, bodyW * 0.3, bodyH * 0.4);
        g.fillEllipse(bodyW * 0.22, -bodyH * 0.05, bodyW * 0.16, bodyH * 0.3);
        g.fillStyle(0x263238, 1);
        g.fillEllipse(-bodyW * 0.3, bodyH * 0.02, bodyW * 0.08, bodyH * 0.16);
      }
      if (id === "forelle") {
        g.fillStyle(0xf48fb1, 0.75);
        g.fillEllipse(0, bodyH * 0.02, bodyW * 0.8, bodyH * 0.16);
      }
      g.fillStyle(look.fin, 1);
      g.fillTriangle(bodyW * 0.02, bodyH * 0.3, bodyW * 0.2, bodyH * 0.3, bodyW * 0.08, bodyH * 0.6);
      const eyeX = half - bodyW * (look.shape === "eel" ? 0.06 : 0.16);
      const eyeR = Math.max(1.5 * u, bodyH * (look.shape === "eel" ? 0.22 : 0.11));
      g.fillStyle(0xffffff, 1);
      g.fillCircle(eyeX, -bodyH * 0.1, eyeR);
      g.fillStyle(id === "rotauge" ? 0xd32f2f : 0x212121, 1);
      g.fillCircle(eyeX + eyeR * 0.25, -bodyH * 0.1, eyeR * 0.55);
      if (look.shape === "catfish") {
        g.lineStyle(Math.max(1, 1.5 * u), 0x3e2723, 1);
        g.lineBetween(half - bodyW * 0.04, bodyH * 0.1, half + bodyW * 0.16, bodyH * 0.4);
        g.lineBetween(half - bodyW * 0.04, bodyH * 0.14, half + bodyW * 0.1, bodyH * 0.55);
      }
      if (look.crown) {
        g.fillStyle(0xffd600, 1);
        const cx = bodyW * 0.18;
        const cy = -bodyH * 0.48;
        const w = bodyW * 0.22;
        g.fillRect(cx - w / 2, cy - bodyH * 0.08, w, bodyH * 0.1);
        g.fillTriangle(cx - w / 2, cy - bodyH * 0.07, cx - w / 4, cy - bodyH * 0.07, cx - w * 0.4, cy - bodyH * 0.32);
        g.fillTriangle(cx - w / 8, cy - bodyH * 0.07, cx + w / 8, cy - bodyH * 0.07, cx, cy - bodyH * 0.38);
        g.fillTriangle(cx + w / 4, cy - bodyH * 0.07, cx + w / 2, cy - bodyH * 0.07, cx + w * 0.4, cy - bodyH * 0.32);
        g.fillStyle(0xe53935, 1);
        g.fillCircle(cx, cy - bodyH * 0.03, Math.max(1, bodyH * 0.035));
      }
    }
  }

  #render(): void {
    const update = this.#update;
    if (update === undefined) {
      return;
    }
    const snapshot = update.snapshot as Snapshot;
    this.#ownRod = inventory(this.#t, update.profile).tier;
    this.#ui.removeAll(true);
    const finishedShown = this.#pending === undefined && endShown(snapshot, this.#revealed);
    const shown = shownSnapshot(snapshot, this.#pending === undefined ? this.#revealed : -1);
    if (finishedShown && !this.#endSeen) {
      this.#endSeen = true;
      this.#panel = "end";
    }
    if (finishedShown && !this.#endSounded) {
      this.#endSounded = true;
      const sound = endSound(snapshot);
      if (sound !== undefined) {
        this.#connection.sound(sound);
      }
    }
    this.#renderHeader(shown, update);
    this.#renderNews(snapshot, update);
    this.#renderControls(shown, update, finishedShown);
    if (this.#panel === "shop") {
      this.#renderShop(shown, update);
    } else if (this.#panel === "book") {
      this.#renderBook(update);
    } else if (this.#panel === "rules") {
      this.#renderRules(update);
    } else if (this.#panel === "end" && finishedShown) {
      this.#renderEnd(snapshot, update);
    }
  }

  #renderHeader(snapshot: Snapshot, update: Update): void {
    const u = this.#u;
    const { header } = this.#layout;
    const margin = 10 * u;
    this.#ui.add(this.#plainText(header.x + header.width / 2, 8 * u, statusLine(this.#t, snapshot, update.players, update.options), 17, colors.text, true));
    const chips = chipPositions(snapshot.players.length, { x: header.x + margin, y: 36 * u, width: header.width - 2 * margin, height: 44 * u }, 6 * u);
    snapshot.players.forEach((seat, index) => {
      const area = chips[index];
      if (area === undefined) {
        return;
      }
      const current = snapshot.result === undefined && snapshot.public.current === seat;
      const g = this.add.graphics();
      g.fillStyle(current ? colors.current : 0xffffff, current ? 1 : 0.8);
      g.fillRoundedRect(area.x, area.y, area.width, area.height, 10 * u);
      if (current) {
        g.lineStyle(2 * u, 0xf9a825, 1);
        g.strokeRoundedRect(area.x, area.y, area.width, area.height, 10 * u);
      }
      this.#ui.add(g);
      const offline = update.players[seat]?.connected === false ? " 💤" : "";
      const winner = snapshot.result?.winners.includes(seat) === true ? "🏆 " : current ? "🎣 " : "";
      const name = this.#plainText(area.x + area.width / 2, area.y + 4 * u, `${winner}${nameOf(this.#t, seat, update.players)}${offline}`, 13, colors.text, true, area.width * 4);
      this.#fit(name, area.width - 6 * u);
      this.#ui.add(name);
      const length = shownLength(snapshot, seat, this.#revealed);
      this.#ui.add(this.#plainText(area.x + area.width / 2, area.y + 23 * u, `🐟 ${cmText(length)}`, 13, colors.muted, false));
    });
  }

  #renderNews(snapshot: Snapshot, update: Update): void {
    const u = this.#u;
    const { news } = this.#layout;
    const events = visibleEvents(snapshot, this.#revealed, 2);
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.55);
    g.fillRoundedRect(news.x, news.y, news.width, news.height, 10 * u);
    this.#ui.add(g);
    if (events.length === 0) {
      this.#ui.add(this.#plainText(news.x + news.width / 2, news.y + 15 * u, this.#t.quietPond, 13, colors.muted, false, news.width - 12 * u));
      return;
    }
    const lines = events.map((event) => eventText(this.#t, event, update.players));
    const latest = lines.at(-1) ?? "";
    const older = lines.length > 1 ? (lines[0] ?? "") : "";
    const room = news.width - 12 * u;
    const single = this.#plainText(news.x + news.width / 2, news.y + (older === "" ? 15 : 25) * u, latest, 14, colors.text, true, room * 10);
    if (single.width > room * 1.15) {
      single.destroy();
      const wrapped = this.#plainText(news.x + news.width / 2, news.y + 7 * u, latest, 13, colors.text, true, room);
      this.#fit(wrapped, room);
      this.#ui.add(wrapped);
      return;
    }
    this.#fit(single, room);
    if (older !== "") {
      const text = this.#plainText(news.x + news.width / 2, news.y + 5 * u, older, 12, colors.muted, false, room * 10);
      this.#fit(text, room);
      this.#ui.add(text);
    }
    this.#ui.add(single);
  }

  #renderControls(snapshot: Snapshot, update: Update, finishedShown: boolean): void {
    const u = this.#u;
    const { inventory: box, primary, hint, secondary } = this.#layout;
    const g = this.add.graphics();
    g.fillStyle(colors.paper, 0.95);
    g.fillRoundedRect(box.x, box.y, box.width, box.height, 12 * u);
    this.#ui.add(g);
    this.#ui.add(this.#plainText(box.x + box.width / 2, box.y + 5 * u, inventoryLine(this.#t, update.profile), 16, colors.text, true));
    const bucket = shownBucket(snapshot, this.#revealed);
    this.#ui.add(this.#plainText(box.x + box.width / 2, box.y + 27 * u, bucketLine(this.#t, bucket), 12, colors.muted, false));

    const action = mainAction(this.#t, snapshot, update.profile, update.players);
    const waiting = action.kind === "wait" || this.#pending !== undefined || this.#busy;
    this.#ui.add(
      this.#button(primary, finishedShown ? this.#t.seeResult : action.label, {
        primary: true,
        enabled: finishedShown || !waiting,
        size: 19,
        onTap: () => {
          if (finishedShown) {
            this.#open("end");
          } else if (action.kind === "move") {
            this.#send(action.move);
          } else if (action.kind === "shop") {
            this.#open("shop");
          }
        },
      }),
    );
    const hintLine = this.#pending !== undefined && action.kind !== "wait" ? this.#t.waitForBite : action.hint;
    const hintText = this.#plainText(hint.x + hint.width / 2, hint.y + 2 * u, hintLine, 12, colors.light, false, hint.width);
    this.#ui.add(hintText);

    const buttons: [string, Panel][] = [
      [this.#t.shopButton, "shop"],
      [this.#t.bookButton, "book"],
      [this.#t.rulesButton, "rules"],
    ];
    const cells = chipPositions(buttons.length, secondary, 8 * u);
    buttons.forEach(([label, panel], index) => {
      const area = cells[index];
      if (area !== undefined) {
        this.#ui.add(this.#button(area, label, { enabled: true, size: 14, onTap: () => this.#open(panel) }));
      }
    });
  }

  #panelFrame(title: string, subtitle: string): Rect {
    const u = this.#u;
    const { column } = this.#layout;
    const width = column.width - 20 * u;
    const area = { x: column.x + 10 * u, y: 10 * u, width, height: this.scale.height - 20 * u };
    const shade = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.45).setOrigin(0, 0);
    shade.setInteractive();
    this.#ui.add(shade);
    const g = this.add.graphics();
    g.fillStyle(colors.paper, 1);
    g.fillRoundedRect(area.x, area.y, area.width, area.height, 18 * u);
    g.lineStyle(3 * u, colors.buttonLine, 1);
    g.strokeRoundedRect(area.x, area.y, area.width, area.height, 18 * u);
    this.#ui.add(g);
    const heading = this.#plainText(area.x + area.width / 2, area.y + 12 * u, title, 20, colors.text, true, area.width * 4);
    this.#fit(heading, area.width - 24 * u);
    this.#ui.add(heading);
    if (subtitle !== "") {
      this.#ui.add(this.#plainText(area.x + area.width / 2, area.y + 40 * u, subtitle, 13, colors.muted, false, area.width - 24 * u));
    }
    const close = { x: area.x + 14 * u, y: area.y + area.height - 58 * u, width: area.width - 28 * u, height: 46 * u };
    this.#ui.add(this.#button(close, this.#t.backToPond, { enabled: true, size: 16, onTap: () => this.#open("none") }));
    return { x: area.x + 12 * u, y: area.y + 64 * u, width: area.width - 24 * u, height: area.height - 64 * u - 70 * u };
  }

  #renderShop(snapshot: Snapshot, update: Update): void {
    const u = this.#u;
    const own = update.profile;
    const t = this.#t;
    const subtitle = `${t.youHave(`${own.items.muenzen ?? 0} ${coinIcon}`, `${own.items.koeder ?? 0} ${baitIcon}`)}${isMyTurn(snapshot) ? "" : t.buyOnYourTurn}`;
    const body = this.#panelFrame(t.shopTitle, subtitle);
    const rows = shopRows(t, snapshot, own);
    const cells = gridCells(rows.length, 1, { ...body, height: Math.min(body.height, rows.length * 86 * u) }, 8 * u);
    rows.forEach((row, index) => {
      const cell = cells[index];
      if (cell === undefined) {
        return;
      }
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(cell.x, cell.y, cell.width, cell.height, 12 * u);
      g.lineStyle(1.5 * u, colors.paperLine, 1);
      g.strokeRoundedRect(cell.x, cell.y, cell.width, cell.height, 12 * u);
      this.#ui.add(g);
      const buttonWidth = Math.min(110 * u, cell.width * 0.34);
      const textWidth = cell.width - buttonWidth - 24 * u;
      const title = this.#plainText(cell.x + 10 * u, cell.y + 8 * u, row.title, 15, colors.text, true, textWidth, "left").setOrigin(0, 0);
      this.#ui.add(title);
      const detail = this.#plainText(cell.x + 10 * u, cell.y + 28 * u, row.note === "" ? row.detail : `${row.detail}\n${row.note}`, 11, colors.muted, false, textWidth, "left").setOrigin(0, 0);
      const room = cell.height - 32 * u;
      if (detail.height > room && room > 0) {
        detail.setScale(room / detail.height);
      }
      this.#ui.add(detail);
      const move = row.move;
      if (row.price !== "") {
        const area = { x: cell.x + cell.width - buttonWidth - 10 * u, y: cell.y + (cell.height - 44 * u) / 2, width: buttonWidth, height: 44 * u };
        this.#ui.add(
          this.#button(area, row.price, {
            enabled: move !== undefined && !this.#busy,
            primary: move !== undefined,
            size: 15,
            onTap: () => {
              if (move !== undefined) {
                this.#send(move);
              }
            },
          }),
        );
      }
    });
  }

  #renderBook(update: Update): void {
    const u = this.#u;
    const profile = update.profile;
    const t = this.#t;
    const body = this.#panelFrame(`📖 ${t.bookHeading(bookSummary(t, profile))}`, statsLine(t, profile));
    const entries = bookEntries(profile);
    const cells = gridCells(entries.length, 2, body, 6 * u);
    entries.forEach((entry, index) => {
      const cell = cells[index];
      if (cell === undefined) {
        return;
      }
      const g = this.add.graphics();
      g.fillStyle(entry.caught ? 0xffffff : 0xeceff1, 1);
      g.fillRoundedRect(cell.x, cell.y, cell.width, cell.height, 10 * u);
      g.lineStyle(2 * u, entry.caught ? rarityColors[entry.fish.rarity] : 0xcfd8dc, 1);
      g.strokeRoundedRect(cell.x, cell.y, cell.width, cell.height, 10 * u);
      this.#ui.add(g);
      const art = this.add.graphics();
      const artLength = Math.min(cell.width * 0.5, cell.height * 1.1, 70 * u);
      this.#drawFish(art, entry.fish.id, artLength, !entry.caught);
      art.setPosition(cell.x + cell.width * 0.3, cell.y + cell.height * 0.5);
      this.#ui.add(art);
      const textX = cell.x + cell.width * 0.58;
      const textWidth = cell.width * 0.4;
      const small = cell.height < 60 * u;
      const name = this.#plainText(textX, cell.y + 4 * u, entry.caught ? t.fish(entry.fish.id) : "???", small ? 11 : 13, colors.text, true, textWidth * 4, "left").setOrigin(0, 0);
      this.#fit(name, textWidth);
      this.#ui.add(name);
      const line = entry.best === null ? `${t.rarity(entry.fish.rarity)}\n${bookEntryLine(t, entry)}` : `${t.rarity(entry.fish.rarity)}\n${t.recordHeading}\n${cmText(entry.best)}`;
      this.#ui.add(this.#plainText(textX, cell.y + (small ? 18 : 22) * u, line, small ? 9 : 10, colors.muted, false, textWidth, "left").setOrigin(0, 0));
    });
  }

  #renderRules(update: Update): void {
    const u = this.#u;
    const body = this.#panelFrame(this.#t.rulesTitle, "");
    const top = body.y - 24 * u;
    const bottom = body.y + body.height;
    for (let size = 14; size >= 8; size--) {
      let y = top;
      const texts = rulesLines(this.#t, update.options).map((line) => {
        const text = this.#plainText(body.x, y, `• ${line}`, size, colors.text, false, body.width, "left").setOrigin(0, 0);
        y += text.height + 6 * u;
        return text;
      });
      if (y <= bottom || size === 8) {
        texts.forEach((text) => this.#ui.add(text));
        return;
      }
      texts.forEach((text) => text.destroy());
    }
  }

  #renderEnd(snapshot: Snapshot, update: Update): void {
    const u = this.#u;
    const t = this.#t;
    const body = this.#panelFrame(statusLine(t, snapshot, update.players, update.options), t.longestWins);
    let y = body.y;
    ranking(t, snapshot, update.players).forEach((row, index) => {
      const g = this.add.graphics();
      g.fillStyle(row.winner ? 0xfff3c4 : 0xffffff, 1);
      g.fillRoundedRect(body.x, y, body.width, 50 * u, 10 * u);
      this.#ui.add(g);
      const text = this.#plainText(body.x + 10 * u, y + 6 * u, `${row.winner ? "🏆 " : ""}${rankLine(t, row, index + 1)}`, 13, colors.text, row.winner, body.width - 80 * u, "left").setOrigin(0, 0);
      this.#ui.add(text);
      if (row.best !== null) {
        const art = this.add.graphics();
        this.#drawCatch(art, row.best, 30 * u);
        art.setPosition(body.x + body.width - 34 * u, y + 25 * u);
        this.#ui.add(art);
      }
      y += 56 * u;
    });
    const sale = endSaleText(t, snapshot);
    const extra = [sale, t.yourBook(bookSummary(t, update.profile)), t.hostStarts].filter((line) => line !== "").join("\n");
    this.#ui.add(this.#plainText(body.x + body.width / 2, y + 8 * u, extra, 13, colors.muted, false, body.width));
  }

  #open(panel: Panel): void {
    this.#panel = panel;
    this.#render();
  }

  #send(move: PondMove): void {
    if (this.#busy) {
      return;
    }
    this.#busy = true;
    this.#render();
    void this.#connection.move(move).finally(() => {
      this.#busy = false;
      this.#render();
    });
  }

  #button(area: Rect, label: string, options: { enabled: boolean; primary?: boolean; size: number; onTap: () => void }): Phaser.GameObjects.Container {
    const u = this.#u;
    const { width, height } = area;
    const g = this.add.graphics();
    const fill = !options.enabled ? colors.disabled : options.primary === true ? colors.primary : colors.button;
    g.fillStyle(0x000000, 0.15);
    g.fillRoundedRect(-width / 2, -height / 2 + 3 * u, width, height, 14 * u);
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-width / 2, -height / 2, width, height, 14 * u);
    if (options.primary !== true && options.enabled) {
      g.lineStyle(2 * u, colors.buttonLine, 1);
      g.strokeRoundedRect(-width / 2, -height / 2, width, height, 14 * u);
    }
    const color = !options.enabled ? "#757575" : options.primary === true ? colors.light : colors.text;
    const text = this.add
      .text(0, 0, label, { fontFamily: font, fontSize: `${options.size * u}px`, fontStyle: "700", color, align: "center" })
      .setOrigin(0.5);
    this.#fit(text, width - 12 * u);
    const button = this.add.container(area.x + width / 2, area.y + height / 2, [g, text]);
    button.setSize(width, height);
    if (options.enabled) {
      button.setInteractive({ useHandCursor: true });
      button.on("pointerdown", () => button.setScale(0.96));
      button.on("pointerout", () => button.setScale(1));
      button.on("pointerup", () => {
        button.setScale(1);
        options.onTap();
      });
    }
    return button;
  }

  #label(x: number, y: number, value: string, size: number, color: string, bold: boolean, background: number): Phaser.GameObjects.Container {
    const u = this.#u;
    const text = this.#plainText(0, 0, value, size, color, bold).setOrigin(0.5, 0);
    const g = this.add.graphics();
    g.fillStyle(background, 0.92);
    g.fillRoundedRect(-text.width / 2 - 10 * u, -4 * u, text.width + 20 * u, text.height + 8 * u, 12 * u);
    return this.add.container(x, y, [g, text]);
  }

  #plainText(x: number, y: number, value: string, size: number, color: string, bold: boolean, wrap?: number, align: "center" | "left" = "center"): Phaser.GameObjects.Text {
    const u = this.#u;
    return this.add
      .text(x, y, value, {
        fontFamily: font,
        fontSize: `${size * u}px`,
        fontStyle: bold ? "700" : "400",
        color,
        align,
        wordWrap: { width: wrap ?? this.#layout.column.width - 32 * u },
      })
      .setOrigin(0.5, 0);
  }

  #fit(text: Phaser.GameObjects.Text, width: number): void {
    if (text.width > width && text.width > 0) {
      text.setScale(width / text.width);
    }
  }
}
