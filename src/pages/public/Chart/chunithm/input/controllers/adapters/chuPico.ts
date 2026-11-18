import type { SurfaceSample } from "@lxns-network/chunithm-chart-engine/chart/play/input";

const usbId = { vendorId: 0x0f0d, productId: 0x0092 };
const joystickUsage = 4;
const lightsUsage = 0;
const joystickReport = 1;
const firstLightsReport = 4;
const remainingLightsReport = 5;
export const chuPicoFilters: HIDDeviceFilter[] = [joystickUsage, lightsUsage].map((usage) => ({
  ...usbId,
  usagePage: 1,
  usage,
}));

/** The firmware exposes joystick and lights as separate HID interfaces under a shared gamepad ID. */
export function findChuPicoInterfaces(devices: HIDDevice[]) {
  let input: HIDDevice | undefined;
  let lights: HIDDevice | undefined;
  for (const device of devices) {
    if (device.vendorId !== usbId.vendorId || device.productId !== usbId.productId) continue;
    for (const collection of device.collections) {
      if (collection.usagePage !== 1) continue;
      if (
        collection.usage === joystickUsage &&
        collection.inputReports?.some(({ reportId }) => reportId === joystickReport)
      )
        input = device;
      if (
        collection.usage === lightsUsage &&
        collection.outputReports?.some(({ reportId }) => reportId === firstLightsReport) &&
        collection.outputReports.some(({ reportId }) => reportId === remainingLightsReport)
      )
        lights = device;
    }
  }
  if (!input || !lights) throw new Error("所选设备没有 Chu Pico 的手柄和灯光接口");
  return { input, lights };
}

export function decodeChuPico(reportId: number, data: DataView): SurfaceSample | null {
  if (reportId !== joystickReport) return null;
  if (data.byteLength !== 8) throw new Error("当前 Chu Pico 固件的输入报告格式尚不支持");
  const buttons = data.getUint16(0, true);
  // The joystick maps AIR from bottom to top to button bits 3, 0, 1, 2, 4 and 5.
  const beams = ((buttons >> 3) & 1) | ((buttons & 7) << 1) | (buttons & 0x30);
  // RedBoard encodes rightmost lanes first and centers each joystick axis at 0x80.
  const axes = data.getUint32(3, true) ^ 0x80808080;
  let touch = 0;
  for (let bit = 0; bit < 32; bit += 2) touch |= ((axes >>> (30 - bit)) & 3) << bit;
  return { touch, beams };
}

export async function sendChuPicoLights(device: HIDDevice, rgb: Uint8Array<ArrayBuffer>) {
  // The first BRG triplet addresses the rightmost panel. Report 4 holds 16 lights, report 5 the other 15.
  const brg = new Uint8Array(rgb.length);
  for (let target = 0, source = rgb.length - 3; source >= 0; target += 3, source -= 3) {
    brg[target] = rgb[source + 2];
    brg[target + 1] = rgb[source];
    brg[target + 2] = rgb[source + 1];
  }
  await device.sendReport(firstLightsReport, brg.subarray(0, 48));
  await device.sendReport(remainingLightsReport, brg.subarray(48));
}
