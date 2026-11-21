import type { KeyBeamFrame } from "../chart/play/keyBeams";
import { EFFECT_DEPTH } from "../chart/sweep/effects";
import { lanePosition } from "../notes/space";
import type { EffectResource } from "./afb";
import {
  createEffectInstance,
  createEffectPlayer,
  stepInstance,
  type EffectCamera,
} from "./instance";
import { effectPlayerLayer } from "./players";
import { createEffectPublisher } from "./publish";
import type { EffectPacket } from "./render";

// The child appears on step 1 and its three-frame fade ends six half-frame steps later.
const HELD_STEP = 7;

/** Samples the authored ground beam without replaying note effects when a contact changes. */
export function createKeyBeamDraws(resource: EffectResource) {
  const player = createEffectPlayer(resource, { layerParameter: effectPlayerLayer(resource.id) });
  const publisher = createEffectPublisher({ maximumParticles: 0 });
  const samples = new Map<number, readonly (EffectPacket | undefined)[]>();
  const packets: EffectPacket[] = [];

  function sampleLane(lane: number, display: number, camera: EffectCamera) {
    const key = lane * 4 + display;
    let frames = samples.get(key);
    if (!frames) {
      const instance = createEffectInstance(player, {
        instanceId: key + 1,
        animation: 100,
        displayState: display,
        position: [lanePosition(lane, 1), 0, EFFECT_DEPTH],
        scale: [1, 1, 1],
        mirror: false,
      });
      const streams = { low: 1, high: 0, crt: 1 };
      frames = Array.from({ length: HELD_STEP + 1 }, () => {
        const index = publisher.packets.length;
        stepInstance(instance, streams, 0.5, camera, publisher.sink);
        return publisher.packets[index];
      });
      samples.set(key, frames);
    }
    return frames;
  }

  return (
    notes: readonly EffectPacket[],
    beams: KeyBeamFrame,
    step: number,
    animationStep: (chartStep: number) => number,
    camera: EffectCamera,
  ): readonly EffectPacket[] => {
    packets.length = 0;
    for (let bits = beams.active; bits; bits &= bits - 1) {
      const lane = 31 - Math.clz32(bits & -bits);
      const age = step - Math.ceil(animationStep(beams.started[lane]));
      if (age < 1) continue;
      const packet = sampleLane(lane, beams.display[lane], camera)[Math.min(age, HELD_STEP)];
      if (packet) packets.push(packet);
    }
    packets.push(...notes);
    return packets;
  };
}
