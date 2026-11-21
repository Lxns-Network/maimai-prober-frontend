import type { WebUsbControllerAdapter } from "../adapter";

export const tasollerAdapter: WebUsbControllerAdapter = {
  name: "TASOLLER",
  filter: { vendorId: 0x1ccf, productId: 0x2333 },
  configuration: 1,
  interfaceNumber: 0,
  inputEndpoint: 4,
  outputEndpoint: 3,
  transferLength: 64,
  encodeLights(rgb, report = new Uint8Array(240)) {
    // DBT firmware addresses the slider from right to left, in GRB order.
    report.fill(0);
    report[0] = 0x42;
    report[1] = 0x4c;
    if (rgb) {
      for (let source = 0, target = 93; target >= 3; source += 3, target -= 3) {
        report[target] = rgb[source + 1];
        report[target + 1] = rgb[source];
        report[target + 2] = rgb[source + 2];
      }
    }
    return report;
  },
  createDecoder() {
    let neutralAir: number | undefined;
    const record = import.meta.env.DEV
      ? (globalThis as typeof globalThis & { traceRow?: (kind: string, raw: number) => void })
          .traceRow
      : undefined;
    let previousAir: number | undefined;
    return (data) => {
      if (data.byteLength !== 36 || data.getUint8(0) !== 0x44 || data.getUint16(1) !== 0x4254)
        throw new Error("当前 TASOLLER 固件的输入报告格式尚不支持");
      const air = data.getUint8(3) & 0x3f;
      if (record && air !== previousAir) {
        record("tasoller-air-raw", air);
        previousAir = air;
      }
      neutralAir = (neutralAir ?? air) & air;
      let touch = 0;
      for (let i = 0; i < 32; i++) if (data.getUint8(i + 4)) touch |= 1 << i;
      return { touch, beams: air & ~neutralAir, blockedBeams: neutralAir };
    };
  },
};
