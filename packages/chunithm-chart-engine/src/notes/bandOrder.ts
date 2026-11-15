import type { Pack } from "../assets/packFormat";

/** The draw-order fields a band profile entry records. */
export interface BandOrder {
  readonly layer: number;
  readonly initialKey: number;
}

/**
 * The layer and initial sort key of one band profile entry; `family` names the band in errors.
 * @throws RangeError when the entry is missing, has no layer, or records no initial sort key.
 */
export function bandOrderOf(pack: Pack, name: string, family: string): BandOrder {
  const entry = pack.entries.get(name);
  if (!entry || !Number.isInteger(entry.meta.layer))
    throw new RangeError(`Missing ${family} profile ${name}`);
  const initialKey = entry.meta.initialKey;
  if (
    typeof initialKey !== "number" ||
    !Number.isInteger(initialKey) ||
    initialKey < 0 ||
    initialKey > 0xffff
  )
    throw new RangeError(`${family} profile ${name} records no initial sort key; rebuild the pack`);
  return { layer: entry.meta.layer as number, initialKey };
}
