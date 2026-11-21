import { AIR_BEAM_COUNT, LANE_COUNT } from "@lxns-network/chunithm-chart-engine/chart/play/input";
import type { WebUsbControllerAdapter } from "../adapter";

// TASOLLER Options calibrates sensitivity in the device and specifies 20 for the game threshold.
const PRESSURE_THRESHOLD = 20;

export const tasollerPlusAdapter: WebUsbControllerAdapter = {
  name: "TASOLLER Plus",
  filter: { vendorId: 0x0e8f, productId: 0x1231 },
  configuration: 1,
  interfaceNumber: 0,
  inputEndpoint: 4,
  outputEndpoint: 3,
  transferLength: 36,
  encodeLights(rgb, report = new Uint8Array(114)) {
    report.fill(0);
    report[0] = 0x44;
    report[1] = 0x4c;
    report[2] = 0x02;
    if (rgb) {
      for (let source = 0, target = 93; target >= 3; source += 3, target -= 3) {
        report[target] = rgb[source];
        report[target + 1] = rgb[source + 1];
        report[target + 2] = rgb[source + 2];
      }
    }
    return report;
  },
  createDecoder() {
    return (data) => {
      if (data.byteLength !== 36 || data.getUint8(0) !== 0x44 || data.getUint16(1) !== 0x4254)
        throw new Error("当前 TASOLLER Plus 固件的输入报告格式尚不支持");

      // Pairs start at the rightmost lane. The upper contact is first in both layouts.
      let touch = 0;
      for (let lane = 0; lane < LANE_COUNT; lane++) {
        const pressure = 4 + 2 * (LANE_COUNT - 1 - lane);
        if (data.getUint8(pressure) >= PRESSURE_THRESHOLD) touch |= 1 << (2 * lane);
        if (data.getUint8(pressure + 1) >= PRESSURE_THRESHOLD) touch |= 1 << (2 * lane + 1);
      }
      const air = data.getUint8(3);
      let beams = 0;
      for (let beam = 0; beam < AIR_BEAM_COUNT; beam++) {
        if (air & (1 << (AIR_BEAM_COUNT - 1 - beam))) beams |= 1 << beam;
      }
      return { touch, beams };
    };
  },
};
