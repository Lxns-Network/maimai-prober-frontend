import type { Hold } from "./controls";

/** Physical keys (`KeyboardEvent.code`) bound to each ground lane, and to the AIR sensor. */
export interface KeyBindings {
  lanes: string[][];
  air: string[];
}

const pairs = (keys: string[]) => keys.flatMap((key) => [[key], [key]]);

export const BINDING_PRESETS: { value: string; label: string; bindings: KeyBindings }[] = [
  {
    value: "8k",
    label: "8 键",
    bindings: {
      lanes: pairs(["KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL", "Semicolon"]),
      air: ["Space"],
    },
  },
  {
    value: "16k",
    label: "16 键",
    bindings: {
      lanes: [
        "KeyA",
        "KeyW",
        "KeyS",
        "KeyE",
        "KeyD",
        "KeyR",
        "KeyF",
        "KeyT",
        "KeyJ",
        "KeyI",
        "KeyK",
        "KeyO",
        "KeyL",
        "KeyP",
        "Semicolon",
        "BracketLeft",
      ].map((key) => [key]),
      air: ["Space"],
    },
  },
];

export const DEFAULT_KEY_BINDINGS = BINDING_PRESETS[0].bindings;

const KEY_LABELS: Record<string, string> = {
  Space: "Space",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  ShiftLeft: "LShift",
  ShiftRight: "RShift",
  ControlLeft: "LCtrl",
  ControlRight: "RCtrl",
  AltLeft: "LAlt",
  AltRight: "RAlt",
  Enter: "Enter",
  Tab: "Tab",
};

/** Short label of a key code, as printed on the key. */
export function keyLabel(code: string): string {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num${code.slice(6)}`;
  if (code.startsWith("Arrow")) return code.slice(5);
  return code;
}

/** Lanes and AIR sensor `code` is bound to. */
export function keyHold(bindings: KeyBindings, code: string): Hold {
  let lanes = 0;
  bindings.lanes.forEach((keys, lane) => {
    if (keys.includes(code)) lanes |= 1 << lane;
  });
  return { lanes, air: bindings.air.includes(code) };
}

/** Binds `code` to one lane, or to the AIR sensor with lane -1, taking it off everything else. */
export function bindKey(bindings: KeyBindings, code: string, lane: number): KeyBindings {
  const lanes = bindings.lanes.map((keys, at) =>
    at === lane ? [code] : keys.filter((key) => key !== code),
  );
  const air =
    lane < 0
      ? [...bindings.air.filter((key) => key !== code), code]
      : bindings.air.filter((key) => key !== code);
  return { lanes, air };
}
