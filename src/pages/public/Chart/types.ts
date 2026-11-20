import type { ReactNode } from "react";

export interface PlaybackControlsProps {
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  portalTarget?: HTMLElement | null;
}

export interface ChartPlayerParts {
  title?: string;
  canvas: ReactNode;
  controls: ReactNode;
  playbackControls: (props: PlaybackControlsProps) => ReactNode;
  restartLabel: string;
  playInput?: { playing: boolean } & (
    | { device: "keyboard"; boundKeys: readonly string[] }
    | { device: "touch" | "controller" }
  );
}

export interface ChartPlayerProps {
  children: (parts: ChartPlayerParts) => ReactNode;
}
