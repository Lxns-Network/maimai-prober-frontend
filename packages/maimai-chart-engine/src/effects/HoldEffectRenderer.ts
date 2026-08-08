import { BaseRenderer, RenderContext } from "../renderers/BaseRenderer";
import { ButtonPosition, HoldEndNote, HoldStartNote } from "../types";
import {
  FX_HY_00_910_ALPHA_PROFILE,
  HIT_EFFECT_COLORS,
  HOLD_RELEASE_EFFECT_DURATION_MS,
} from "./constants";

type Rgb = { r: number; g: number; b: number };

/**
 * 原作坐标系 / 粒子（FX_GAM_Notes_Hold_00）：
 * - NoteEnd.y = 480 → 判定圈半径
 * - Root localScale = 100
 * - startSize = 4 → 世界直径 400；maxParticleSize 钳 ~540
 * - lifetime=0.5、rateOverTime=10、maxParticles=6、loop+prewarm
 * - SizeOverLifetime：Hermite 0→1；ColorOL alpha 前亮后降
 * - Ripple 使用 FX_hy_00_246 的 alpha 剖面
 */
const JUDGE_RADIUS_UNITS = 480;
const ROOT_SCALE = 100;

const RIPPLE_LIFETIME = 0.5;
const RIPPLE_RATE = 10;
const RIPPLE_INTERVAL = 1 / RIPPLE_RATE;
const RIPPLE_START_SIZE = 4.0 * ROOT_SCALE;
const RIPPLE_MAX = 6;
const RIPPLE_MAX_SIZE_UNITS = 540;

const RELEASE_LIFETIME = HOLD_RELEASE_EFFECT_DURATION_MS / 1000;
const RELEASE_RING_START_SIZE = 2.75 * ROOT_SCALE;
const RELEASE_STAR_SHAPE_RADIUS = 0.5 * ROOT_SCALE;
const RELEASE_STAR_TEXTURE_ALPHA = 179 / 255;
const RELEASE_LONG_STAR_COUNT = 8;
const RELEASE_SHORT_STAR_COUNT = 4;
const RELEASE_LONG_STAR_LIFETIME = 0.5;
const RELEASE_SHORT_STAR_LIFETIME = 0.35;
const RELEASE_LONG_STAR_SPEED = 10 * ROOT_SCALE;
const RELEASE_SHORT_STAR_SPEED = 7 * ROOT_SCALE;
const RELEASE_STAR_CLAMP_SPEED = 5 * ROOT_SCALE;
const RELEASE_LONG_STAR_SIZE = 0.4 * ROOT_SCALE;
const RELEASE_SHORT_STAR_SIZE = 0.5 * ROOT_SCALE;

type HermiteKey = { t: number; v: number; inSlope: number; outSlope: number };
type Keyframe = { t: number; v: number };

const RIPPLE_SIZE_KEYS: HermiteKey[] = [
  { t: 0, v: 0, inSlope: 10.027830123901367, outSlope: 10.027830123901367 },
  {
    t: 0.07348871231079102,
    v: 0.4822232723236084,
    inSlope: 2.938042640686035,
    outSlope: 2.938042640686035,
  },
  {
    t: 0.3209002912044525,
    v: 0.8345766663551331,
    inSlope: 0.592962384223938,
    outSlope: 0.592962384223938,
  },
  { t: 1, v: 1, inSlope: 0.18053370714187622, outSlope: 0.18053370714187622 },
];

/** ColorOverLifetime alpha（numAlphaKeys=5） */
const RIPPLE_ALPHA_KEYS: Keyframe[] = [
  { t: 0, v: 1 },
  { t: 5484 / 65535, v: 1 },
  { t: 18591 / 65535, v: 0.1411764770746231 },
  { t: 31029 / 65535, v: 0.0313725508749485 },
  { t: 45607 / 65535, v: 0 },
  { t: 1, v: 0 },
];

const RELEASE_STAR_CLAMP_KEYS: HermiteKey[] = [
  { t: 0, v: 1, inSlope: -2.7264153957366943, outSlope: -2.7264153957366943 },
  {
    t: 0.10047288239002228,
    v: 0.49497726559638977,
    inSlope: -0.46866413950920105,
    outSlope: -0.46866413950920105,
  },
  { t: 1, v: 0, inSlope: -0.05054986849427223, outSlope: -0.05054986849427223 },
];

const RELEASE_LONG_STAR_SIZE_X_KEYS: HermiteKey[] = [
  { t: 0, v: 1, inSlope: -0.04875295236706734, outSlope: -0.04875295236706734 },
  {
    t: 0.03391849994659424,
    v: 1,
    inSlope: 0.010132789611816406,
    outSlope: 0.010132789611816406,
  },
  { t: 0.10687255859375, v: 0.06103515625, inSlope: 0, outSlope: 0 },
  { t: 0.1653928905725479, v: 0.06572770327329636, inSlope: 0, outSlope: 0 },
  {
    t: 0.3933370113372803,
    v: 0.49059924483299255,
    inSlope: 2.9792487621307373,
    outSlope: 2.9792487621307373,
  },
  { t: 0.6995236873626709, v: 1, inSlope: 0.06318092346191406, outSlope: 0.06318092346191406 },
  { t: 1, v: 0.48826026916503906, inSlope: -3.3211684226989746, outSlope: -3.3211684226989746 },
];

const RELEASE_LONG_STAR_SIZE_Y_KEYS: HermiteKey[] = [
  { t: 0, v: 1, inSlope: 0, outSlope: 0 },
  { t: 0.10687023401260376, v: 1, inSlope: 0, outSlope: 0 },
  { t: 0.226470947265625, v: 0.04225349426269531, inSlope: 0, outSlope: 0 },
  {
    t: 0.3752440810203552,
    v: 0.17753443121910095,
    inSlope: 1.2216746807098389,
    outSlope: 1.2216746807098389,
  },
  {
    t: 0.6765530705451965,
    v: 0.34632575511932373,
    inSlope: -0.041425228118896484,
    outSlope: -0.041425228118896484,
  },
  { t: 1, v: 0.13145136833190918, inSlope: -1.4440028667449951, outSlope: -1.4440028667449951 },
];

const RELEASE_SHORT_STAR_SIZE_KEYS: HermiteKey[] = [
  { t: 0, v: 1, inSlope: -0.04875295236706734, outSlope: -0.04875295236706734 },
  { t: 0.09244358539581299, v: 1, inSlope: 0.010132789611816406, outSlope: 0.010132789611816406 },
  {
    t: 0.3243747651576996,
    v: 0.610629677772522,
    inSlope: -2.567172050476074,
    outSlope: -2.567172050476074,
  },
  { t: 1, v: 0, inSlope: 0, outSlope: 0 },
];

const RELEASE_LONG_STAR_ALPHA_KEYS: Keyframe[] = [
  { t: 0, v: 1 },
  { t: 24525 / 65535, v: 1 },
  { t: 30958 / 65535, v: 0.04313725605607033 },
  { t: 38463 / 65535, v: 0.7588781714439392 },
  { t: 46102 / 65535, v: 0.25882354378700256 },
  { t: 53607 / 65535, v: 0.49791646003723145 },
  { t: 1, v: 0 },
];

const RELEASE_SHORT_STAR_ALPHA_KEYS: Keyframe[] = [
  { t: 0, v: 1 },
  { t: 25732 / 65535, v: 1 },
  { t: 1, v: 0.03679293394088745 },
];

/** FX_hy_00_246 从中心到边缘的 alpha 剖面。 */
const RIPPLE_PROFILE = [
  0, 0.0353, 0.098, 0.1647, 0.2471, 0.3216, 0.4039, 0.498, 0.5922, 0.6863, 0.7686, 0.8314, 0.8863,
  0.9333, 0.9765, 1, 1, 0.6039, 0.5412, 0.502, 0.4431, 0.4, 0.3569, 0.3098, 0.2706, 0.2235, 0.1922,
  0.149, 0.1137, 0.0863, 0.0549, 0.0235, 0,
] as const;

const ALPHA_EPS = 0.02;

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
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    // 左键 outSlope、右键 inSlope（Unity AnimationCurve）
    return h00 * a.v + h10 * a.outSlope * dt + h01 * b.v + h11 * b.inSlope * dt;
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
  if (profile.length === 0) return 0;
  const clamped = Math.max(0, Math.min(1, t));
  const position = clamped * (profile.length - 1);
  const index = Math.min(profile.length - 2, Math.floor(position));
  const fraction = position - index;
  return profile[index] + (profile[index + 1] - profile[index]) * fraction;
}

function rgba(color: Rgb, a: number): string {
  const aa = Math.max(0, Math.min(1, a));
  return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${aa})`;
}

function hash01(seed: number): number {
  let x = (seed | 0) * 1664525 + 1013904223;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

function clampedTravel(
  ageSec: number,
  lifetimeSec: number,
  startSpeed: number,
  clampSpeed: number,
): number {
  if (ageSec <= 0) return 0;

  const steps = Math.max(8, Math.ceil(ageSec * 60));
  const dt = ageSec / steps;
  let speed = startSpeed;
  let distance = 0;
  for (let i = 0; i < steps; i++) {
    const life = Math.min(1, ((i + 0.5) * dt) / lifetimeSec);
    const maxSpeed = Math.max(0, evalHermite(RELEASE_STAR_CLAMP_KEYS, life) * clampSpeed);
    if (speed > maxSpeed) speed = maxSpeed;
    distance += speed * dt;
  }
  return distance;
}

type Wave = {
  particleRadius: number;
  alpha: number;
};

/**
 * SDGB Hold 按压：FX_GAM_Notes_Hold_00 Ripple 同心波纹。
 * 纯 Canvas；发射周期、尺寸与透明度按原 ParticleSystem 参数复现。
 */
export class HoldEffectRenderer extends BaseRenderer {
  constructor(context: RenderContext) {
    super(context);
  }

  /**
   * 按钮 hold 持续按压特效（InitializeHold）。
   * holdEndMap key 与 MainRenderer.getHoldEndKey 一致。
   */
  renderHoldPressEffects(
    holds: readonly HoldStartNote[],
    holdEndMap: ReadonlyMap<string, HoldEndNote>,
    currentTimeMs: number,
    getHoldEndKey: (position: ButtonPosition, holdStartTiming: number) => string,
    color: Rgb = HIT_EFFECT_COLORS.perfect,
  ): void {
    if (!holds.length) return;

    for (let i = 0; i < holds.length; i++) {
      const hold = holds[i];
      const holdEnd = holdEndMap.get(getHoldEndKey(hold.position, hold.timing));
      if (!holdEnd) continue;
      if (currentTimeMs < hold.timingMs || currentTimeMs >= holdEnd.timingMs) continue;

      const origin = this.getButtonPosition(hold.position);
      this.renderPressRippleAt(
        origin.x,
        origin.y,
        hold.timingMs,
        holdEnd.timingMs,
        currentTimeMs,
        color,
      );
    }
  }

  /**
   * 按钮 hold 尾部释放特效（FinishHold）。窗口为 hold 结束后的最长粒子生命周期。
   */
  renderHoldReleaseEffects(
    holds: readonly HoldStartNote[],
    holdEndMap: ReadonlyMap<string, HoldEndNote>,
    currentTimeMs: number,
    getHoldEndKey: (position: ButtonPosition, holdStartTiming: number) => string,
    color: Rgb = HIT_EFFECT_COLORS.perfect,
  ): void {
    if (!holds.length) return;

    for (let i = 0; i < holds.length; i++) {
      const hold = holds[i];
      const holdEnd = holdEndMap.get(getHoldEndKey(hold.position, hold.timing));
      if (!holdEnd) continue;

      const endMs = holdEnd.timingMs;
      if (currentTimeMs < endMs || currentTimeMs >= endMs + HOLD_RELEASE_EFFECT_DURATION_MS) {
        continue;
      }

      const origin = this.getButtonPosition(hold.position);
      this.renderHoldReleaseAt(origin.x, origin.y, endMs, currentTimeMs, color);
    }
  }

  /**
   * 任意判定点上的 hold 持续按压波纹（按钮 hold / touch-hold 共用）。
   * 窗口为 [startMs, endMs)。
   */
  renderPressRippleAt(
    x: number,
    y: number,
    startMs: number,
    endMs: number,
    currentTimeMs: number,
    color: Rgb = HIT_EFFECT_COLORS.perfect,
  ): void {
    if (currentTimeMs < startMs || currentTimeMs >= endMs) return;

    const unitPx = this.context.radius / JUDGE_RADIUS_UNITS;
    if (unitPx <= 0) return;

    const ctx = this.context.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const elapsedSec = (currentTimeMs - startMs) / 1000;
    this.drawRipples(ctx, x, y, elapsedSec, unitPx, color);
    ctx.restore();
  }

  /**
   * FinishHold → FX_GAM_Notes_Hold_Release_00 的 Ring 和两组星粒子。
   * 纯 Canvas 重建；窗口 [endMs, endMs + 0.5s)。
   */
  renderHoldReleaseAt(
    x: number,
    y: number,
    endMs: number,
    currentTimeMs: number,
    color: Rgb = HIT_EFFECT_COLORS.perfect,
  ): void {
    const ageSec = (currentTimeMs - endMs) / 1000;
    if (ageSec < 0 || ageSec >= RELEASE_LIFETIME) return;

    const unitPx = this.context.radius / JUDGE_RADIUS_UNITS;
    if (unitPx <= 0) return;

    const ctx = this.context.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    this.drawReleaseRing(ctx, x, y, ageSec, unitPx, color);
    const seed = Math.round(endMs * 1000);
    this.drawReleaseStars(
      ctx,
      x,
      y,
      ageSec,
      unitPx,
      color,
      seed,
      RELEASE_LONG_STAR_COUNT,
      RELEASE_LONG_STAR_LIFETIME,
      RELEASE_LONG_STAR_SPEED,
      RELEASE_LONG_STAR_SIZE,
      RELEASE_LONG_STAR_SIZE_X_KEYS,
      RELEASE_LONG_STAR_SIZE_Y_KEYS,
      RELEASE_LONG_STAR_ALPHA_KEYS,
    );
    this.drawReleaseStars(
      ctx,
      x,
      y,
      ageSec,
      unitPx,
      color,
      seed ^ 0x85ebca77,
      RELEASE_SHORT_STAR_COUNT,
      RELEASE_SHORT_STAR_LIFETIME,
      RELEASE_SHORT_STAR_SPEED,
      RELEASE_SHORT_STAR_SIZE,
      RELEASE_SHORT_STAR_SIZE_KEYS,
      RELEASE_SHORT_STAR_SIZE_KEYS,
      RELEASE_SHORT_STAR_ALPHA_KEYS,
    );
    ctx.restore();
  }

  private drawReleaseRing(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    ageSec: number,
    unitPx: number,
    color: Rgb,
  ): void {
    const life = ageSec / RELEASE_LIFETIME;
    const sizeMul = Math.max(0, evalHermite(RIPPLE_SIZE_KEYS, life));
    const radius = (RELEASE_RING_START_SIZE * sizeMul * unitPx) / 2;
    const alpha = evalKeys(RIPPLE_ALPHA_KEYS, life);
    if (radius < 0.5 || alpha <= ALPHA_EPS) return;

    const rings = 48;
    for (let i = 0; i < rings; i++) {
      const t0 = (0.96 * i) / rings;
      const t1 = (0.96 * (i + 1)) / rings;
      const profile = sampleProfile(FX_HY_00_910_ALPHA_PROFILE, (t0 + t1) / 2);
      const ringAlpha = profile * alpha;
      if (ringAlpha <= ALPHA_EPS) continue;

      const outer = Math.max(0.2, t1 * radius);
      const inner = t0 * radius;
      ctx.beginPath();
      ctx.arc(ox, oy, outer, 0, Math.PI * 2);
      if (inner > 0.15) ctx.arc(ox, oy, inner, 0, Math.PI * 2, true);
      ctx.fillStyle = rgba(color, ringAlpha);
      ctx.fill("evenodd");
    }
  }

  private drawReleaseStars(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    ageSec: number,
    unitPx: number,
    color: Rgb,
    seedBase: number,
    count: number,
    lifetimeSec: number,
    startSpeed: number,
    startSize: number,
    sizeXKeys: HermiteKey[],
    sizeYKeys: HermiteKey[],
    alphaKeys: Keyframe[],
  ): void {
    if (ageSec < 0 || ageSec >= lifetimeSec) return;

    const life = ageSec / lifetimeSec;
    const alpha = evalKeys(alphaKeys, life) * RELEASE_STAR_TEXTURE_ALPHA;
    if (alpha <= ALPHA_EPS) return;

    const travel = clampedTravel(ageSec, lifetimeSec, startSpeed, RELEASE_STAR_CLAMP_SPEED);
    const spawnRadius = RELEASE_STAR_SHAPE_RADIUS * unitPx;
    const baseSize = startSize * unitPx * 0.5;

    for (let i = 0; i < count; i++) {
      const seed = seedBase + i * 4;
      const angle = (i / count) * Math.PI * 2 + (hash01(seed) - 0.5) * 0.16;
      const directionX = Math.cos(angle);
      const directionY = Math.sin(angle);
      const distance = spawnRadius + travel * unitPx;
      const px = ox + directionX * distance;
      const py = oy + directionY * distance;
      const scaleX = Math.max(0, evalHermite(sizeXKeys, life));
      const scaleY = Math.max(0, evalHermite(sizeYKeys, life));
      if (scaleX <= 0.01 || scaleY <= 0.01) continue;

      const rotation = hash01(seed + 1) * Math.PI * 2 + (hash01(seed + 2) - 0.5) * ageSec * 8;
      this.drawReleaseStar(
        ctx,
        px,
        py,
        baseSize * scaleX,
        baseSize * scaleY,
        rotation,
        color,
        alpha,
      );
    }
  }

  private drawReleaseStar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    color: Rgb,
    alpha: number,
  ): void {
    const radius = Math.max(radiusX, radiusY);
    if (radius < 0.5) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(radiusX / radius, radiusY / radius);
    ctx.shadowColor = rgba(color, alpha * 0.55);
    ctx.shadowBlur = radius * 0.2;

    const fill = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    fill.addColorStop(0, rgba({ r: 1, g: 1, b: 1 }, alpha * 0.9));
    fill.addColorStop(0.38, rgba(color, alpha * 0.9));
    fill.addColorStop(0.82, rgba(color, alpha * 0.58));
    fill.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = fill;
    ctx.beginPath();
    this.pathReleaseStar(ctx, radius, radius * 0.42);
    ctx.fill();
    ctx.restore();
  }

  private pathReleaseStar(
    ctx: CanvasRenderingContext2D,
    outerRadius: number,
    innerRadius: number,
  ): void {
    const start = -Math.PI / 2;
    ctx.moveTo(Math.cos(start) * outerRadius, Math.sin(start) * outerRadius);
    for (let i = 0; i < 5; i++) {
      const inner = start + ((i * 2 + 1) * Math.PI) / 5;
      const outer = start + ((i + 1) * 2 * Math.PI) / 5;
      ctx.lineTo(Math.cos(inner) * innerRadius, Math.sin(inner) * innerRadius);
      ctx.lineTo(Math.cos(outer) * outerRadius, Math.sin(outer) * outerRadius);
    }
    ctx.closePath();
  }

  private drawRipples(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    elapsedSec: number,
    unitPx: number,
    color: Rgb,
  ): void {
    /**
     * loop+prewarm：发射时刻为 n*interval（n 可为负），在 elapsed 时刻
     * age = elapsed - n*interval ∈ [0, lifetime)。
     * 不可跳过 n<0，否则按压开头会丢已 prewarm 的外圈。
     */
    const firstN = Math.ceil((elapsedSec - RIPPLE_LIFETIME) / RIPPLE_INTERVAL - 1e-9);
    const lastN = Math.floor(elapsedSec / RIPPLE_INTERVAL + 1e-9);

    const waves: Wave[] = [];

    for (let n = firstN; n <= lastN; n++) {
      const age = elapsedSec - n * RIPPLE_INTERVAL;
      if (age < 0 || age >= RIPPLE_LIFETIME) continue;

      const life = age / RIPPLE_LIFETIME;
      const sizeMul = Math.max(0, evalHermite(RIPPLE_SIZE_KEYS, life));
      let diameterUnits = RIPPLE_START_SIZE * sizeMul;
      if (diameterUnits > RIPPLE_MAX_SIZE_UNITS) diameterUnits = RIPPLE_MAX_SIZE_UNITS;

      const particleRadius = (diameterUnits * unitPx) / 2;
      if (particleRadius < 0.75) continue;

      const alpha = evalKeys(RIPPLE_ALPHA_KEYS, life);
      if (alpha <= ALPHA_EPS) continue;

      waves.push({ particleRadius, alpha });
    }

    // maxParticles=6：保留最新（年龄更小 / 后 push 的）
    if (waves.length > RIPPLE_MAX) {
      waves.splice(0, waves.length - RIPPLE_MAX);
    }

    // 大圈先画
    waves.sort((a, b) => b.particleRadius - a.particleRadius);

    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      this.drawRippleParticle(ctx, ox, oy, w.particleRadius, color, w.alpha);
    }
  }

  /** 用单个径向渐变近似原 Ripple 贴图，不拆成多层几何描边。 */
  private drawRippleParticle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: Rgb,
    alpha: number,
  ): void {
    if (radius < 0.25 || alpha <= ALPHA_EPS) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(radius, radius);

    const texture = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (let i = 0; i < RIPPLE_PROFILE.length; i++) {
      texture.addColorStop(i / (RIPPLE_PROFILE.length - 1), rgba(color, RIPPLE_PROFILE[i] * alpha));
    }

    ctx.fillStyle = texture;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export default HoldEffectRenderer;
