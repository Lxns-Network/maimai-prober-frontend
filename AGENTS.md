# AGENTS.md

Operational guidelines and architectural ground truth for the **maimai-prober** frontend: Vike (`vike-react`), React 19, TypeScript, Mantine v9, TanStack Query v5, Zustand v4.

---

## 1. Commands & Verification

Package manager: **Yarn 4** (`yarn@4.13.0`). Use Node.js from `.node-version`. Verify behavior changes via `test`, `build`, `lint`, `format:check`, `stylelint`, and `dev`. CI runs formatting, Oxlint with zero warnings, CSS lint, regression tests, and build.

### Core Development Commands

- `yarn dev` — Starts Vite dev server (`0.0.0.0:3000`). Reverse proxies `/api` to `API_TARGET` (default: `http://localhost:7000`).
- `yarn build` — Runs `yarn typecheck` then `vite build`. Type errors fail build immediately. Emits client assets and `dist/client/version.json`.
- `yarn typecheck` — Checks application, tests, and Vite/Vitest configuration types.
- `yarn test` — Runs Vitest regression tests in `tests/` with mocked network and storage.
- `yarn lint` — Oxlint checks `src/`, `packages/`, `tests/`, and Vite/Vitest configuration. Any warning or unused disable directive fails. Rules live in `.oxlintrc.json`; formatting stays in Oxfmt and CSS rules in Stylelint.
- `yarn format` / `yarn format:check` — Formats or verifies code using `oxfmt`.
- `yarn stylelint` — Lints CSS stylesheets (`src/**/*.css --cache`).
- `yarn preview` — Serves production build locally via Vite preview.

### Chart Performance & Audit Suite

- `yarn chart:bench` — Headless benchmark (`node scripts/chart-bench.mjs --stress --prod`) on synthetic 240 BPM stress chart ([src/pages/public/Chart/bench/stressChart.ts](src/pages/public/Chart/bench/stressChart.ts)); writes JSON report to `--out`.
- `yarn chart:bench:paired --baseline <checkout>` — Interleaves AB/BA rounds within same Chromium instance (95% confidence intervals). **Only valid metric for verifying renderer performance changes**.
- `yarn chart:fill` — Canvas 2D overdraw audit (`node scripts/chart-fill-audit.mjs`). Intercepts `drawImage` to calculate device-pixel fill; deterministic and immune to GPU throttling.
- `yarn chart:visual --out <dir> [--compare <dir>]` — Captures and compares pixel-level screenshots across 13 fixed timestamps (`node scripts/chart-visual-regression.mjs`).

---

## 2. Environment Variables

Defined in `.env` / `.env.local` / `.env.production`:

- `VITE_API_URL` — Client API base URL (`http://localhost:3000/api/v0` in dev, `https://maimai.lxns.net/api/v0` in prod).
- `API_TARGET` — Dev server proxy target for `/api` (default: `http://localhost:7000`).
- `VITE_ASSET_URL` — Static asset CDN host (e.g. `https://assets.lxns.net`).
- `VITE_CAPTCHA_ENDPOINT` — Turnstile/Captcha verification endpoint (e.g. `https://cap.lxns.net/...`).
- `VITE_VIDEO_DIR` — Local directory for `{song_id}.mp4` served by Vite middleware at `/__video/`.
- `VITE_CHART_BENCH` — Set to `"1"` by benchmark scripts to enable profiling hooks in prod builds and disable Sentry sourcemaps.
- `SENTRY_UPLOAD` — Set to `"1"` to opt into Sentry build uploads; release CI supplies this flag and `SENTRY_AUTH_TOKEN`.
- `VITE_UMAMI_SCRIPT_URL` — Umami analytics script URL.
- `VITE_UMAMI_WEBSITE_ID` — Umami website tracking ID.
- `FRONTEND_VERSION` / `GITHUB_SHA` — Build metadata injected into `__BUILD_VERSION__` and `__BUILD_COMMIT__`.
- `CHART_BENCH_PLAYWRIGHT` — Optional custom directory containing installed Playwright packages for benchmark scripts.

---

## 3. Routing & Directory Conventions

### Vike File Conventions

Routing is file-based under `src/pages/`:

- `+Page.tsx` — Page screen component.
- `+route.ts` — Custom route path definition.
- `+config.ts` — Page/layout configuration (`ssr`, `prerender`, etc.).
- `+data.ts` — Data loading hook.
- `+Layout.tsx` — Layout hierarchy wrapper.
- `+client.ts` — Client-side startup hook (Sentry initialization, analytics).
- `+Head.tsx` — Global and per-route `<head>` document tags.

Root `src/pages/+config.ts` sets global defaults: `ssr: false`, `prerender: false`, `lang: "zh-Hans"`, `trailingSlash: false`. Path alias `@/` maps to `src/` (configured in `tsconfig.json` and `vite.config.ts`).

### Route Entry Points vs. Screen Implementations (Critical Boundary)

- **Entry points (`+Page.tsx`) ONLY exist under:**
  - `src/pages/(csr)/` — 21 CSR routes for dynamic and authenticated pages.
  - `src/pages/(ssg)/` — Prerendered static pages (`(ssg)/index/+Page.tsx` landing page, `(ssg)/docs/+Page.tsx` documentation).
  - `src/pages/_error/+Page.tsx` — Global error boundary page.
- **Implementation directories contain ZERO `+Page.tsx` files:**
  - `src/pages/` subdirectories (`user/`, `admin/`, `public/`, `alias/`, `developer/`, `notifications/`) contain screen components.
  - Routes under `(csr)/<path>/+Page.tsx` are thin shells importing screen implementations wrapped in `<RouteGuard>` (e.g. `export default () => <RouteGuard><Scores /></RouteGuard>`).
  - **Never create `+Page.tsx` directly inside implementation directories (`src/pages/user/`, `src/pages/admin/`, etc.).**

---

## 4. Architecture & State Management

### Dual-Game Model

Supports **maimai DX** (`maimai`) and **CHUNITHM** (`chunithm`). Active game is managed by `useGame()` ([src/hooks/useGame.ts](src/hooks/useGame.ts)), synced with `?game=`. All API endpoints and TanStack Query keys must be namespaced (`user/${game}/...` or `${game}/...`).

### Server State & API Layer (TanStack Query)

Configured in [src/lib/queryClient.ts](src/lib/queryClient.ts) with keys centralized in [src/hooks/queries/queryKeys.ts](src/hooks/queries/queryKeys.ts); hooks live in `src/hooks/queries/` and `src/hooks/mutations/`. Network requests pass through `fetchAPI()` / `uploadFile()` in [src/utils/api/api.ts](src/utils/api/api.ts).

Two query conventions in [src/hooks/queries/queryFn.ts](src/hooks/queries/queryFn.ts): `defaultQueryFn` unwraps `{ success, data, message, code }` envelopes (most `/user/*` endpoints, throws `APIError`); `resourceQueryFn` handles direct payloads without envelope (public `/{game}/song/*`, HTTP errors parsed into `APIError` from [src/utils/errors.ts](src/utils/errors.ts)).

### Authentication & Permissions

- JWT stored in `localStorage` under key `"token"`.
- Proactive token refresh: `fetchAPI` checks expiry with `TOKEN_REFRESH_BUFFER_MS = 30 * 1000`. Concurrent requests share single `refreshPromise` with `REFRESH_RETRY_DELAYS = [300, 1000]`.
- Session expiry: 401/403 or failed refresh triggers `redirectExpiredSessionToLogin()` ([src/utils/session.ts](src/utils/session.ts)), flagging `sessionStorage` and redirecting to `/login?redirect=...`.
- Bitmask permissions in [src/utils/session.ts](src/utils/session.ts): `User = 1 << 0`, `Developer = 1 << 1`, `Administrator = 1 << 2`; checked via `checkPermission(permission)`: `(payload.permission & permission) !== 0`.

### Client State & Song Metadata Caching (Zustand)

- Global client stores named `src/hooks/use*Store.ts`.
- `useSongListStore` ([src/hooks/useSongListStore.ts](src/hooks/useSongListStore.ts)) holds `MaimaiSongList` and `ChunithmSongList` ([src/utils/api/song/](src/utils/api/song/)).
- Metadata cached in `localStorage` under flat keys `{game}_songs` and `{game}_songs_hash` from `/site/config`. Re-fetched only when hash changes; loaded during startup in `src/pages/+Layout.tsx`.

### UI Stack & Deployment Versioning

- Providers in `src/pages/+Layout.tsx`: `MantineProvider` (primary color dynamic via `useThemeColor`), `ModalsProvider`, `Notifications`, `PhotoProvider`, and `ErrorBoundary`. Icons from `@tabler/icons-react` and `@mdi/js`.
- Build emits `dist/client/version.json`. In production, `useVersionChecker` ([src/hooks/useVersionChecker.tsx](src/hooks/useVersionChecker.tsx)) (default 60000ms polling, prod only, refetch on window focus) alerts users to reload.

---

## 5. Chart Engine & Preview Architecture

Located at `src/pages/public/Chart/`, using workspace package `@lxns-network/maimai-chart-engine` ([packages/maimai-chart-engine](packages/maimai-chart-engine), `workspace:*`).

### Strict Ownership Boundaries

1. **`ChartCanvas.tsx`** owns canvas DOM, renderer lifecycle, DPR/resizing, and render loop. All browser side effects live in hooks under `src/pages/public/Chart/components/ChartCanvas/hooks/`.
2. **`usePreviewAudio.ts`** exclusively owns music playback, audible output clock, seek handoff, and answer-sound scheduling. No parallel clocks. Store's `timeline.preciseTime` is a paused snapshot; `playbackTimeRef.current` is the active live playhead.
3. **`AudioManager`** in chart engine only loads, prepares, and schedules answer sounds / SFX; never owns music playback or React state.
4. **`TimingTimeline`** (`TimingTimeline.ts`, wrapped by `src/pages/public/Chart/utils/timeConversion.ts`) is canonical beat/ms conversion primitive. Hot paths must reuse precomputed instances instead of open-coding BPM searches.
5. **Background video sync** (`/__video/{song_id}.mp4`) is best-effort visual media follower and must never become a timing source.
6. **Seek handoff** is an atomic schedule: stop old node, compute target time once, schedule new `AudioBufferSourceNode` at `AudioContext.currentTime + 0.05`, hold visual playhead at target during lead-in, and switch back to audio clock once audible. Never reintroduce `playbackStartTime` or `playbackStartPositionMs`.

### Performance Measurement Policy

Never judge performance visually or eyeball FPS. `MainRenderer` instruments CPU timing per stage (`setProfilingEnabled` / `takeFrameProfile`), visible via `/chart` DEV overlay. Follow methodology in [src/pages/public/Chart/bench/README.md](src/pages/public/Chart/bench/README.md): use `yarn chart:bench:paired --baseline <checkout>` for optimizations, `yarn chart:fill` for overdraw, and `yarn chart:visual` for regressions.

---

## 6. Repository Relationships & Skills

- **Sibling Backend Repository**: The Go backend lives in [Lxns-Network/maimai-prober](https://github.com/Lxns-Network/maimai-prober) (conventionally checked out at `../maimai-prober`) and does not maintain its own changelog.
- **Unified Changelog (`public/docs/changelog.md`)**: Single changelog covering user-visible changes across both frontend and Go backend. Follow [.agents/skills/changelog/SKILL.md](.agents/skills/changelog/SKILL.md) (authoritative source). Record only observable external behavioral differences for players or third-party developers; never internal refactorings, CI/CD tweaks, dependency bumps, benchmark changes, or invisible fixes. Merge unreleased fixes into existing entries.
- **Code Comments Standard**: Follow [.agents/skills/code-comments/SKILL.md](.agents/skills/code-comments/SKILL.md) (authoritative source). Treat functions as black boxes: caller-facing contracts belong outside the function in JSDoc (`/** ... */`) documenting non-obvious details (`@throws`, side effects, ordering constraints, disposal requirements). Avoid internal comments unless explaining critical, non-obvious engineering context (physical constants, browser quirks, hardware frame budgets) or irreducible "Why". Strictly prohibit syntax restatements, type translations, and commit-style logs or bragging.
