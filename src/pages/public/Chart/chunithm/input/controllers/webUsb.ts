import type { ControllerDevice, WebUsbControllerAdapter } from "./adapter";
import { tasollerAdapter } from "./adapters/tasoller";
import { tasollerPlusAdapter } from "./adapters/tasollerPlus";

const adapters: readonly WebUsbControllerAdapter[] = [tasollerAdapter, tasollerPlusAdapter];

export async function requestUsbController(signal: AbortSignal): Promise<ControllerDevice | null> {
  let device: USBDevice;
  try {
    device = await navigator.usb.requestDevice({ filters: adapters.map(({ filter }) => filter) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return null;
    throw error;
  }
  if (signal.aborted) return null;
  const adapter = adapters.find(
    ({ filter }) => filter.vendorId === device.vendorId && filter.productId === device.productId,
  );
  if (!adapter) throw new Error("暂不支持此控制器");
  await device.open();
  try {
    signal.throwIfAborted();
    if (device.configuration?.configurationValue !== adapter.configuration)
      await device.selectConfiguration(adapter.configuration);
    signal.throwIfAborted();
    await device.claimInterface(adapter.interfaceNumber);
  } catch (error) {
    await device.close();
    throw error;
  }

  const decode = adapter.createDecoder();
  const lightReport = adapter.encodeLights(null);
  return {
    name: adapter.name,
    listen(signal, onInput, onError) {
      const read = async () => {
        while (!signal.aborted) {
          const { status, data } = await device.transferIn(
            adapter.inputEndpoint,
            adapter.transferLength,
          );
          const receivedAt = performance.now();
          if (signal.aborted) return;
          if (status !== "ok" || !data) throw new Error(`读取 ${adapter.name} 输入失败`);
          onInput(decode(data), receivedAt);
        }
      };
      void read().catch(onError);
    },
    async sendLights(rgb) {
      adapter.encodeLights(rgb, lightReport);
      const { status, bytesWritten } = await device.transferOut(
        adapter.outputEndpoint,
        lightReport,
      );
      if (status !== "ok" || bytesWritten !== lightReport.length)
        throw new Error(`写入 ${adapter.name} 灯光失败`);
    },
    close: () => device.close(),
  };
}
