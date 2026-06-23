type OverlayEntry = { id: number; close: () => void };

const stack: OverlayEntry[] = [];
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
  if (index === -1) return;
  stack.splice(index, 1);
  netDepthDelta -= 1;
  scheduleSettle();
}
