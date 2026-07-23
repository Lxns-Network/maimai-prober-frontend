import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";

interface LazyLoadProps {
  children: ReactNode;
  height?: number | string;
  offset?: number | [number, number];
  placeholder?: ReactNode;
  overflow?: boolean;
  debounce?: number;
  className?: string;
  style?: CSSProperties;
}

function getRootMargin(offset: LazyLoadProps["offset"]): string {
  if (Array.isArray(offset)) return `${offset[0]}px 0px ${offset[1]}px`;
  return `${offset ?? 0}px`;
}

/** Renders its children once the placeholder approaches any visible scroll viewport. */
export default function LazyLoad({
  children,
  height,
  offset = 0,
  placeholder = null,
  className,
  style,
}: LazyLoadProps) {
  const [visible, setVisible] = useState(false);
  const placeholderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = placeholderRef.current;
    if (!element || visible) return;

    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: getRootMargin(offset) },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [offset, visible]);

  return (
    <div
      ref={placeholderRef}
      className={className}
      style={{ minHeight: visible ? undefined : height, ...style }}
    >
      {visible ? children : placeholder}
    </div>
  );
}
