import type { ControllerInput, ControllerLightWriter } from "./adapter";
import { createAirDebounce } from "./airDebounce";
import { requestHidController } from "./webHid";
import { requestUsbController } from "./webUsb";

export type ControllerTransport = "usb" | "hid";

/** TASOLLER and Chu Pico return to their idle colors when host updates stop. */
const LIGHTS_REFRESH_MS = 1000 / 30;
/** Closing the device also cancels a blocked transfer, including the last lights-off frame. */
const LIGHTS_CLOSE_TIMEOUT_MS = 250;

function createLightOutput(
  send: (rgb: Uint8Array<ArrayBuffer>) => Promise<void>,
  onError: (error: unknown) => void,
) {
  const latest = new Uint8Array(31 * 3);
  const inFlight = new Uint8Array(latest.length);
  let active: boolean | undefined;
  let pending = false;
  let failed = false;
  let refresh: ReturnType<typeof setInterval> | undefined;
  let writing: Promise<void> | undefined;
  function enqueue() {
    pending = true;
    return (writing ??= Promise.resolve().then(drain));
  }
  async function drain() {
    try {
      while (pending) {
        pending = false;
        inFlight.set(latest);
        await send(inFlight);
      }
    } catch (error) {
      failed = true;
      onError(error);
    } finally {
      writing = undefined;
    }
  }
  function write(rgb: Uint8Array | null) {
    if (rgb) latest.set(rgb);
    else {
      if (active === false) return writing;
      latest.fill(0);
    }
    if (active !== !!rgb) {
      active = !!rgb;
      if (active)
        refresh = setInterval(() => {
          if (!writing) enqueue();
        }, LIGHTS_REFRESH_MS);
      else clearInterval(refresh);
    }
    return enqueue();
  }
  return {
    write,
    async close() {
      clearInterval(refresh);
      if (failed) return;
      const off = write(null);
      if (!off) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          off,
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, LIGHTS_CLOSE_TIMEOUT_MS);
          }),
        ]);
      } finally {
        pending = false;
        clearTimeout(timer);
      }
    },
  };
}

export async function readController(
  transport: ControllerTransport,
  signal: AbortSignal,
  onInput: ControllerInput,
  onConnection: (connection: { name: string; writeLights: ControllerLightWriter } | null) => void,
) {
  if (signal.aborted) return;
  const device = await (transport === "usb" ? requestUsbController : requestHidController)(signal);
  if (!device) return;
  const lifetime = new AbortController();
  let failure: unknown;
  function fail(error: unknown) {
    if (!lifetime.signal.aborted) {
      failure = error;
      lifetime.abort();
    }
  }
  const lights = createLightOutput(device.sendLights, fail);
  const stop = () => lifetime.abort();
  try {
    if (signal.aborted) return;
    signal.addEventListener("abort", stop, { once: true });
    const ended = new Promise<void>((resolve) =>
      lifetime.signal.addEventListener("abort", () => resolve(), { once: true }),
    );
    device.listen(lifetime.signal, createAirDebounce(lifetime.signal, onInput), fail);
    onConnection({
      name: device.name,
      writeLights: (rgb) => {
        if (!lifetime.signal.aborted) lights.write(rgb);
      },
    });
    await ended;
    if (failure !== undefined) throw failure;
  } finally {
    signal.removeEventListener("abort", stop);
    stop();
    try {
      onConnection(null);
      await lights.close();
    } finally {
      await device.close();
    }
  }
}
