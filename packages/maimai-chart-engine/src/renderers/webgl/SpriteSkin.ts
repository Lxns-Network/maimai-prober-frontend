import { ringSizeAt, ringAlphaAt } from "../../effects/TouchHitEffectRenderer";
import frames from "./sprites/frames.json";
import type { ChartDrawingContext, RenderContext } from "../BaseRenderer";
import type { TouchPart } from "../../utils/touchDrawOrder";
import type { Point2D } from "../../types";

const urls = {
  notes: new URL("./sprites/notes.webp", import.meta.url).href,
  Outline_18: new URL("./sprites/Outline_18.webp", import.meta.url).href,
  Normal: new URL("./sprites/Normal.webp", import.meta.url).href,
  Each: new URL("./sprites/Each.webp", import.meta.url).href,
  Break: new URL("./sprites/Break.webp", import.meta.url).href,
  Slide: new URL("./sprites/Slide.webp", import.meta.url).href,
  EachBar: new URL("./sprites/EachBar.webp", import.meta.url).href,
};
type Sheet = keyof typeof urls;
type Guide = Exclude<Sheet, "notes" | "Outline_18" | "EachBar">;
type Frame = keyof typeof frames;
const fanFrames = [
  "Fan1",
  "Fan2",
  "Fan3",
  "Fan4",
  "Fan5",
  "Fan6",
  "Fan7",
  "Fan8",
  "Fan9",
  "Fan10",
  "Fan11",
] as const;

export class SpriteSkin {
  private static pending?: Promise<SpriteSkin>;

  static load() {
    return (this.pending ??= Promise.all(
      Object.entries(urls).map(async ([key, url]) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        return [key, image] as const;
      }),
    )
      .then(
        (sheets) => new SpriteSkin(Object.fromEntries(sheets) as Record<Sheet, HTMLImageElement>),
      )
      .catch((error: unknown) => {
        this.pending = undefined;
        throw error;
      }));
  }

  private constructor(private readonly sheets: Record<Sheet, HTMLImageElement>) {}

  draw(
    stage: RenderContext,
    key: Frame,
    x: number,
    y: number,
    scale = 1,
    rotation = 0,
    tint?: readonly [number, number, number],
  ) {
    const [u, v, w, h, px, py] = frames[key];
    const { ctx, radius } = stage;
    const unit = (radius / 480) * scale;
    ctx.save();
    if (tint) ctx.spriteTint = tint;
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.drawImage(
      this.sheets.notes,
      u,
      v,
      w,
      h,
      -w * px * unit,
      -h * py * unit,
      w * unit,
      h * unit,
    );
    ctx.restore();
  }

  plate(stage: RenderContext, key: Exclude<Sheet, "notes">, scale = 1, angle = 0) {
    const { ctx, radius, centerX, centerY } = stage;
    const size = ((1080 * radius) / 480) * scale;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);
    ctx.drawImage(this.sheets[key], -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  guide(
    stage: RenderContext,
    kind: Guide,
    angle: number,
    distance: number,
    alpha: number,
    partnerAngle?: number,
  ) {
    const { ctx, centerX, centerY } = stage;
    ctx.save();
    ctx.globalAlpha *= alpha;
    this.plate(stage, kind, distance / stage.radius, angle + Math.PI / 2);
    ctx.restore();
    if (partnerAngle !== undefined) {
      ctx.save();
      const delta = Math.atan2(Math.sin(partnerAngle - angle), Math.cos(partnerAngle - angle));
      if (Math.abs(delta) < Math.PI - 1e-6) {
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, 2 * distance, angle, angle + delta, delta < 0);
        ctx.closePath();
        ctx.clip();
      }
      this.plate(stage, "EachBar", distance / stage.radius, angle + Math.PI / 2);
      ctx.restore();
    }
  }

  fan(stage: RenderContext, hidden: number, angle: number, isBreak: boolean, each: boolean) {
    const tint: readonly [number, number, number] = isBreak
      ? [1, 148 / 255, 77 / 255]
      : each
        ? [1, 237 / 255, 37 / 255]
        : [0, 251 / 255, 252 / 255];
    for (let i = fanFrames.length - 1; i >= hidden; i--)
      this.draw(stage, fanFrames[i], stage.centerX, stage.centerY, 1, angle + Math.PI / 2, tint);
  }

  exTint(isBreak: boolean, each: boolean, blueStar = false): readonly [number, number, number] {
    return isBreak
      ? [1, 190 / 255, 80 / 255]
      : each
        ? [1, 245 / 255, 93 / 255]
        : blueStar
          ? [0, 0.8, 1]
          : [1, 183 / 255, 232 / 255];
  }

  star(
    stage: RenderContext,
    x: number,
    y: number,
    scale: number,
    rotation: number,
    isBreak: boolean,
    each: boolean,
    double: boolean,
    ex: boolean,
  ) {
    const family = isBreak
      ? "BreakStar"
      : each
        ? "Star_Each"
        : stage.config.pinkSlideStart
          ? "Star_Pink"
          : "Star";
    const suffix = double ? "_Double_00" : "_00";
    this.draw(stage, `${family}${suffix}`, x, y, scale, rotation);
    if (ex)
      this.draw(
        stage,
        `${isBreak ? "BreakStar_Ex" : "Star_Ex"}${suffix}`,
        x,
        y,
        scale * (stage.config.highlightExNotes ? 1.2 : 1),
        rotation,
        this.exTint(isBreak, each, !stage.config.pinkSlideStart),
      );
  }

  hold(
    stage: RenderContext,
    head: Point2D,
    tail: Point2D,
    scale: number,
    angle: number,
    isBreak: boolean,
    each: boolean,
    active: boolean,
    endVisible: boolean,
    ex: boolean,
  ) {
    const family = isBreak ? "BreakHold" : each ? "Hold_Each" : "Hold";
    const { ctx, radius } = stage;
    const length = (Math.hypot(head.x - tail.x, head.y - tail.y) * 480) / radius;
    ctx.save();
    ctx.translate((head.x + tail.x) / 2, (head.y + tail.y) / 2);
    ctx.rotate(angle + Math.PI / 2);
    ctx.scale((scale * radius) / 480, (scale * radius) / 480);
    this.holdSlices(ctx, `${family}_${active ? "On_00" : "00"}`, length);
    if (ex) {
      ctx.spriteTint = this.exTint(isBreak, each);
      this.holdSlices(ctx, isBreak ? "BreakHold_Ex_00" : "Hold_Ex_00", length);
    }
    ctx.restore();
    if (endVisible) this.draw(stage, `${family}_End`, tail.x, tail.y, scale, angle + Math.PI / 2);
  }

  private holdSlices(ctx: ChartDrawingContext, key: Frame, length: number) {
    const [u, v, w, h] = frames[key];
    const cap = 70;
    const top = -length / 2 - cap;
    ctx.drawImage(this.sheets.notes, u, v, w, cap, -w / 2, top, w, cap);
    if (length > 0)
      ctx.drawImage(this.sheets.notes, u, v + cap, w, h - 2 * cap, -w / 2, -length / 2, w, length);
    ctx.drawImage(this.sheets.notes, u, v + h - cap, w, cap, -w / 2, length / 2, w, cap);
  }

  touch(
    stage: RenderContext,
    part: TouchPart,
    point: Point2D,
    isHold: boolean,
    each: boolean,
    remaining: number,
    travel: number,
    duration: number,
    size: number,
  ) {
    const { x, y } = point;
    const pointKey = each ? "UI_NOTES_Touch_Each_Point" : "UI_NOTES_Touch_Point";
    if (part === "center") {
      this.draw(stage, pointKey, x, y, size);
      return;
    }
    const ctx = stage.ctx;
    if (part === "gauge") {
      if (!isHold || remaining >= 0 || duration <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(
        x,
        y,
        stage.radius,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.min(1, -remaining / duration),
      );
      ctx.closePath();
      ctx.clip();
      this.draw(stage, "UI_NOTES_Touch_Hold_hold", x, y, size);
      ctx.restore();
      return;
    }
    const i = Number(part.slice(-1));
    const f = Math.max(0, Math.min(1, 1 - remaining / travel));
    const converge =
      f === 0 ? 0 : Math.min(1, 3.5 * f ** 4 - 3.75 * f ** 3 + 1.45 * f * f - 0.05 * f + 0.0005);
    const angle = (isHold ? [-1, 1, 3, -3][i] / 4 : [-0.5, 0.5, 0, 1][i]) * Math.PI;
    const dist = (((isHold ? Math.SQRT2 * 30 : 34) * (1 - converge) * stage.radius) / 480) * size;
    const holdPetals = [
      "UI_NOTES_Touch_Hold_04",
      "UI_NOTES_Touch_Hold_03",
      "UI_NOTES_Touch_Hold_02",
      "UI_NOTES_Touch_Hold_01",
    ] as const;
    const key = isHold ? holdPetals[i] : each ? "UI_NOTES_Touch_Each_01" : "UI_NOTES_Touch_01";
    ctx.save();
    ctx.globalAlpha *= Math.max(0, Math.min(1, (1.25 - remaining / travel) * 4));
    this.draw(
      stage,
      key,
      x + dist * Math.cos(angle),
      y + dist * Math.sin(angle),
      size,
      angle - Math.PI / 2,
    );
    ctx.restore();
  }

  holdGlow(stage: RenderContext, x: number, y: number, elapsed: number) {
    if (elapsed < 0) return;
    const { ctx } = stage;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const last = Math.floor(elapsed * 10);
    for (let i = Math.max(0, last - 4); i <= last; i++) {
      const life = (elapsed - i / 10) / 0.5;
      ctx.globalAlpha = ringAlphaAt(life);
      this.draw(stage, "HoldRipple", x, y, (400 / 256) * ringSizeAt(life), 0, [1, 1, 0]);
    }
    ctx.restore();
  }

  judgment(stage: RenderContext, point: Point2D, angle: number, ageMs: number, isBreak: boolean) {
    const frame = (ageMs * 60) / 1000;
    if (frame < 0 || frame >= 15) return;
    const scale = 1 + 0.3 * Math.max(0, 1 - frame / 5);
    stage.ctx.save();
    stage.ctx.globalAlpha *= Math.min(1, (15 - frame) / 5);
    this.draw(stage, "UI_GAM_Perfect", point.x, point.y, scale, angle);
    if (isBreak) {
      stage.ctx.globalAlpha *= 0.25 * (1 + Math.sin((frame * Math.PI) / 2));
      this.draw(stage, "UI_GAM_Perfect_Break", point.x, point.y, scale, angle);
    }
    stage.ctx.restore();
  }
}
