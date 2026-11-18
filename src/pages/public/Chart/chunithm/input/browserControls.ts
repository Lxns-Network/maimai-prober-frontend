import type { ControlChange } from "@lxns-network/chunithm-chart-engine/chart/play/input";
import { createControls, NO_HOLD } from "./controls";
import { keyHold, type KeyBindings } from "./keyboard";
import { touchHold } from "./touchZones";

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
  keyboardPlaying(): boolean;
  touchProjection(): ArrayLike<number> | null;
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
  let enabled = false;
  const keyChanged = (event: KeyboardEvent) => {
    const bindings = options.keyBindings();
    if (!bindings) return;
    if (event.type === "keyup") {
      const changes = held.hold(`key:${event.code}`, NO_HOLD);
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
    if (!enabled) return;
    const bound = keyHold(bindings, event.code);
    if (!bound.lanes && !bound.air) return;
    event.preventDefault();
    if (!event.repeat && options.keyboardPlaying())
      options.onChange(held.hold(`key:${event.code}`, bound), event.timeStamp);
  };
  const touched = (event: PointerEvent) => {
    if (!enabled || event.pointerType === "mouse") return;
    const projection = options.touchProjection();
    if (!projection) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const next =
      event.type === "pointerup" || event.type === "pointercancel" || event.buttons === 0
        ? NO_HOLD
        : touchHold(
            projection,
            (event.clientX - rect.left) / rect.width,
            (event.clientY - rect.top) / rect.height,
          );
    options.onChange(held.hold(`touch:${event.pointerId}`, next), event.timeStamp);
  };
  // A tap on the lanes must not scroll the page or bring the fullscreen controls over the field.
  const touchStarted = (event: TouchEvent) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const pointerEvents = ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const;
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
    setEnabled(value: boolean) {
      enabled = value;
      canvas.style.touchAction = value ? "none" : "";
    },
    releaseAll: held.releaseAll,
  };
}
