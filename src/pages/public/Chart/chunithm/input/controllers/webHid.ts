import type { ControllerDevice } from "./adapter";
import {
  chuPicoFilters,
  decodeChuPico,
  findChuPicoInterfaces,
  sendChuPicoLights,
} from "./adapters/chuPico";

export async function requestHidController(signal: AbortSignal): Promise<ControllerDevice | null> {
  const devices = await navigator.hid.requestDevice({ filters: chuPicoFilters });
  if (signal.aborted || !devices.length) return null;
  const { input, lights } = findChuPicoInterfaces(devices);
  async function close() {
    try {
      if (lights !== input && lights.opened) await lights.close();
    } finally {
      if (input.opened) await input.close();
    }
  }
  try {
    await input.open();
    signal.throwIfAborted();
    if (lights !== input) await lights.open();
  } catch (error) {
    await close();
    throw error;
  }
  return {
    name: "Chu Pico",
    listen(signal, onInput, onError) {
      input.addEventListener(
        "inputreport",
        ({ reportId, data, timeStamp }) => {
          try {
            const sample = decodeChuPico(reportId, data);
            if (sample) onInput(sample, timeStamp);
          } catch (error) {
            onError(error);
          }
        },
        { signal },
      );
      navigator.hid.addEventListener(
        "disconnect",
        ({ device }) => {
          if (device === input || device === lights) onError(new Error("Chu Pico 已断开连接"));
        },
        { signal },
      );
    },
    sendLights: (rgb) => sendChuPicoLights(lights, rgb),
    close,
  };
}
