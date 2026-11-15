/** Throws on cancellation, including browsers without AbortSignal.throwIfAborted. */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
}

/** Combines cancellation for one operation; dispose removes the source subscriptions. */
export function createAbortScope(signals: readonly AbortSignal[]) {
  const controller = new AbortController();
  const dispose = () => {
    for (const signal of signals) signal.removeEventListener("abort", abort);
  };
  const abort = () => {
    const source = signals.find((signal) => signal.aborted);
    controller.abort(source?.reason);
    dispose();
  };
  for (const signal of signals) {
    if (signal.aborted) {
      abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }
  return { signal: controller.signal, dispose };
}
