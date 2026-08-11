import { create } from "zustand";

export interface CanvasDebugInfo {
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
  canvasDpr: number;
  deviceDpr: number;
  clockSource: "audio" | "raf";
  fps: number;
  fpsHistory: number[];
}

interface CanvasDebugInfoState {
  debugInfo: CanvasDebugInfo | null;
  setDebugInfo: (debugInfo: CanvasDebugInfo | null) => void;
}

export const useCanvasDebugInfoStore = create<CanvasDebugInfoState>((set) => ({
  debugInfo: null,
  setDebugInfo: (debugInfo) => set({ debugInfo }),
}));
