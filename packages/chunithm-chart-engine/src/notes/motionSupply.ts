/**
 * Animation frames for the note models whose materials carry a clock-driven UV binding.
 *
 * A bound model's clock restarts from a timeline-derived seed every frame, so the frame it reaches
 * after the application tick is a pure function of the timeline position and the model's own binding;
 * no history is kept. A model whose binding names no clock is left to the shared frame, which only
 * the shared-frame model sets may use. A clock-bound model in the recorded sets is animated but has no
 * seed: its frames come only from the recorded motion rows, and the resolver leaves it undefined.
 */

import type { Pack } from "../assets/packFormat";
import { motionFrame, motionSeed, type MotionBinding, type MotionTick } from "./motionClock";

/** Seed scale applied to the timeline frame for down-direction AIR models. */
const DOWN_ANIMATION_SCALE = 0.4000000059604645;

/** Seed scale per model-set id range; a bound model outside every range has no known clock rule. */
const SEED_SCALES: readonly { from: number; to: number; scale: number }[] = Object.freeze([
  { from: 146, to: 177, scale: 1 },
  { from: 178, to: 209, scale: DOWN_ANIMATION_SCALE },
  { from: 210, to: 225, scale: 1 },
  { from: 342, to: 373, scale: 1 },
]);

/** Model sets whose clock-bound frames come only from the recorded motion rows; they have no seed rule. */
const RECORDED_CLOCKS = Object.freeze({ from: 130, to: 145 });

/** Model sets whose bindings name no clock and take the shared frame, and that frame's resource length. */
const SHARED_FRAME = Object.freeze({ from: 82, to: 97, frameCount: 51 });

const MODEL_NAME = /^note\/model\/(\d+)(~\d+)?$/;

interface ModelClock {
  readonly binding: MotionBinding;
  readonly scale: number;
  stamp: number;
  frame: number;
}

export interface MotionSupply {
  /** Whether a model entry carries a clock-driven animation. */
  animated(model: string): boolean;
  /**
   * Fixes the manager's absolute timeline frame for the step about to be drawn and returns the
   * resolver for it: a model entry name to its frame, or undefined when it has no clock binding.
   * The returned function is valid until the next call.
   */
  at(timelineFrames: number, tick: MotionTick): (model: string) => number | undefined;
}

const recordedClockOf = (id: number) => id >= RECORDED_CLOCKS.from && id <= RECORDED_CLOCKS.to;

function seedScaleOf(id: number): number | null {
  for (const range of SEED_SCALES) if (id >= range.from && id <= range.to) return range.scale;
  return null;
}

/**
 * Reads the clock bindings out of the pack's model entries.
 *
 * @throws RangeError when a bound model has no seed rule, a resource that is missing or has no frame
 * count, a binding that does not loop, or materials that bind more than one resource; and when a
 * model outside the shared-frame sets, or with a resource of another length, binds no clock.
 */
export function createMotionSupply(
  pack: Pack,
  options: { requiredModels?: Iterable<string> } = {},
): MotionSupply {
  const clocks = new Map<string, ModelClock>();
  /** Clock-bound models whose frames only the recording supplies. */
  const recorded = new Set<string>();
  for (const [name, entry] of pack.entries) {
    const match = MODEL_NAME.exec(name);
    if (!match) continue;
    const materials = (entry.meta as { materials?: unknown }).materials;
    if (!Array.isArray(materials)) continue;
    let resource: string | null = null;
    const shared: unknown[] = [];
    for (const material of materials) {
      const binding = (material as { uvAnimation?: { resource?: unknown; loop?: unknown } })
        .uvAnimation;
      if (!binding) continue;
      if (binding.loop === undefined) {
        shared.push(binding.resource);
        continue;
      }
      if (typeof binding.resource !== "string")
        throw new RangeError(`Model ${name} binds a clock to no resource`);
      if (binding.loop !== true) throw new RangeError(`Model ${name} has a non-loop clock`);
      if (resource !== null && resource !== binding.resource)
        throw new RangeError(`Model ${name} binds more than one resource to its clock`);
      resource = binding.resource;
    }
    const id = Number(match[1]);
    if (shared.length) {
      if (resource !== null)
        throw new RangeError(`Model ${name} mixes clock-bound and shared-frame materials`);
      if (id < SHARED_FRAME.from || id > SHARED_FRAME.to)
        throw new RangeError(
          `Animated model ${id} binds no clock and the shared frame is not its own`,
        );
      for (const used of shared) {
        const meta = typeof used === "string" ? pack.entries.get(used)?.meta : undefined;
        if (!meta) throw new RangeError(`Pack has no resource ${String(used)} for model ${id}`);
        if ((meta as { frameCount?: unknown }).frameCount !== SHARED_FRAME.frameCount)
          throw new RangeError(
            `Resource ${used} has a frame count the shared frame does not cover`,
          );
      }
      continue;
    }
    if (resource === null) continue;
    const scale = seedScaleOf(id);
    if (scale === null && !recordedClockOf(id))
      throw new RangeError(`Clock-bound model ${id} has no seed rule`);
    const frameCount = (pack.entries.get(resource)?.meta as { frameCount?: unknown } | undefined)
      ?.frameCount;
    if (!pack.entries.has(resource))
      throw new RangeError(`Pack has no resource ${resource} for ${name}`);
    if (typeof frameCount !== "number" || !Number.isInteger(frameCount) || frameCount < 1)
      throw new RangeError(`Resource ${resource} has no frame count`);
    if (scale === null) {
      recorded.add(name);
      continue;
    }
    clocks.set(name, {
      binding: { upper: frameCount - 1, loop: true },
      scale,
      stamp: -1,
      frame: 0,
    });
  }

  for (const name of options.requiredModels ?? []) {
    const match = MODEL_NAME.exec(name);
    if (!match) continue;
    const id = Number(match[1]);
    if (
      (seedScaleOf(id) !== null && !clocks.has(name)) ||
      (recordedClockOf(id) && !recorded.has(name))
    )
      throw new RangeError(`Model ${name} is missing its animation clock binding`);
  }

  let stamp = 0;
  let absolute = 0;
  let tick: MotionTick = { frameDelta: 0, paused: true };
  const frameOf = (model: string): number | undefined => {
    const clock = clocks.get(model);
    if (!clock) return undefined;
    if (clock.stamp !== stamp) {
      clock.frame = motionFrame(clock.binding, motionSeed(absolute, clock.scale), tick);
      clock.stamp = stamp;
    }
    return clock.frame;
  };
  return {
    animated: (model) => clocks.has(model) || recorded.has(model),
    at(timelineFrames, nextTick) {
      absolute = timelineFrames;
      tick = nextTick;
      stamp++;
      return frameOf;
    },
  };
}
