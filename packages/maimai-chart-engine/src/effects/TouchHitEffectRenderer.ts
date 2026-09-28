import { BaseRenderer, RenderContext } from "../renderers/BaseRenderer";
import { TouchHoldStartNote, TouchNote, TouchPosition } from "../types";
import { HIT_EFFECT_COLORS, TOUCH_RING_ALPHA_PROFILE } from "./constants";
import { PANEL_RADIUS_UNITS } from "../utils/constants";

type Rgb = { r: number; g: number; b: number };
type StarFrame = 0 | 1 | 2 | 3;

// 特效生命周期 0.5s，由中心扩散光环（Ring）、内圈原地闪烁星点与外圈带阻尼扩散的星点三层组成
const ROOT_SCALE = 70;
const LIFE = 0.5;

const RING_START_SIZE = 2.5 * ROOT_SCALE;
const RING_MAX_SIZE = 540;

const SMALL_COUNT = 8;
const SMALL_SHAPE_R = 0.5 * ROOT_SCALE;
const SMALL_SIZE = 0.3 * ROOT_SCALE;

const ROUND_COUNT = 8;
const ROUND_SHAPE_R = 0.6 * ROOT_SCALE;
const ROUND_SIZE = 0.6 * ROOT_SCALE;
const ROUND_START_SPEED = 10 * ROOT_SCALE;
const ROUND_CLAMP_SPEED = 2.0 * ROOT_SCALE;

// 星点贴图尺寸基准；1.4 倍半宽留出尖端和光晕边距防裁剪
const STAR_SPRITE_REF_OUTER_R = 32;
const STAR_SPRITE_HALF_RATIO = 1.4;

type HermiteKey = { t: number; v: number; inSlope: number; outSlope: number };
type Keyframe = { t: number; v: number };

const RING_SIZE_KEYS: HermiteKey[] = [
  { t: 0, v: 0, inSlope: 10.02783, outSlope: 10.02783 },
  { t: 0.0734887, v: 0.482223, inSlope: 2.93804, outSlope: 2.93804 },
  { t: 0.3209003, v: 0.834577, inSlope: 0.592962, outSlope: 0.592962 },
  { t: 1, v: 1, inSlope: 0.180534, outSlope: 0.180534 },
];

const RING_ALPHA_KEYS: Keyframe[] = [
  { t: 0, v: 1 },
  { t: 5484 / 65535, v: 1 },
  { t: 18591 / 65535, v: 0.141176 },
  { t: 31029 / 65535, v: 0.031373 },
  { t: 45607 / 65535, v: 0 },
  { t: 1, v: 0 },
];

const STAR_SIZE_KEYS: HermiteKey[] = [
  { t: 0, v: 0.755245, inSlope: 2.38315, outSlope: 2.38315 },
  { t: 0.127286, v: 1.0, inSlope: 0.061337, outSlope: 0.061337 },
  { t: 0.272332, v: 0.892134, inSlope: -0.927502, outSlope: -0.927502 },
  { t: 0.540943, v: 0.811183, inSlope: -0.114026, outSlope: -0.114026 },
  { t: 1, v: 0, inSlope: 0.036313, outSlope: 0.036313 },
];

const CLAMP_MAG_KEYS: HermiteKey[] = [
  { t: 0, v: 1, inSlope: -2.726415, outSlope: -2.726415 },
  { t: 1, v: 0, inSlope: 0, outSlope: 0 },
];

/** Hermite 样条插值，超出范围取首末值。 */
function evalHermite(keys: HermiteKey[], t: number): number {
  if (t <= keys[0].t) return keys[0].v;
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1].v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t < a.t || t > b.t) continue;
    const dt = b.t - a.t || 1;
    const u = (t - a.t) / dt;
    const u2 = u * u;
    const u3 = u2 * u;
    return (
      (2 * u3 - 3 * u2 + 1) * a.v +
      (u3 - 2 * u2 + u) * a.outSlope * dt +
      (-2 * u3 + 3 * u2) * b.v +
      (u3 - u2) * b.inSlope * dt
    );
  }
  return keys[keys.length - 1].v;
}

/** 线性关键帧分段插值，超出范围取首末值。 */
function evalKeys(keys: Keyframe[], t: number): number {
  if (t <= keys[0].t) return keys[0].v;
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1].v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const u = (t - a.t) / (b.t - a.t || 1);
      return a.v + (b.v - a.v) * u;
    }
  }
  return keys[keys.length - 1].v;
}

/** 确定性伪随机数生成，返回 0~1。 */
function hash01(seed: number): number {
  let x = (seed | 0) * 1664525 + 1013904223;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

// 转为 rgba 字符串，alpha 自动钳到 0~1
function rgba(color: Rgb, a: number): string {
  const aa = Math.max(0, Math.min(1, a));
  return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${aa})`;
}

/** 数值积分计算速度衰减下的粒子径向位移。 */
function clampedTravel(age: number, startSpeed: number, clampSpeed: number): number {
  if (age <= 0) return 0;
  const steps = Math.max(6, Math.ceil(age * 60));
  const dt = age / steps;
  let speed = startSpeed;
  let dist = 0;
  for (let i = 0; i < steps; i++) {
    const life = Math.min(1, ((i + 0.5) * dt) / LIFE);
    const maxSp = Math.max(0, evalHermite(CLAMP_MAG_KEYS, life) * clampSpeed);
    if (speed > maxSp) speed = maxSp;
    dist += speed * dt;
  }
  return dist;
}

/** Touch 命中特效渲染器，负责中心扩散光环与星点粒子群绘制。 */
export class TouchHitEffectRenderer extends BaseRenderer {
  // 星点贴图缓存（4 帧），backingScale 或颜色变化时失效
  private starSprites: HTMLCanvasElement[] | null = null;
  private starSpriteBasis = "";

  constructor(context: RenderContext) {
    super(context);
  }

  /**
   * 渲染当前时间窗口（500ms）内的 Touch 命中特效。
   * - touches 必须按 timingMs 升序排列（内部依赖二分查找筛选窗口）；
   * - 只处理普通 Touch，自动跳过 Touch Hold；同传感器有多个只播最新的；
   * - 使用 lighter 混合模式绘制，内部已通过 save/restore 隔离状态。
   */
  renderTouchHitEffects(
    touches: readonly (TouchNote | TouchHoldStartNote)[],
    currentTimeMs: number,
    color: Rgb = HIT_EFFECT_COLORS.perfect,
  ): void {
    if (!touches.length) return;

    const unitPx = this.context.radius / PANEL_RADIUS_UNITS;
    if (unitPx <= 0) return;

    const windowStart = currentTimeMs - LIFE * 1000;
    let lo = 0;
    let hi = touches.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (touches[mid].timingMs < windowStart) lo = mid + 1;
      else hi = mid;
    }

    const lastByPos = new Map<string, number>();
    for (let i = lo; i < touches.length; i++) {
      const n = touches[i];
      if (n.timingMs > currentTimeMs) break;
      // Touch Hold 不播放此特效，避免盖掉同传感器上的普通 Touch
      if (n.type === "touch-hold-start") continue;
      const key = String(n.position);
      const prev = lastByPos.get(key);
      if (prev === undefined || n.timingMs > prev) lastByPos.set(key, n.timingMs);
    }

    const ctx = this.context.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = lo; i < touches.length; i++) {
      const note = touches[i];
      if (note.timingMs > currentTimeMs) break;
      if (note.type === "touch-hold-start") continue;
      const latest = lastByPos.get(String(note.position));
      if (latest !== undefined && latest > note.timingMs) continue;

      const age = (currentTimeMs - note.timingMs) / 1000;
      if (age < 0 || age >= LIFE) continue;

      const origin = this.getTouchPosition(note.position as TouchPosition);
      let seed = Math.round(note.timingMs * 1000);
      for (let c = 0; c < note.position.length; c++) {
        seed = (seed ^ (note.position.charCodeAt(c) * (c + 1) * 73856093)) | 0;
      }

      this.drawCenterRing(ctx, origin.x, origin.y, age, unitPx, color);
      this.drawStarBurst(
        ctx,
        origin.x,
        origin.y,
        age,
        unitPx,
        color,
        seed,
        SMALL_COUNT,
        SMALL_SHAPE_R,
        SMALL_SIZE,
        0,
        0,
      );
      this.drawStarBurst(
        ctx,
        origin.x,
        origin.y,
        age,
        unitPx,
        color,
        seed ^ 0x85ebca77,
        ROUND_COUNT,
        ROUND_SHAPE_R,
        ROUND_SIZE,
        ROUND_START_SPEED,
        ROUND_CLAMP_SPEED,
      );
    }

    ctx.restore();
  }

  /** 绘制中心向外扩散的光环。 */
  private drawCenterRing(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    age: number,
    unitPx: number,
    color: Rgb,
  ): void {
    const life = age / LIFE;
    const sizeMul = Math.max(0, evalHermite(RING_SIZE_KEYS, life));
    let diameter = RING_START_SIZE * sizeMul;
    if (diameter > RING_MAX_SIZE) diameter = RING_MAX_SIZE;
    const radius = (diameter * unitPx) / 2;
    if (radius < 0.5) return;

    const alpha = evalKeys(RING_ALPHA_KEYS, life);
    if (alpha <= 0.01) return;

    const profile = TOUCH_RING_ALPHA_PROFILE;
    const last = profile.length - 1;
    const gradient = ctx.createRadialGradient(ox, oy, 0, ox, oy, radius);
    for (let i = 0; i <= last; i++) {
      gradient.addColorStop((i / last) * 0.96, rgba(color, profile[i] * alpha));
    }
    gradient.addColorStop(1, rgba(color, 0));

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(ox, oy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /** 绘制星点粒子群（原地缩放闪烁或带阻尼向外扩散）。 */
  private drawStarBurst(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    age: number,
    unitPx: number,
    color: Rgb,
    seedBase: number,
    count: number,
    shapeR: number,
    startSize: number,
    startSpeed: number,
    clampSpeed: number,
  ): void {
    const life = age / LIFE;
    const sizeMul = Math.max(0, evalHermite(STAR_SIZE_KEYS, life));
    if (sizeMul <= 0.02) return;

    const alpha = Math.min(1, sizeMul * 1.05);
    const travel =
      startSpeed > 0 && clampSpeed > 0 ? clampedTravel(age, startSpeed, clampSpeed) : 0;
    const sprites = this.getStarSprites(color);

    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < count; i++) {
      const h1 = hash01(seedBase + i * 4 + 1);
      const h2 = hash01(seedBase + i * 4 + 2);
      const h3 = hash01(seedBase + i * 4 + 3);
      const h4 = hash01(seedBase + i * 4 + 4);
      const angle = h1 * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const x = ox + (cos * shapeR + cos * travel) * unitPx;
      const y = oy + (sin * shapeR + sin * travel) * unitPx;

      const size = startSize * sizeMul * unitPx * (0.9 + 0.2 * h2);
      const outerR = size * 0.55;
      if (outerR < 0.5) continue;

      const frame = Math.min(3, Math.floor(h4 * 4)) as StarFrame;
      const destHalf = outerR * STAR_SPRITE_HALF_RATIO;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(h3 * Math.PI * 2);
      ctx.drawImage(sprites[frame], -destHalf, -destHalf, destHalf * 2, destHalf * 2);
      ctx.restore();
    }
    ctx.restore();
  }

  /** 获取或烘焙 4 帧星点贴图，backingScale 或颜色变化时重新生成。 */
  private getStarSprites(color: Rgb): HTMLCanvasElement[] {
    const cx = this.context.centerX;
    const backingScale = cx > 0 ? this.context.canvas.width / (cx * 2) : 1;
    const basis = `${backingScale}|${color.r}|${color.g}|${color.b}`;
    if (this.starSprites && this.starSpriteBasis === basis) return this.starSprites;

    const half = STAR_SPRITE_REF_OUTER_R * STAR_SPRITE_HALF_RATIO;
    const sizePx = Math.max(2, Math.ceil(half * 2 * Math.max(1, backingScale)));
    const sprites: HTMLCanvasElement[] = [];
    for (let frame = 0; frame < 4; frame++) {
      const sprite = document.createElement("canvas");
      sprite.width = sprite.height = sizePx;
      const sctx = sprite.getContext("2d")!;
      sctx.setTransform(
        Math.max(1, backingScale),
        0,
        0,
        Math.max(1, backingScale),
        sizePx / 2,
        sizePx / 2,
      );
      this.drawStarFrame(sctx, 0, 0, STAR_SPRITE_REF_OUTER_R, 0, color, 1, frame as StarFrame);
      sprites.push(sprite);
    }
    this.starSprites = sprites;
    this.starSpriteBasis = basis;
    return sprites;
  }

  /** 绘制单帧星点（0: 软心光晕、1: 宽实心、2: 窄实心、3: 双层描边）。 */
  private drawStarFrame(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    outerR: number,
    rotation: number,
    color: Rgb,
    alpha: number,
    frame: StarFrame,
  ): void {
    if (outerR < 0.4 || alpha <= 0) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    switch (frame) {
      case 0:
        this.fillStarGradient(ctx, outerR * 1.08, outerR * 0.23, color, alpha, true);
        break;
      case 1:
        this.fillStarGradient(ctx, outerR, outerR * 0.23, color, alpha, false);
        break;
      case 2:
        this.fillStarGradient(ctx, outerR * 0.94, outerR * 0.19, color, alpha * 0.94, false);
        break;
      case 3:
        this.strokeStar(ctx, outerR, outerR * 0.2, color, alpha);
        break;
    }

    ctx.restore();
  }

  /** 在星形裁剪区填充径向渐变（hollow 为 true 时中心微透做软心，false 为高亮白心）。 */
  private fillStarGradient(
    ctx: CanvasRenderingContext2D,
    tipR: number,
    waistR: number,
    color: Rgb,
    alpha: number,
    hollow: boolean,
  ): void {
    ctx.save();
    ctx.beginPath();
    this.pathSparkle(ctx, tipR, waistR);
    ctx.clip();

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, tipR);
    if (hollow) {
      gradient.addColorStop(0, rgba(color, alpha * 0.03));
      gradient.addColorStop(0.34, rgba(color, alpha * 0.14));
      gradient.addColorStop(0.72, rgba(color, alpha * 0.82));
      gradient.addColorStop(1, rgba(color, 0));
    } else {
      gradient.addColorStop(0, rgba({ r: 1, g: 1, b: 0.94 }, alpha * 0.95));
      gradient.addColorStop(0.35, rgba(color, alpha * 0.95));
      gradient.addColorStop(0.82, rgba(color, alpha * 0.72));
      gradient.addColorStop(1, rgba(color, 0));
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(-tipR, -tipR, tipR * 2, tipR * 2);
    ctx.restore();
  }

  /** 绘制外层发光 + 内层高亮边缘的双层描边星形。 */
  private strokeStar(
    ctx: CanvasRenderingContext2D,
    tipR: number,
    waistR: number,
    color: Rgb,
    alpha: number,
  ): void {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.beginPath();
    this.pathSparkle(ctx, tipR * 1.08, waistR * 1.08);
    ctx.strokeStyle = rgba(color, alpha * 0.22);
    ctx.lineWidth = Math.max(1, tipR * 0.13);
    ctx.stroke();

    ctx.beginPath();
    this.pathSparkle(ctx, tipR, waistR);
    ctx.strokeStyle = rgba({ r: 1, g: 1, b: 0.94 }, alpha * 0.88);
    ctx.lineWidth = Math.max(0.8, tipR * 0.055);
    ctx.stroke();
    ctx.restore();
  }

  /** 构建四角星路径（尖端在 90° 方向，两尖之间用内凹二次贝塞尔连接）。 */
  private pathSparkle(ctx: CanvasRenderingContext2D, tipR: number, waistR: number): void {
    for (let i = 0; i < 4; i++) {
      const aTip = (i * Math.PI) / 2 - Math.PI / 2;
      const aWaist = aTip + Math.PI / 4;
      const aNextTip = aTip + Math.PI / 2;
      const tx = Math.cos(aTip) * tipR;
      const ty = Math.sin(aTip) * tipR;
      const wx = Math.cos(aWaist) * waistR;
      const wy = Math.sin(aWaist) * waistR;
      const nextX = Math.cos(aNextTip) * tipR;
      const nextY = Math.sin(aNextTip) * tipR;
      if (i === 0) ctx.moveTo(tx, ty);
      else ctx.lineTo(tx, ty);
      ctx.quadraticCurveTo(wx, wy, nextX, nextY);
    }
    ctx.closePath();
  }
}

export default TouchHitEffectRenderer;
