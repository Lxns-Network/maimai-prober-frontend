import { useEffect, useState } from "react";

function useShellViewportSize(): { width: number, height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const scrollArea = document.querySelector(
      "#shell-root>.mantine-ScrollArea-root>.mantine-ScrollArea-viewport"
    );

    const updateSize = () => {
      if (scrollArea) {
        setSize({ width: scrollArea.clientWidth, height: scrollArea.clientHeight });
      }
    };

    updateSize();

    window.addEventListener("resize", updateSize);

    return () => {
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  return size;
}

export default useShellViewportSize;
