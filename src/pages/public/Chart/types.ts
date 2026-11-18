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
  playInput?: { device: "keyboard"; boundKeys: readonly string[] } | { device: "controller" };
}

export interface ChartPlayerProps {
  children: (parts: ChartPlayerParts) => ReactNode;
}
