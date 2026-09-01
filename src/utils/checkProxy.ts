import { API_URL } from "@/utils/api/api.ts";

const PROXY_CHECK_URL = "https://proxy.maimai.lxns.net:8080/check";
const WAHLAP_CHECK_URL = "https://maimai.wahlap.com/maimai-mobile/error/";
const PROBE_TIMEOUT_MS = 5000;

export type ProxyCheckStatus =
  | "available"
  | "network_error"
  | "not_configured"
  | "route_missing"
  | "unverified";

interface ProxyMarker {
  via_proxy?: boolean;
  nonce?: string;
}

const fetchWithTimeout = async (input: RequestInfo | URL, init?: RequestInit) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const checkAPI = async (nonce: string) => {
  try {
    const response = await fetchWithTimeout(
      `${API_URL}/health?nonce=${encodeURIComponent(nonce)}`,
      {
        cache: "no-store",
        credentials: "omit",
      },
    );
    return response.ok;
  } catch {
    return false;
  }
};

const checkProxyMarker = async (nonce: string) => {
  try {
    const url = new URL(PROXY_CHECK_URL);
    url.searchParams.set("nonce", nonce);
    const response = await fetchWithTimeout(url, {
      cache: "no-store",
      credentials: "omit",
    });
    if (!response.ok) return false;
    const marker = (await response.json()) as ProxyMarker;
    return marker.via_proxy === true && marker.nonce === nonce;
  } catch {
    return false;
  }
};

const checkWahlapRoute = async (nonce: string) => {
  try {
    const url = new URL(WAHLAP_CHECK_URL);
    url.searchParams.set("nonce", nonce);
    await fetchWithTimeout(url, {
      cache: "no-store",
      credentials: "omit",
      mode: "no-cors",
    });
    return true;
  } catch {
    return false;
  }
};

/**
 * Checks API reachability, verifies the configured LXNS proxy, and confirms that Wahlap traffic uses it.
 */
export const checkProxy = async (): Promise<ProxyCheckStatus> => {
  const nonce = window.crypto.randomUUID();
  const [apiAvailable, proxyVerified, wahlapDirectlyReachable] = await Promise.all([
    checkAPI(nonce),
    checkProxyMarker(nonce),
    checkWahlapRoute(nonce),
  ]);

  if (!apiAvailable) return "network_error";
  if (proxyVerified) return wahlapDirectlyReachable ? "route_missing" : "available";
  if (wahlapDirectlyReachable) return "not_configured";
  return "unverified";
};
