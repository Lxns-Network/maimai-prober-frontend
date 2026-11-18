import { AIR_BEAM_COUNT } from "@lxns-network/chunithm-chart-engine/chart/play/input";

const AIR_GAP_MS = 20;
const AIR_CHATTER_MS = 100;

/**
 * A stationary hand can make an AIR beam flicker. After 100 ms of rapid edges, bridge
 * gaps shorter than 20 ms. This delays a real release on that beam by up to 20 ms plus one
 * report interval. First contact and isolated releases pass through immediately.
 */
export function createAirDebounce() {
  const channels = Array.from({ length: AIR_BEAM_COUNT }, () => ({
    active: false,
    lastEdge: -Infinity,
    started: 0,
    chattering: false,
  }));
  return (beams: number, now: number) => {
    let filtered = beams;
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      const bit = 1 << i;
      const active = (beams & bit) !== 0;
      const elapsed = now - channel.lastEdge;
      if (active !== channel.active) {
        if (elapsed >= AIR_GAP_MS && !(channel.chattering && channel.active)) {
          channel.started = now;
          channel.chattering = false;
        } else if (now - channel.started >= AIR_CHATTER_MS) channel.chattering = true;
        channel.lastEdge = now;
        channel.active = active;
      }
      if (!active && channel.chattering && now - channel.lastEdge < AIR_GAP_MS) filtered |= bit;
    }
    return filtered;
  };
}
