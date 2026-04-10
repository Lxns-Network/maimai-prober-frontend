import _LazyLoad from "react-lazyload";

// react-lazyload is CJS; in Vite 8 ESM the default import is a namespace object.
const LazyLoad = (typeof _LazyLoad === "function" ? _LazyLoad : (_LazyLoad as unknown as { default: typeof _LazyLoad }).default) as typeof _LazyLoad;

export { forceCheck, forceVisible } from "react-lazyload";
export default LazyLoad;
