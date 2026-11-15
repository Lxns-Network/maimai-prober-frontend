/**
 * Frame position of a sub-object animation clock after one application tick.
 *
 * A clock holds a current frame that advances by `step * rate * scale` per tick and wraps (looping) or
 * stops (clamping) at its upper bound. The display path of some families writes the current frame from
 * the manager's timeline position before each tick, which makes the frame after the tick a pure
 * function of that seed; a family that does not write it leaves the clock to accumulate ticks.
 */

const EPSILON_UPPER = 1.1920928955078125e-7;
const f32 = Math.fround;

/** The fixed parameters of one clock: its upper frame, loop flag and speed scalars. */
export interface MotionBinding {
  /** Last frame of the animation. */
  upper: number;
  loop: boolean;
  /** Speed scalar at the clock's rate slot; one when omitted. */
  rate?: number;
  /** Speed scalar at the clock's scale slot; one when omitted. */
  scale?: number;
}

export interface MotionTick {
  /** Application step in frames. */
  frameDelta: number;
  paused: boolean;
}

function normal(value: number, what: string): number {
  const result = f32(value);
  if (!Number.isFinite(result) || (result !== 0 && Math.abs(result) < 2 ** -126))
    throw new RangeError(`Unsupported ${what}`);
  return result;
}

function validate(binding: MotionBinding): {
  upper: number;
  loop: boolean;
  rate: number;
  scale: number;
} {
  const upper = normal(binding.upper, "motion upper bound");
  if (upper < 0) throw new RangeError("Negative motion upper bound is unsupported");
  return {
    upper,
    loop: binding.loop,
    rate: normal(binding.rate ?? 1, "motion rate"),
    scale: normal(binding.scale ?? 1, "motion scale"),
  };
}

/** The frame after one tick of `step` frames from `current`, for parameters that are already valid. */
export function advanceMotionFrame(
  current: number,
  binding: { upper: number; loop: boolean; rate: number; scale: number },
  step: number,
): number {
  const delta = f32(f32(step * binding.rate) * binding.scale);
  let next = f32(current + delta);
  if (!Number.isFinite(next)) throw new RangeError("Animation frame overflow");
  if (delta >= 0 && next >= binding.upper) {
    if (binding.loop && binding.upper > EPSILON_UPPER) next = f32(next % binding.upper);
    else next = binding.loop ? 0 : binding.upper;
  } else if (delta < 0 && next < 0) {
    if (binding.loop && binding.upper > EPSILON_UPPER)
      next = f32(f32(next % binding.upper) + binding.upper);
    else next = 0;
  }
  return next;
}

function stepOf(tick: MotionTick): number {
  if (typeof tick.paused !== "boolean")
    throw new TypeError("Explicit application pause gate required");
  return tick.paused ? 0 : normal(tick.frameDelta, "animation frame delta");
}

/** The clock's frame after one tick when its current frame was just written as `seed`. */
export function motionFrame(binding: MotionBinding, seed: number, tick: MotionTick): number {
  const fixed = validate(binding);
  const current = normal(seed, "animation seed");
  if (current < 0) throw new RangeError("Unsupported negative animation seed");
  return advanceMotionFrame(current, fixed, stepOf(tick));
}

/**
 * The clock's frame after `ticks` further ticks from `start`, with no frame written in between.
 * Each tick rounds to float32, so the sequence is applied tick by tick rather than multiplied out.
 */
export function motionAccumulate(
  binding: MotionBinding,
  start: number,
  ticks: number,
  tick: MotionTick,
): number {
  if (!Number.isSafeInteger(ticks) || ticks < 0) throw new RangeError("A tick count is required");
  const fixed = validate(binding);
  const step = stepOf(tick);
  let current = normal(start, "animation start");
  for (let n = 0; n < ticks; n++) current = advanceMotionFrame(current, fixed, step);
  return current;
}

/** A timeline position scaled in float32 into the value a family writes as its clock's current frame. */
export function motionSeed(timelineFrames: number, scale: number): number {
  return normal(
    f32(normal(timelineFrames, "timeline frame") * normal(scale, "seed scale")),
    "animation seed",
  );
}
