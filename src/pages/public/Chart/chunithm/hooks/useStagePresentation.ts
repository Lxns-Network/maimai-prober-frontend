import { useCallback, useRef, useState } from "react";
import type { FrameSurface } from "@lxns-network/chunithm-chart-engine/render/frameTypes";
import { prepareStagePresentation } from "../rendering/stage";

/** Draws a chart's stage behind it with the engine stage interpreter, following the chart's seconds. */
export function useStagePresentation(
  base: string | null,
  initialFieldValue = "0",
  initialShowBackground = true,
) {
  const enabled = base !== null;
  const backgroundVisible = useRef(initialShowBackground);
  const [showBackground, setShowBackground] = useState(initialShowBackground);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const fieldLabel = useRef(
    new URLSearchParams(window.location.search).get("stage_field") ?? initialFieldValue,
  );
  const [fieldValue, setFieldValue] = useState(fieldLabel.current);
  const [fieldOptions, setFieldOptions] = useState<{ value: string; label: string }[]>([]);
  const prepare = useCallback(
    async (
      scene: FrameSurface,
      stage: Promise<number | null>,
      signal: AbortSignal,
      setDividerColor?: (color: number) => void,
    ) => {
      if (base === null) throw new Error("Stage assets are not configured");
      return prepareStagePresentation({
        base,
        scene,
        stage,
        signal,
        setDividerColor,
        readFieldValue: () => fieldLabel.current,
        readShowBackground: () => backgroundVisible.current,
        setStatus,
        setError,
        setFieldOptions,
      });
    },
    [base],
  );
  return {
    enabled,
    status,
    error,
    fieldValue,
    fieldOptions,
    showBackground,
    selectBackground(value: boolean) {
      backgroundVisible.current = value;
      setShowBackground(value);
    },
    prepare: enabled ? prepare : undefined,
    selectField(value: string) {
      if (!fieldOptions.some((option) => option.value === value)) return;
      fieldLabel.current = value;
      setFieldValue(value);
      const url = new URL(window.location.href);
      url.searchParams.set("stage_field", value);
      window.history.replaceState(window.history.state, "", url);
    },
  };
}
