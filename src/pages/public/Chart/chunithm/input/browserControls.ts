import type { ControlChange } from "@lxns-network/chunithm-chart-engine/chart/play/input";
import { createControls, NO_HOLD } from "./controls";
import { keyHold, type KeyBindings } from "./keyboard";
import { createTouchGestures, touchPosition } from "./touchZones";
import type { PlayInputDevice } from "../runtime/types";

/** Keyboard input on a page control belongs to that control. */
export function isChartControlTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      !!target.closest(
        'input, textarea, select, button, a[href], [role="slider"], [role="combobox"], [role="menuitem"], [role="option"], [role="dialog"]',
      ))
  );
}

interface BrowserInputOptions {
  /** Available while play handles keyboard shortcuts, including Escape in controller mode. */
  keyBindings(): KeyBindings | null;
  touchProjection(): ArrayLike<number> | null;
  groundHeight(): number;
  onChange(changes: ControlChange[], timeStamp: number): void;
  toggle(): void;
  onBlur(): void;
}

/** Owns the browser's held inputs and DOM listeners for the lifetime of the preview. */
export function bindBrowserControls(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
  options: BrowserInputOptions,
) {
  const held = createControls();
  const fingers = createTouchGestures(held);
  let device: PlayInputDevice | null = null;
  const keyChanged = (event: KeyboardEvent) => {
    const bindings = options.keyBindings();
    if (!bindings) return;
    if (event.type === "keyup") {
      const changes = held.hold(event.code, NO_HOLD);
      if (changes.length) {
        event.preventDefault();
        options.onChange(changes, event.timeStamp);
      }
      return;
    }
    if (event.defaultPrevented || isChartControlTarget(event.target) || event.code === "Tab")
      return;
    const modified = event.ctrlKey || event.metaKey || event.altKey;
    if (modified && !/^(Control|Meta|Alt)(Left|Right)$/.test(event.code)) return;
    if (event.code === "Escape") {
      event.preventDefault();
      if (!event.repeat) options.toggle();
      return;
    }
    if (device !== "keyboard") return;
    const bound = keyHold(bindings, event.code);
    if (!bound.lanes && !bound.air) return;
    event.preventDefault();
    if (!event.repeat) options.onChange(held.hold(event.code, bound), event.timeStamp);
  };
  const touched = (event: PointerEvent) => {
    if (device !== "touch" || event.pointerType === "mouse") return;
    const id = event.pointerId;
    if (event.type === "pointercancel" || event.type === "lostpointercapture") {
      options.onChange(fingers.end(id), event.timeStamp);
      return;
    }
    const ending = event.type === "pointerup";
    if (!ending && !event.buttons) return;
    const projection = options.touchProjection();
    if (!projection) {
      if (ending) options.onChange(fingers.end(id), event.timeStamp);
      return;
    }
    event.preventDefault();
    if (event.type === "pointerdown") {
      canvas.setPointerCapture(id);
      fingers.start(id);
    }
    const rect = canvas.getBoundingClientRect();
    const samples = event.type === "pointermove" ? event.getCoalescedEvents?.() : undefined;
    const groundHeight = options.groundHeight();
    for (const sample of samples?.length ? samples : [event]) {
      const point = touchPosition(
        projection,
        (sample.clientX - rect.left) / rect.width,
        (sample.clientY - rect.top) / rect.height,
        groundHeight,
      );
      options.onChange(fingers.move(id, point), sample.timeStamp);
    }
    if (ending) options.onChange(fingers.end(id), event.timeStamp);
  };
  // A tap on the lanes must not scroll the page or bring the fullscreen controls over the field.
  const touchStarted = (event: TouchEvent) => {
    if (device !== "touch") return;
    event.preventDefault();
    event.stopPropagation();
  };
  const pointerEvents = [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "lostpointercapture",
  ] as const;
  for (const type of pointerEvents) canvas.addEventListener(type, touched, { signal });
  canvas.addEventListener("touchstart", touchStarted, { signal, passive: false });
  document.addEventListener("keydown", keyChanged, { signal });
  document.addEventListener("keyup", keyChanged, { signal });
  window.addEventListener("blur", options.onBlur, { signal });
  signal.addEventListener(
    "abort",
    () => {
      canvas.style.touchAction = "";
    },
    { once: true },
  );
  return {
    setDevice(value: PlayInputDevice | null) {
      device = value;
      canvas.style.touchAction = device === "touch" ? "none" : "";
    },
    snapshot: held.snapshot,
    releaseAll() {
      fingers.clear();
      return held.releaseAll();
    },
  };
}
