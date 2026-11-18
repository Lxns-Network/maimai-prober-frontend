import type { SurfaceSample } from "@lxns-network/chunithm-chart-engine/chart/play/input";
import type { ControllerLightWriter, WebUsbControllerAdapter } from "./adapter";
import { tasollerAdapter } from "./adapters/tasoller";
import { createAirDebounce } from "./airDebounce";

const adapters: readonly WebUsbControllerAdapter[] = [tasollerAdapter];

/** The slider updates at 30 Hz. TASOLLER returns to its idle colors if unchanged frames stop arriving. */
const LIGHTS_REFRESH_MS = 1000 / 30;
/** USB transfers cannot be aborted individually. Close the device if its last lights never drain. */
const LIGHTS_CLOSE_TIMEOUT_MS = 250;

/** Keep one transfer in flight and overwrite the waiting buffer with the latest colors. */
function createLightOutput(
  device: USBDevice,
  adapter: WebUsbControllerAdapter,
  onError: (error: unknown) => void,
) {
  const latest = adapter.encodeLights(null);
  const inFlight = new Uint8Array(latest.length);
  let active: boolean | undefined;
  let refresh: ReturnType<typeof setInterval> | undefined;
  let pending = false;
  let failed = false;
  let writing: Promise<void> | undefined;
  function enqueue() {
    pending = true;
    return (writing ??= Promise.resolve().then(drain));
  }
  function repeat() {
    if (!writing) enqueue();
  }
  async function drain() {
    try {
      while (pending) {
        pending = false;
        inFlight.set(latest);
        const { status, bytesWritten } = await device.transferOut(adapter.outputEndpoint, inFlight);
        if (status !== "ok" || bytesWritten !== inFlight.length)
          throw new Error(`写入 ${adapter.name} 灯光失败`);
      }
    } catch (error) {
      failed = true;
      onError(error);
    } finally {
      writing = undefined;
    }
  }
  function write(rgb: Uint8Array | null) {
    if (rgb === null && active === false) return writing;
    active = rgb !== null;
    clearInterval(refresh);
    if (active) refresh = setInterval(repeat, LIGHTS_REFRESH_MS);
    adapter.encodeLights(rgb, latest);
    return enqueue();
  }
  return {
    write,
    async close() {
      if (!failed && device.opened) await finishLights(write(null));
      active = false;
      pending = false;
      clearInterval(refresh);
    },
  };
}

async function finishLights(writing: Promise<void> | undefined) {
  if (!writing) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      writing,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, LIGHTS_CLOSE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readController(
  signal: AbortSignal,
  onInput: (sample: SurfaceSample, receivedAt: number, deviceName: string) => void,
  onLights: (write: ControllerLightWriter | null) => void,
) {
  let device: USBDevice;
  try {
    device = await navigator.usb.requestDevice({ filters: adapters.map(({ filter }) => filter) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return;
    throw error;
  }
  if (signal.aborted) return;
  const adapter = adapters.find(
    ({ filter }) => filter.vendorId === device.vendorId && filter.productId === device.productId,
  );
  if (!adapter) throw new Error("暂不支持此控制器");
  await device.open();
  let lights: ReturnType<typeof createLightOutput> | undefined;
  let failure: unknown;
  let closing: Promise<void> | undefined;
  async function closeConnection() {
    try {
      if (lights) {
        onLights(null);
        await lights.close();
      }
    } finally {
      if (device.opened) await device.close();
    }
  }
  const stop = () =>
    (closing ??= Promise.resolve()
      .then(closeConnection)
      .catch((error) => {
        failure ??= error;
      }));
  try {
    if (signal.aborted) return;
    if (device.configuration?.configurationValue !== adapter.configuration)
      await device.selectConfiguration(adapter.configuration);
    if (signal.aborted) return;
    await device.claimInterface(adapter.interfaceNumber);
    if (signal.aborted) return;
    signal.addEventListener("abort", stop);
    const output = createLightOutput(device, adapter, (error) => {
      failure ??= error;
      void stop();
    });
    lights = output;
    onLights((rgb) => {
      if (!signal.aborted && !closing) output.write(rgb);
    });
    const decode = adapter.createDecoder();
    const debounceAir = createAirDebounce();
    let previous: SurfaceSample | undefined;
    while (!signal.aborted && !closing) {
      const { status, data } = await device.transferIn(
        adapter.inputEndpoint,
        adapter.transferLength,
      );
      const receivedAt = performance.now();
      if (signal.aborted || closing) break;
      if (status !== "ok" || !data) throw new Error(`读取 ${adapter.name} 输入失败`);
      const sample = decode(data);
      const beams = debounceAir(sample.beams, receivedAt);
      if (
        previous?.touch === sample.touch &&
        previous.beams === beams &&
        previous.blockedBeams === sample.blockedBeams
      )
        continue;
      previous = { ...sample, beams };
      onInput(previous, receivedAt, adapter.name);
    }
  } catch (error) {
    failure ??= error;
  } finally {
    signal.removeEventListener("abort", stop);
    await stop();
  }
  if (!signal.aborted && failure !== undefined) throw failure;
}
