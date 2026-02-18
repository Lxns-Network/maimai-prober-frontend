export const SUPPORTED_YEARS = [2024, 2025] as const;

export type SupportedYear = typeof SUPPORTED_YEARS[number];

export function isSupportedYear(year: number): year is SupportedYear {
  return SUPPORTED_YEARS.includes(year as SupportedYear);
}
