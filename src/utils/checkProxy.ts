import { API_URL } from "@/utils/api/api.ts";

const PROXY_CHECK_URL = "https://proxy.maimai.lxns.net:8080/check";
const PROBE_TIMEOUT_MS = 5000;

export type ProxyCheckStatus = "available" | "network_error" | "not_configured" | "unverified";

interface ProxyMarker {
  via_proxy?: boolean;
  nonce?: string;
}

type ProxyMarkerResult = "verified" | "mismatch" | "unreachable";

const fetchWithTimeout = async (input: RequestInfo | URL, init?: RequestInit) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const checkAPI = async () => {
  try {
    const response = await fetchWithTimeout(`${API_URL}/health`, {
      cache: "no-store",
      credentials: "omit",
    });
    return response.ok;
  } catch {
    return false;
  }
};

const checkProxyMarker = async (nonce: string): Promise<ProxyMarkerResult> => {
  try {
    const url = new URL(PROXY_CHECK_URL);
    url.searchParams.set("nonce", nonce);
    const response = await fetchWithTimeout(url, {
      cache: "no-store",
      credentials: "omit",
    });
    if (!response.ok) return "unreachable";
    const marker = (await response.json()) as ProxyMarker;
    if (marker.via_proxy === true && marker.nonce === nonce) return "verified";
    return "mismatch";
  } catch {
    return "unreachable";
  }
};

/**
 * Checks API reachability and verifies the configured LXNS HTTP proxy via its /check marker.
 */
export const checkProxy = async (): Promise<ProxyCheckStatus> => {
  const nonce = window.crypto.randomUUID();
  const [apiAvailable, proxyResult] = await Promise.all([checkAPI(), checkProxyMarker(nonce)]);

  if (!apiAvailable) return "network_error";
  if (proxyResult === "verified") return "available";
  if (proxyResult === "mismatch") return "unverified";
  return "not_configured";
};
