/**
 * 同时匹配 `/profile`（预渲染出的静态壳页，供服务器把 `/profile/*` 回退到这里）
 * 与 `/profile/:username`；壳页没有 `username`，页面会从真实 pathname 里读取。
 */
export default function route(pageContext: { urlPathname: string }) {
  const match = pageContext.urlPathname.match(/^\/profile(?:\/([^/]+))?\/?$/);
  if (!match) return false;
  return { routeParams: match[1] ? { username: decodeURIComponent(match[1]) } : {} };
}
