import { createContext, useContext, type RefObject } from "react";

export type ShellViewportRef = RefObject<HTMLDivElement | null>;

const ShellViewportContext = createContext<ShellViewportRef | null>(null);

export const ShellViewportProvider = ShellViewportContext.Provider;

export function useShellViewportRef(): ShellViewportRef {
  const viewportRef = useContext(ShellViewportContext);

  if (!viewportRef) {
    throw new Error("useShellViewportRef must be used inside ShellViewportProvider");
  }

  return viewportRef;
}
