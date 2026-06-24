import { navigate } from "vike/client/router";
import { suppressTopOverlayHistoryRestore } from "@/utils/overlayBackStack.ts";

type NavigateOptions = Parameters<typeof navigate>[1];

export function navigateReplacingOverlay(url: string, options?: NavigateOptions): void {
  navigate(url, { ...options, overwriteLastHistoryEntry: true });
}

export function navigateFromCurrentOverlay(url: string, options?: NavigateOptions): void {
  suppressTopOverlayHistoryRestore();
  navigateReplacingOverlay(url, options);
}
