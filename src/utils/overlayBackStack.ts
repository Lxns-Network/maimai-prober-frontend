type OverlayEntry = { id: number; close: () => void };

const stack: OverlayEntry[] = [];
const historyRestoreSuppressed = new Set<number>();
let pendingProgrammaticPops = 0;
let listenerInstalled = false;
let nextId = 1;

let netDepthDelta = 0;
let settleScheduled = false;

function handlePopState() {
  if (pendingProgrammaticPops > 0) {
    pendingProgrammaticPops -= 1;
    return;
  }
  const top = stack.pop();
  if (top) historyRestoreSuppressed.delete(top.id);
  top?.close();
}

function ensureListener() {
  if (listenerInstalled || typeof window === "undefined") return;
  window.addEventListener("popstate", handlePopState);
  listenerInstalled = true;
}

function settle() {
  settleScheduled = false;
  const delta = netDepthDelta;
  netDepthDelta = 0;
  if (delta === 0 || typeof window === "undefined") return;
  if (delta > 0) {
    for (let i = 0; i < delta; i++) {
      window.history.pushState({ __overlayBack: true }, "");
    }
  } else {
    pendingProgrammaticPops += -delta;
    for (let i = 0; i < -delta; i++) {
      window.history.back();
    }
  }
}

function scheduleSettle() {
  if (settleScheduled) return;
  settleScheduled = true;
  queueMicrotask(settle);
}

export function pushOverlay(close: () => void): number {
  ensureListener();
  const id = nextId++;
  stack.push({ id, close });
  netDepthDelta += 1;
  scheduleSettle();
  return id;
}

export function popOverlay(id: number): void {
  const index = stack.findIndex((entry) => entry.id === id);
  const shouldRestoreHistory = !historyRestoreSuppressed.delete(id);
  if (index === -1) return;
  stack.splice(index, 1);
  if (!shouldRestoreHistory) return;
  netDepthDelta -= 1;
  scheduleSettle();
}

/**
 * 标记本次关闭由路由跳转接管，清理 overlay 时不要再触发 `history.back()`。
 */
export function suppressOverlayHistoryRestore(id: number): void {
  if (stack.some((entry) => entry.id === id)) {
    historyRestoreSuppressed.add(id);
  }
}

export function suppressTopOverlayHistoryRestore(): void {
  const top = stack[stack.length - 1];
  if (top) suppressOverlayHistoryRestore(top.id);
}
