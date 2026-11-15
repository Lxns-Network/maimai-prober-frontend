/** Fixed-unit capacity rules that project a gauge value onto its cells and stocks. */
export interface HudGaugeRules {
  capacities: readonly number[];
  fixedScale: number;
  animationLength: number;
  /** Highest capacity index a cell can occupy. */
  maximumCapacityIndex: number;
  /** Stock count at which the clear state begins. */
  clearStockCount: number;
  /** Fixed gauge value at and above which the gauge reads as cleared. */
  clearFixedValue: number;
}

export const HUD_GAUGE_CAPACITIES: readonly number[] = Object.freeze([
  12000, 12000, 18000, 18000, 18000, 18000, 18000, 18000, 24000, 24000, 30000, 30000, 30000, 30000,
  30000, 30000, 30000, 30000, 30000, 30000,
]);

/** Gauge rules of normal play without a skill. */
export const HUD_GAUGE_RULES: HudGaugeRules = Object.freeze({
  capacities: HUD_GAUGE_CAPACITIES,
  fixedScale: 100,
  animationLength: 1000,
  maximumCapacityIndex: 0,
  clearStockCount: 1,
  clearFixedValue: 1_200_000,
});

export interface HudGaugeStock {
  index: number;
  enabled: boolean;
  filled: boolean;
  success: boolean;
  clearVisible: boolean;
  numberVisible: boolean;
}

export interface HudGauge {
  fixedValue: number;
  fill: number;
  animationFrame: number;
  stockCount: number;
  capacityIndex: number;
  clear: boolean;
  stocks: readonly HudGaugeStock[];
}

/**
 * Projects a gauge value onto the fixed-unit cell and stock state. Every output depends on `value`
 * and the rules alone; `limit` only has to match the rules' total capacity.
 */
export function resolveHudGauge(
  input: { value: number; limit: number },
  rules: HudGaugeRules = HUD_GAUGE_RULES,
): HudGauge {
  const { value, limit } = input;
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(limit) || limit <= 0)
    throw new RangeError("A finite, nonnegative gauge and a positive limit are required");
  if (value > limit) throw new RangeError("The gauge exceeds its limit");
  const fixedValue = Math.trunc(value * rules.fixedScale);
  let maximumFixedValue = 0;
  for (let index = 0; index <= rules.maximumCapacityIndex; index++)
    maximumFixedValue += rules.capacities[index] * rules.fixedScale;
  if (limit * rules.fixedScale !== maximumFixedValue)
    throw new RangeError("The gauge limit does not match the capacity rules");
  if (fixedValue > maximumFixedValue) throw new RangeError("The gauge exceeds the last capacity");

  let remainderFixed = fixedValue;
  let stockCount = 0;
  for (const capacity of rules.capacities) {
    const capacityFixed = capacity * rules.fixedScale;
    if (remainderFixed < capacityFixed) break;
    remainderFixed -= capacityFixed;
    stockCount++;
  }
  const capacityIndex = Math.min(stockCount, rules.maximumCapacityIndex);
  const full = stockCount > rules.maximumCapacityIndex;
  const remainderWhole = Math.trunc(remainderFixed / rules.fixedScale);
  const scale = Math.fround(rules.animationLength / rules.capacities[capacityIndex]);
  const animationFrame = full
    ? rules.animationLength
    : Math.fround(Math.max(0, Math.min(rules.animationLength, remainderWhole * scale)));
  const fill = Math.fround(animationFrame / rules.animationLength);
  const stocks = Object.freeze(
    rules.capacities.map(
      (_, index): HudGaugeStock => ({
        index,
        enabled: index <= rules.maximumCapacityIndex,
        filled: index < stockCount,
        success: index >= rules.clearStockCount - 1,
        clearVisible: index === rules.clearStockCount - 1,
        numberVisible: index === stockCount - 1,
      }),
    ),
  );
  return {
    fixedValue,
    fill,
    animationFrame,
    stockCount,
    capacityIndex,
    clear: fixedValue >= rules.clearFixedValue,
    stocks,
  };
}

export interface HudStockInput {
  displayFrame: 0 | 1;
  changeFrame?: 0 | 1;
  /** Settled end of the stock's entry animation. */
  settledEntry: "normal" | "success" | "hide";
  clearVisible: boolean;
  numberVariant: "normal" | "success" | "hidden";
}

/** The animation frames and variants one gauge stock selects. */
export function resolveHudStockInput(
  gauge: Pick<HudGauge, "stocks">,
  index: number,
): HudStockInput {
  if (!Number.isSafeInteger(index) || index < 0 || index >= gauge.stocks.length)
    throw new RangeError(`Gauge stock ${index} does not exist`);
  const stock = gauge.stocks[index];
  return {
    displayFrame: stock.enabled ? 1 : 0,
    ...(stock.enabled ? { changeFrame: stock.success ? (1 as const) : (0 as const) } : {}),
    settledEntry: stock.filled ? (stock.success ? "success" : "normal") : "hide",
    clearVisible: stock.clearVisible,
    numberVariant: stock.numberVisible ? (stock.success ? "success" : "normal") : "hidden",
  };
}

/** Glyph metrics of a number cast. Bit 2 of `flags` groups thousands; bit 4 pads with zeros. */
export interface HudNumberProfile {
  referenceCount: number;
  flags: number;
  /** Bits 4 and 8 select center and right alignment within `width`. */
  layoutFlags: number;
  width: number;
  pivotX: number;
  pivotY: number;
  digitWidth: number;
  digitHeight: number;
  punctuationWidth: number;
  punctuationHeight: number;
  commaOffsetY: number;
  groupSize: number;
  /** Most integer digits shown, from 1 to 9. */
  digits: number;
  spacing: number;
  commaReference: number;
}

/** A number cast with two scaled fraction digits after a dot. */
export interface HudDecimalProfile extends HudNumberProfile {
  fractionScaleX: number;
  fractionScaleY: number;
  fractionOffsetY: number;
  dotOffsetY: number;
  dotReference: number;
}

/** Most glyphs one run holds: nine digits and eight group separators. */
export const HUD_DIGIT_CAPACITY = 17;
const VERTEX_FLOATS = 12;
const ZERO = 48;
const COMMA = 44;
const DOT = 46;
const MAX_INT32 = 0x7fffffff;

/** Glyphs of one laid-out number, in submission order. */
export interface HudDigitRun {
  value: number;
  measuredWidth: number;
  count: number;
  /** Character code of each glyph. */
  characters: Uint8Array;
  references: Uint16Array;
  /** Four cast-local, Y-up xyz vertices per glyph: top left, bottom left, top right, bottom right. */
  vertices: Float32Array;
}

export function createHudDigitRun(): HudDigitRun {
  return {
    value: 0,
    measuredWidth: 0,
    count: 0,
    characters: new Uint8Array(HUD_DIGIT_CAPACITY),
    references: new Uint16Array(HUD_DIGIT_CAPACITY),
    vertices: new Float32Array(HUD_DIGIT_CAPACITY * VERTEX_FLOATS),
  };
}

const text = new Uint8Array(HUD_DIGIT_CAPACITY);

/** Writes the decimal digits of a nonnegative integer into `text` from `at`, returning the end. */
function writeDigits(value: number, length: number, at: number): number {
  for (let i = at + length - 1; i >= at; i--) {
    text[i] = ZERO + (value % 10);
    value = Math.floor(value / 10);
  }
  return at + length;
}

function digitCount(value: number): number {
  let count = 1;
  while (value >= 10) {
    value = Math.floor(value / 10);
    count++;
  }
  return count;
}

function startX(profile: HudNumberProfile, measuredWidth: number): number {
  const f = Math.fround;
  let x = f(-profile.pivotX);
  const available = f(profile.width - f(measuredWidth));
  if ((profile.layoutFlags & 12) === 4) x = f(f(available * 0.5) + x);
  else if ((profile.layoutFlags & 12) === 8) x = f(x + available);
  return x;
}

function writeGlyph(
  out: HudDigitRun,
  slot: number,
  character: number,
  reference: number,
  profile: HudNumberProfile,
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  if (reference < 0 || reference >= profile.referenceCount)
    throw new RangeError(`The number cast has no glyph ${String.fromCharCode(character)}`);
  const f = Math.fround;
  const bottom = f(y - height);
  const right = f(x + width);
  out.characters[slot] = character;
  out.references[slot] = reference;
  const v = out.vertices;
  const o = slot * VERTEX_FLOATS;
  v[o] = x;
  v[o + 1] = y;
  v[o + 2] = 0;
  v[o + 3] = x;
  v[o + 4] = bottom;
  v[o + 5] = 0;
  v[o + 6] = right;
  v[o + 7] = y;
  v[o + 8] = 0;
  v[o + 9] = right;
  v[o + 10] = bottom;
  v[o + 11] = 0;
  return right;
}

function requireDigits(profile: HudNumberProfile): void {
  if (!Number.isInteger(profile.digits) || profile.digits < 1 || profile.digits > 9)
    throw new RangeError("A number cast shows from 1 to 9 integer digits");
}

/**
 * Lays out a nonnegative 32-bit integer, clamped to the cast's digit capacity, into `out`. Glyphs are
 * written right to left, separators included.
 */
export function layoutHudDigits(profile: HudNumberProfile, value: number, out: HudDigitRun): void {
  requireDigits(profile);
  if (!Number.isInteger(value) || value < 0 || value > MAX_INT32)
    throw new RangeError("A nonnegative 32-bit integer is required");
  const shown = Math.min(value, 10 ** profile.digits - 1);
  const digits = profile.flags & 4 ? profile.digits : digitCount(shown);
  let length = 0;
  if ((profile.flags & 2) !== 0 && profile.groupSize > 0) {
    const head = digits % profile.groupSize || profile.groupSize;
    let rest = shown;
    let divisor = 10 ** (digits - head);
    length = writeDigits(Math.floor(rest / divisor), head, 0);
    rest %= divisor;
    for (let left = digits - head; left > 0; left -= profile.groupSize) {
      divisor /= 10 ** profile.groupSize;
      text[length++] = COMMA;
      length = writeDigits(Math.floor(rest / divisor), profile.groupSize, length);
      rest %= divisor;
    }
  } else length = writeDigits(shown, digits, 0);

  const f = Math.fround;
  let measured = 0;
  for (let index = 0; index < length; index++) {
    if (text[index] === COMMA) measured = f(measured + profile.punctuationWidth);
    else {
      measured = f(measured + profile.digitWidth);
      if (index < length - 1) measured = f(measured + profile.spacing);
    }
  }
  const measuredWidth = Math.ceil(measured);
  let x = startX(profile, measuredWidth);
  const digitY = f(-f(-profile.pivotY));
  const commaY = f(
    -f(
      f(f(profile.digitHeight - profile.punctuationHeight) + f(-profile.pivotY)) -
        profile.commaOffsetY,
    ),
  );
  for (let index = 0; index < length; index++) {
    const character = text[index];
    const comma = character === COMMA;
    x = writeGlyph(
      out,
      length - 1 - index,
      character,
      comma ? profile.commaReference : character - ZERO,
      profile,
      x,
      comma ? commaY : digitY,
      comma ? profile.punctuationWidth : profile.digitWidth,
      comma ? profile.punctuationHeight : profile.digitHeight,
    );
    if (index < length - 1 && text[index + 1] !== COMMA) x = f(x + profile.spacing);
  }
  out.value = value;
  out.measuredWidth = measuredWidth;
  out.count = length;
}

/**
 * Lays out a positive speed given in hundredths with two fraction digits into `out`. Integer glyphs
 * are written right to left, then the dot and fraction glyphs left to right.
 */
export function layoutHudSpeed(
  profile: HudDecimalProfile,
  hundredths: number,
  out: HudDigitRun,
): void {
  requireDigits(profile);
  if (!Number.isSafeInteger(hundredths) || hundredths <= 0 || hundredths > MAX_INT32)
    throw new RangeError("A positive 32-bit speed in hundredths is required");
  const integer = Math.min(Math.trunc(hundredths / 100), 10 ** profile.digits - 1);
  const integerLength = writeDigits(integer, digitCount(integer), 0);
  text[integerLength] = DOT;
  const length = writeDigits(hundredths % 100, 2, integerLength + 1);

  const f = Math.fround;
  const fractionWidth = f(profile.digitWidth * profile.fractionScaleX);
  const fractionHeight = f(profile.digitHeight * profile.fractionScaleY);
  let measured = 0;
  for (let index = 0; index < length; index++) {
    if (text[index] === DOT) measured = f(measured + profile.punctuationWidth);
    else {
      measured = f(measured + (index > integerLength ? fractionWidth : profile.digitWidth));
      if (index < length - 1) measured = f(measured + profile.spacing);
    }
  }
  const measuredWidth = Math.ceil(measured);
  let x = startX(profile, measuredWidth);
  const offsetY = (height: number, offset: number) =>
    f(-f(f(f(profile.digitHeight - height) + f(-profile.pivotY)) - offset));
  const integerY = f(-f(-profile.pivotY));
  const dotY = offsetY(profile.punctuationHeight, profile.dotOffsetY);
  const fractionY = offsetY(fractionHeight, profile.fractionOffsetY);
  for (let index = 0; index < length; index++) {
    const character = text[index];
    const dot = index === integerLength;
    const fraction = index > integerLength;
    x = writeGlyph(
      out,
      index < integerLength ? integerLength - 1 - index : index,
      character,
      dot ? profile.dotReference : character - ZERO,
      profile,
      x,
      dot ? dotY : fraction ? fractionY : integerY,
      dot ? profile.punctuationWidth : fraction ? fractionWidth : profile.digitWidth,
      dot ? profile.punctuationHeight : fraction ? fractionHeight : profile.digitHeight,
    );
    if (index < length - 1 && (fraction || text[index + 1] !== DOT)) x = f(x + profile.spacing);
  }
  out.value = hundredths;
  out.measuredWidth = measuredWidth;
  out.count = length;
}
