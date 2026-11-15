import { createChartHandler } from "./computeChart";
import type { ChartRequest } from "./protocol";

const scope = globalThis as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
const handle = createChartHandler();
scope.onmessage = (event) => {
  const { message, transfer } = handle(event.data as ChartRequest);
  scope.postMessage(message, transfer);
};
