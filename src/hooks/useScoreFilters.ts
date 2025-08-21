import { useMemo, useReducer } from "react";

type Filters = {
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

const defaultFilters: Filters = {
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
  | { type: keyof Filters; payload: Filters[keyof Filters] }
  | { type: "reset"; payload: Filters };

const reducer = (state: Filters, action: Action): Filters => {
  switch (action.type) {
    case "reset":
      return { ...defaultFilters, ...action.payload };
    default:
      return { ...state, [action.type]: action.payload };
  }
};

export function useScoreFilters(initialFilters: Partial<Filters> = {}) {
  const mergedInitial = { ...defaultFilters, ...initialFilters };

  const [filters, dispatch] = useReducer(reducer, mergedInitial);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    dispatch({ type: key, payload: value });
  };

  const resetFilters = () => {
    dispatch({ type: "reset", payload: mergedInitial });
  };

  const isDefault = useMemo(() => {
    for (const key in defaultFilters) {
      const k = key as keyof Filters;
      const val = filters[k];
      const defVal = mergedInitial[k];
      if (Array.isArray(val) && Array.isArray(defVal)) {
        if (val.length !== defVal.length || val.some((v, i) => v !== defVal[i])) return false;
      } else if (val !== defVal) {
        return false;
      }
    }
    return true;
  }, [filters, mergedInitial]);

  return { filters, setFilter, resetFilters, isDefault };
}