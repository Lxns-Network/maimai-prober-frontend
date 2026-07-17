export type SupportedGame = "maimai" | "chunithm";

const SUPPORTED_GAMES = new Set<SupportedGame>(["maimai", "chunithm"]);
const EXCLUDED_REDIRECT_PATHS = new Set(["/login", "/register"]);

export interface LoginSessionPayload {
  id?: string | number;
  sub?: string | number;
  name?: string;
  permission?: number;
  exp?: number;
}

export function decodeLoginSessionPayload(token: string | null): LoginSessionPayload | null {
  if (!token) return null;

  const encodedPayload = token.split(".")[1];
  if (!encodedPayload) return null;

  try {
    const normalizedPayload = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      "=",
    );
    return JSON.parse(atob(paddedPayload)) as LoginSessionPayload;
  } catch {
    return null;
  }
}

export function getTokenSessionIdentity(token: string | null): string | null {
  if (!token) return null;

  const payload = decodeLoginSessionPayload(token);
  const subject = payload?.sub ?? payload?.id;
  return subject === undefined ? `token:${token}` : `user:${String(subject)}`;
}

export function isTokenSessionExpired(token: string | null, now = Date.now()): boolean {
  const payload = decodeLoginSessionPayload(token);
  return typeof payload?.exp !== "number" || now > payload.exp * 1000;
}

export function parseStoredGame(
  storedValue: string | null,
  fallback: SupportedGame = "maimai",
): SupportedGame {
  if (!storedValue) return fallback;

  let candidate: unknown;
  try {
    candidate = JSON.parse(storedValue);
  } catch {
    candidate = storedValue;
  }

  return typeof candidate === "string" && SUPPORTED_GAMES.has(candidate as SupportedGame)
    ? (candidate as SupportedGame)
    : fallback;
}

export function resolveSameOriginRedirect(redirect: string | null | undefined, origin: string) {
  if (!redirect || !redirect.startsWith("/")) return null;
  const hasControlCharacter = Array.from(redirect).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (/\\|%5c/i.test(redirect) || hasControlCharacter) return null;

  try {
    const target = new URL(redirect, origin);
    const isExcludedPath = Array.from(EXCLUDED_REDIRECT_PATHS).some(
      (path) => target.pathname === path || target.pathname.startsWith(`${path}/`),
    );
    if (target.origin !== origin || isExcludedPath) {
      return null;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}
