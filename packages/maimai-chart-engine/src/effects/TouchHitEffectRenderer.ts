import { BaseRenderer, RenderContext } from "../renderers/BaseRenderer";
import { TouchHoldStartNote, TouchNote, TouchPosition } from "../types";
import { FX_HY_00_910_ALPHA_PROFILE, HIT_EFFECT_COLORS } from "./constants";

type Rgb = { r: number; g: number; b: number };
type StarFrame = 0 | 1 | 2 | 3;

/**
 * SDGB InitializeCenter → FX_GAM_Notes_Touch_00
 *
 * Root localScale = 70。
 * 组成（按 SDGB prefab/resource）：
 * - Ring：FX_hy_00_910 的径向 alpha 剖面，startSize 2.5，life 0.5
 * - Star_Small×2：各 maxP4，圆周 r=0.5 出生，speed=0
 * - Star_Round×2：各 maxP4，圆周 r=0.6 出生，短距外飞
 * - 星点：FX_hy_18_050 的四种 alpha 形态，用 Canvas 路径按粒子稳定随机选择。
 */
const JUDGE_RADIUS_UNITS = 480;
const ROOT_SCALE = 70;
const LIFE = 0.5;

// Ring：startSize 2.5 → 直径
const RING_START_SIZE = 2.5 * ROOT_SCALE;
const RING_MAX_SIZE = 540;

// Small stars（2×maxP4 → 8）
const SMALL_COUNT = 8;
const SMALL_SHAPE_R = 0.5 * ROOT_SCALE;
const SMALL_SIZE = 0.3 * ROOT_SCALE;

// Round stars
const ROUND_COUNT = 8;
const ROUND_SHAPE_R = 0.6 * ROOT_SCALE;
const ROUND_SIZE = 0.6 * ROOT_SCALE;
const ROUND_START_SPEED = 10 * ROOT_SCALE;
const ROUND_CLAMP_SPEED = 2.0 * ROOT_SCALE;

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

function sampleProfile(profile: readonly number[], t: number): number {
  if (t <= 0) return profile[0];
  if (t >= 1) return profile[profile.length - 1];
  const x = t * (profile.length - 1);
  const i = Math.floor(x);
  const u = x - i;
  return profile[i] + (profile[Math.min(i + 1, profile.length - 1)] - profile[i]) * u;
}

function hash01(seed: number): number {
  let x = (seed | 0) * 1664525 + 1013904223;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

function rgba(color: Rgb, a: number): string {
  const aa = Math.max(0, Math.min(1, a));
  return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${aa})`;
}

/** Round 星：speed 起步 10，立即被 clamp 到 ROUND_CLAMP_SPEED * curve(life) */
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

/**
 * Touch 命中特效（InitializeCenter）。
 * 径向 Ring + 四路星点粒子，保持与 AC 的粒子数量、半径、生命周期和速度曲线一致。
 */
export class TouchHitEffectRenderer extends BaseRenderer {
  constructor(context: RenderContext) {
    super(context);
  }

  /**
   * 仅普通 touch（非 hold）。窗口 [timing, timing+0.5s)。
   * getTouchPosition 与 TouchRenderer 共用 sensor 坐标。
   */
  renderTouchHitEffects(
    touches: readonly (TouchNote | TouchHoldStartNote)[],
    currentTimeMs: number,
    getTouchPosition: (position: TouchPosition) => { x: number; y: number },
    color: Rgb = HIT_EFFECT_COLORS.perfect,
  ): void {
    if (!touches.length) return;

    const unitPx = this.context.radius / JUDGE_RADIUS_UNITS;
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

      const origin = getTouchPosition(note.position as TouchPosition);
      let seed = Math.round(note.timingMs * 1000);
      for (let c = 0; c < note.position.length; c++) {
        seed = (seed ^ (note.position.charCodeAt(c) * (c + 1) * 73856093)) | 0;
      }

      // Ring 在粒子层最底，星点叠在 Ring 上方。
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

  /**
   * Ring 粒子：按 FX_hy_00_910 的径向 alpha 剖面绘制扩张软环。
   * 该贴图不是纯描边，也不是中心径向渐变；外圈有一次明显的亮峰。
   */
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

    const rings = 48;
    for (let i = 0; i < rings; i++) {
      const t0 = (0.96 * i) / rings;
      const t1 = (0.96 * (i + 1)) / rings;
      const p = sampleProfile(FX_HY_00_910_ALPHA_PROFILE, (t0 + t1) / 2);
      const ringAlpha = p * alpha;
      if (ringAlpha <= 0.01) continue;

      const outer = Math.max(0.2, t1 * radius);
      const inner = t0 * radius;
      ctx.beginPath();
      ctx.arc(ox, oy, outer, 0, Math.PI * 2);
      if (inner > 0.15) ctx.arc(ox, oy, inner, 0, Math.PI * 2, true);
      ctx.fillStyle = rgba(color, ringAlpha);
      ctx.fill("evenodd");
    }
  }

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

      // FX_hy_18_050 是 4 列形态表；用稳定随机列复现粒子各自的形态。
      const frame = Math.min(3, Math.floor(h4 * 4)) as StarFrame;
      this.drawStarFrame(ctx, x, y, outerR, h3 * Math.PI * 2, color, alpha, frame);
    }
  }

  /**
   * FX_hy_18_050 的四列透明形态的 Canvas 重建：软心、宽实心、窄实心、描边。
   * 只绘制路径和渐变，不依赖运行时图片资源。
   */
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

  /**
   * 软心/实心列：中心到尖端的 alpha 变化沿用贴图的透明度层次。
   */
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

  /** 描边列：细亮边沿加一层低 alpha 光晕。 */
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

  /** 四尖星路径：尖在 0/90/180/270，腰在相邻尖之间的圆滑内凹弧线上。 */
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
