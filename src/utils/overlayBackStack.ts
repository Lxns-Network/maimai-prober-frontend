type OverlayEntry = { id: number; close: () => void };

const stack: OverlayEntry[] = [];
let pendingProgrammaticPops = 0;
let listenerInstalled = false;
let nextId = 1;

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

export function pushOverlay(close: () => void): number {
  ensureListener();
  const id = nextId++;
  stack.push({ id, close });
  window.history.pushState({ __overlayBack: true }, "");
  return id;
}

export function popOverlay(id: number): void {
  const index = stack.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  stack.splice(index, 1);
  pendingProgrammaticPops += 1;
  window.history.back();
}
