declare module "react-lazyload" {
  import { CSSProperties, ReactNode, FC } from "react";

  interface LazyLoadProps {
    once?: boolean;
    height?: number | string;
    offset?: number | number[];
    overflow?: boolean;
    resize?: boolean;
    scroll?: boolean;
    children?: ReactNode;
    throttle?: number | boolean;
    debounce?: number | boolean;
    placeholder?: ReactNode;
    scrollContainer?: string | Element;
    unmountIfInvisible?: boolean;
    preventLoading?: boolean;
    className?: string;
    classNamePrefix?: string;
    style?: CSSProperties;
  }

  const LazyLoad: FC<LazyLoadProps>;
  export default LazyLoad;

  export function lazyload(option: object): void;
  export function forceCheck(): void;
  export function forceVisible(): void;
}
