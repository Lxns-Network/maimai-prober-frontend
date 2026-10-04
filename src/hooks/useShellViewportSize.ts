import { useEffect, useState } from "react";
import { useShellViewportRef } from "@/components/Shell/ShellViewportContext.ts";

function useShellViewportSize(): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const viewportRef = useShellViewportRef();

  useEffect(() => {
    const updateSize = () => {
      const scrollArea = viewportRef.current;
      if (scrollArea) {
        setSize({ width: scrollArea.clientWidth, height: scrollArea.clientHeight });
      }
    };

    updateSize();

    window.addEventListener("resize", updateSize);

    return () => {
      window.removeEventListener("resize", updateSize);
    };
  }, [viewportRef]);

  return size;
}

export default useShellViewportSize;
