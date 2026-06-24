import { useCallback, useMemo, useReducer } from "react";

export type ScoreFilters = {
  difficulty: string[];
  type: string[];
  rating: [number, number];
  endRating: [number, number];
  genre: string[];
  version: number[];
  fullCombo: string[];
  fullSync: string[];
  deluxeStar: number[];
  showUnplayed: boolean;
  uploadTime: [string | null, string | null];
};

const defaultFilters: ScoreFilters = {
  difficulty: [],
  type: [],
  rating: [0, 0],
  endRating: [0, 0],
  genre: [],
  version: [],
  fullCombo: [],
  fullSync: [],
  deluxeStar: [],
  showUnplayed: false,
  uploadTime: [null, null],
};

type Action =
  | { type: keyof ScoreFilters; payload: ScoreFilters[keyof ScoreFilters] }
  | { type: "reset"; payload: ScoreFilters };

const reducer = (state: ScoreFilters, action: Action): ScoreFilters => {
  switch (action.type) {
    case "reset":
      return { ...defaultFilters, ...action.payload };
    default:
      return { ...state, [action.type]: action.payload };
  }
};

export function useScoreFilters(
  defaultOverrides: Partial<ScoreFilters> = {},
  initialFilters: Partial<ScoreFilters> = defaultOverrides,
) {
  const mergedDefault = useMemo(
    () => ({ ...defaultFilters, ...defaultOverrides }),
    [defaultOverrides],
  );

  const [filters, dispatch] = useReducer(reducer, { ...mergedDefault, ...initialFilters });

  const setFilter = useCallback(<K extends keyof ScoreFilters>(key: K, value: ScoreFilters[K]) => {
    dispatch({ type: key, payload: value });
  }, []);

  const resetFilters = useCallback(() => {
    dispatch({ type: "reset", payload: mergedDefault });
  }, [mergedDefault]);

  const isDefault = useMemo(() => {
    for (const key in defaultFilters) {
      const k = key as keyof ScoreFilters;
      const val = filters[k];
      const defVal = mergedDefault[k];
      if (Array.isArray(val) && Array.isArray(defVal)) {
        if (val.length !== defVal.length || val.some((v, i) => v !== defVal[i])) return false;
      } else if (val !== defVal) {
        return false;
      }
    }
    return true;
  }, [filters, mergedDefault]);

  return { filters, setFilter, resetFilters, isDefault };
}
