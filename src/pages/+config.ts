import vikeReact from "vike-react/config";
import type { Config } from "vike/types";

export default {
  extends: [vikeReact],
  lang: "zh-Hans",
  ssr: false,
  prerender: false,
  trailingSlash: false,
} satisfies Config;
