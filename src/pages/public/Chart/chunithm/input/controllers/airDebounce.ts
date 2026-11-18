import {
  AIR_BEAM_COUNT,
  type SurfaceSample,
} from "@lxns-network/chunithm-chart-engine/chart/play/input";
import type { ControllerInput } from "./adapter";

const AIR_GAP_MS = 20;
const AIR_CHATTER_MS = 100;

/**
 * A stationary hand can make an AIR beam flicker. After 100 ms of rapid edges, bridge gaps
 * shorter than 20 ms. Normal edges and ground changes pass through immediately. If reports
 * stop during a gap, the release is delivered when its timer runs.
 */
export function createAirDebounce(signal: AbortSignal, onInput: ControllerInput): ControllerInput {
  const channels = Array.from({ length: AIR_BEAM_COUNT }, () => ({
    active: false,
    lastEdge: -Infinity,
    started: 0,
    chattering: false,
  }));
  let latest: SurfaceSample;
  let previous: SurfaceSample | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  signal.addEventListener("abort", () => clearTimeout(timer), { once: true });

  function receive(sample: SurfaceSample, now: number) {
    latest = sample;
    let filtered = sample.beams;
    let releaseAt = Infinity;
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      const bit = 1 << i;
      const active = (sample.beams & bit) !== 0;
      const elapsed = now - channel.lastEdge;
      if (active !== channel.active) {
        if (elapsed >= AIR_GAP_MS && !(channel.chattering && channel.active)) {
          channel.started = now;
          channel.chattering = false;
        } else if (now - channel.started >= AIR_CHATTER_MS) channel.chattering = true;
        channel.lastEdge = now;
        channel.active = active;
      }
      if (!active && channel.chattering && now - channel.lastEdge < AIR_GAP_MS) {
        filtered |= bit;
        releaseAt = Math.min(releaseAt, channel.lastEdge + AIR_GAP_MS);
      }
    }
    if (releaseAt !== Infinity && timer === undefined) {
      timer = setTimeout(
        () => {
          timer = undefined;
          receive(latest, performance.now());
        },
        Math.ceil(releaseAt - performance.now()),
      );
    }
    if (
      previous?.touch === sample.touch &&
      previous.beams === filtered &&
      previous.blockedBeams === sample.blockedBeams
    )
      return;
    previous = filtered === sample.beams ? sample : { ...sample, beams: filtered };
    onInput(previous, now);
  }
  return receive;
}
