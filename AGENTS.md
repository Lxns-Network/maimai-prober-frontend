# AGENTS.md

This document provides operational guidelines and architectural ground truth for AI agents working in this repository. Its purpose is to prevent common pitfalls, state machine violations, and invalid assumptions.

This is the **maimai-prober** frontend: a Vike (`vike-react`) React 19 + TypeScript web application. The UI is built with Mantine v9, server state is managed with TanStack Query v5, and client state is managed with Zustand v4.

---

## 1. Commands & Verification

The package manager is **Yarn 4** (`yarn@4.13.0`). Never use `npm` or `pnpm`.

### Core Development Commands

- `yarn dev` — Starts Vite dev server (`0.0.0.0:3000`). Reverse proxies `/api` to `API_TARGET` (default: `http://localhost:7000`).
- `yarn build` — Runs `tsc` (typecheck) followed by `vite build`. Type errors fail the build immediately. Generates client assets and `dist/client/version.json`.
- `yarn lint` — Runs ESLint with `--max-warnings 0`. Any warning causes a failure.
- `yarn format` / `yarn format:check` — Formats or verifies repository code using `oxfmt`.
- `yarn stylelint` — Lints CSS stylesheets (`src/**/*.css --cache`).
- `yarn preview` — Serves the production build locally via Vite preview.

### Chart Performance & Audit Suite

- `yarn chart:bench` — Runs headless stress benchmark (`node scripts/chart-bench.mjs --stress --prod`) against the synthetic 240 BPM stress chart defined in [src/pages/public/Chart/bench/stressChart.ts](src/pages/public/Chart/bench/stressChart.ts). The JSON report is written to `--out` (usage examples use `.bench/score.json`).
- `yarn chart:bench:paired --baseline <checkout>` — Interleaves AB/BA benchmark rounds comparing a baseline checkout and a candidate checkout within the same Chromium instance to cancel thermal drift. **This is the only valid metric for verifying renderer performance PRs** (computes 95% confidence intervals).
- `yarn chart:fill` — Canvas 2D overdraw audit (`node scripts/chart-fill-audit.mjs`). Intercepts `drawImage` to calculate total device-pixel fill area across sampled timestamps. Deterministic and immune to GPU thermal throttling.
- `yarn chart:visual --out <dir> [--compare <dir>]` — Captures and compares pixel-level screenshots across 13 fixed timestamps (`node scripts/chart-visual-regression.mjs`) to detect unintended visual regressions.

### Testing Policy

There is **no test runner configured** (no `test` script, no Vitest / Jest / Mocha). Verify every change using:

1. `yarn build` (strict TypeScript validation)
2. `yarn lint` (ESLint with zero warnings)
3. `yarn format:check` and `yarn stylelint`
4. Running the dev server (`yarn dev`) or the chart benchmark suite where applicable.

---

## 2. Environment Variables

Environment variables are defined in `.env` / `.env.local` / `.env.production`:

| Variable                          | Scope                                           | Description & Default                                                                                                  |
| --------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`                    | Client (`import.meta.env`)                      | Base URL for API requests (`http://localhost:3000/api/v0` in dev, `https://maimai.lxns.net/api/v0` in prod).           |
| `API_TARGET`                      | Dev Server (`process.env`)                      | Target backend server proxied by Vite dev server under `/api` (default: `http://localhost:7000`).                      |
| `VITE_ASSET_URL`                  | Client (`import.meta.env`)                      | Static asset CDN host (e.g. `https://assets.lxns.net`).                                                                |
| `VITE_CAPTCHA_ENDPOINT`           | Client (`import.meta.env`)                      | Turnstile/Captcha verification endpoint (e.g. `https://cap.lxns.net/...`).                                             |
| `VITE_VIDEO_DIR`                  | Dev Server (`process.env`)                      | Optional local directory containing `{song_id}.mp4` background videos served by Vite middleware at `/__video/`.        |
| `VITE_CHART_BENCH`                | Build / Dev (`process.env` & `import.meta.env`) | Set to `"1"` by benchmark scripts to enable profiling hooks in production builds and disable Sentry sourcemap uploads. |
| `VITE_UMAMI_SCRIPT_URL`           | Client (`import.meta.env`)                      | Umami analytics script URL.                                                                                            |
| `VITE_UMAMI_WEBSITE_ID`           | Client (`import.meta.env`)                      | Umami website tracking ID.                                                                                             |
| `FRONTEND_VERSION` / `GITHUB_SHA` | Build (`process.env`)                           | Build metadata injected into `__BUILD_VERSION__` and `__BUILD_COMMIT__` in `vite.config.ts`.                           |
| `CHART_BENCH_PLAYWRIGHT`          | Scripts (`process.env`)                         | Optional custom directory containing installed Playwright packages for benchmark scripts.                              |

---

## 3. Routing & Directory Conventions

### Vike File Conventions

Routing is file-based using Vike conventions under `src/pages/`:

- `+Page.tsx` — Page screen component.
- `+route.ts` — Custom route path definition.
- `+config.ts` — Page or layout configuration (`ssr`, `prerender`, etc.).
- `+data.ts` — Data loading hook.
- `+Layout.tsx` — Layout hierarchy wrapper.
- `+client.ts` — Client-side startup hook (Sentry initialization, analytics).
- `+Head.tsx` — Global and per-route `<head>` document tags.

The root `src/pages/+config.ts` sets global defaults: `ssr: false`, `prerender: false`, `lang: "zh-Hans"`, `trailingSlash: false`.

### Route Entry Points vs. Screen Implementations (Critical Boundary)

Do not confuse Vike route definitions with UI screen implementations:

1. **Route entry points (`+Page.tsx`) ONLY exist under:**
   - `src/pages/(csr)/` — Client-side rendered routes (21 routes, e.g. `(csr)/chart/+Page.tsx`, `(csr)/user/scores/+Page.tsx`). Contains all authenticated and dynamic pages.
   - `src/pages/(ssg)/` — Prerendered static pages (`prerender: true`), currently `(ssg)/index/+Page.tsx` (landing page) and `(ssg)/docs/+Page.tsx` (markdown documentation).
   - `src/pages/_error/+Page.tsx` — Global error boundary page.

2. **Implementation directories contain ZERO `+Page.tsx` files:**
   - Directories directly under `src/pages/` such as `user/`, `admin/`, `public/`, `alias/`, `developer/`, and `notifications/` contain **screen implementation components** (e.g. `src/pages/public/Chart/`, `src/pages/user/Scores/`).
   - A route under `src/pages/(csr)/<path>/+Page.tsx` is typically a minimal wrapper importing the screen implementation and wrapping it in `<RouteGuard>`:

     ```tsx
     import { RouteGuard } from "@/components/RouteGuard";
     import Scores from "@/pages/user/Scores";

     export default function Page() {
       return (
         <RouteGuard>
           <Scores />
         </RouteGuard>
       );
     }
     ```

   - **Never create a `+Page.tsx` file directly inside `src/pages/user/`, `src/pages/admin/`, or other screen directories.**

Path alias `@/` maps to `src/` (configured in both `tsconfig.json` and `vite.config.ts`).

---

## 4. Architecture & State Management

### Dual-Game Model

The application serves both **maimai DX** (`maimai`) and **CHUNITHM** (`chunithm`):

- Active game is stored in `localStorage` and managed by `useGame()` ([src/hooks/useGame.ts](src/hooks/useGame.ts)), which also synchronizes with the `?game=` URL query parameter.
- **Every game-specific API endpoint and TanStack Query key must be namespaced**: `user/${game}/...` or `${game}/...`. Always respect this namespacing when adding per-game functionality.

### Server State & API Layer (TanStack Query)

- Configured in [src/lib/queryClient.ts](src/lib/queryClient.ts).
- All query keys are centralized in [src/hooks/queries/queryKeys.ts](src/hooks/queries/queryKeys.ts). Query hooks live in `src/hooks/queries/`, mutation hooks in `src/hooks/mutations/`.
- All network requests pass through `fetchAPI()` or `uploadFile()` in [src/utils/api/api.ts](src/utils/api/api.ts), which prepends `VITE_API_URL`, manages the `Authorization: Bearer <token>` header, and handles token expiration.
- **Two API response conventions** mapped to two query functions in [src/hooks/queries/queryFn.ts](src/hooks/queries/queryFn.ts):
  1. `defaultQueryFn` — Unpacks `{ success, data, message, code }` envelopes (used by most `/user/*` endpoints). Throws `APIError` if `data.success === false`.
  2. `resourceQueryFn` — Direct payloads without an envelope (used by public `/{game}/song/*` endpoints). Errors are signaled via HTTP status codes and parsed into `APIError`.
- `APIError` is defined in [src/utils/errors.ts](src/utils/errors.ts).

### Authentication & Permissions

- JWT is stored in `localStorage` under key `"token"`.
- Single-flight token refresh: `fetchAPI` checks token expiry with a 30-second buffer (`TOKEN_REFRESH_BUFFER_MS`). Concurrent requests share a single `refreshPromise` with backoff retries (`REFRESH_RETRY_DELAYS = [300, 1000]`).
- Session expiry: A 401/403 or unrefreshable token triggers `redirectExpiredSessionToLogin()` ([src/utils/session.ts](src/utils/session.ts)), storing a flag in `sessionStorage` and redirecting to `/login?redirect=...`.
- Permissions are represented as a **bitmask** ([src/utils/session.ts](src/utils/session.ts)):
  ```ts
  export enum UserPermission {
    User = 1 << 0, // 1
    Developer = 1 << 1, // 2
    Administrator = 1 << 2, // 4
  }
  ```
  Checked via `checkPermission(permission)`: `(payload.permission & permission) !== 0`.

### Client State & Song Metadata Caching (Zustand)

- Global client stores are named `src/hooks/use*Store.ts`.
- `useSongListStore` ([src/hooks/useSongListStore.ts](src/hooks/useSongListStore.ts)) holds `MaimaiSongList` and `ChunithmSongList` instances ([src/utils/api/song/](src/utils/api/song/)).
- **Resource Hash Caching**: The song lists cache full metadata in `localStorage` indexed by resource hashes, under the flat localStorage keys `{game}_songs` and `{game}_songs_hash` (e.g. `maimai_songs` / `maimai_songs_hash`) returned from site configuration (`/site/config`). The full song list is refetched over the network only when the hash changes. Loaded during startup in `src/pages/+Layout.tsx`.

### UI Stack & Deployment Versioning

- Mantine v9: Global providers in `src/pages/+Layout.tsx` include `MantineProvider` (primary color dynamic via `useThemeColor`), `ModalsProvider`, `Notifications` (`@mantine/notifications`), `PhotoProvider` (`react-photo-view`), and `ErrorBoundary` (`react-error-boundary`). Icons come from `@tabler/icons-react` and `@mdi/js`.
- Build timestamp: Writes `dist/client/version.json`. In production, `useVersionChecker` ([src/hooks/useVersionChecker.tsx](src/hooks/useVersionChecker.tsx)) periodically polls this file and alerts the user to reload when a new deployment is published.

---

## 5. Chart Engine & Preview Architecture

The maimai chart preview is located at `src/pages/public/Chart/`. It uses the workspace engine package `@lxns-network/maimai-chart-engine` ([packages/maimai-chart-engine](packages/maimai-chart-engine), referenced via `workspace:*`).

### Strict Ownership Boundaries

Preserve these module boundaries without exception:

1. **`ChartCanvas.tsx` owns the canvas DOM, renderer lifecycle, DPR/resizing, and the render loop.**
   - Keep this component thin.
   - All browser side effects (background video source loading, frame capture, wake lock, renderer settings subscriptions) must live in focused hooks under `src/pages/public/Chart/components/ChartCanvas/hooks/`.
2. **`usePreviewAudio.ts` is the sole owner of music playback, the audible output clock, seek handoff, and answer-sound scheduling.**
   - Never introduce parallel audio clocks or store-level playback anchors.
   - `timeline.preciseTime` in the Zustand store is a paused/snapshot timestamp; during playback, `playbackTimeRef.current` is the only live playhead.
3. **`AudioManager` in the chart engine only loads, prepares, and schedules answer sounds / SFX.**
   - It must never own music playback or React lifecycle state.
4. **`TimingTimeline` is the canonical beat/ms conversion primitive.**
   - Defined in `@lxns-network/maimai-chart-engine` (`TimingTimeline.ts`) and wrapped by `src/pages/public/Chart/utils/timeConversion.ts`.
   - Hot paths in renderers must reuse precomputed timeline instances instead of open-coding BPM searches.
5. **Background video sync is best-effort visual media sync.**
   - It follows the chart/audio playhead (`/__video/{song_id}.mp4`).
   - It must never become the source of truth for preview timing.
6. **Seek handoff during playback is an atomic scheduled handoff:**
   - Stop old music node, compute target time once, schedule the new `AudioBufferSourceNode` slightly in the future (`AudioContext.currentTime + 0.05s`), hold the visual playhead at the target during lead-in, and switch back to the audio output clock once the new source becomes audible.
   - Do not reintroduce deprecated compatibility shims such as `playbackStartTime` or `playbackStartPositionMs`.

### Performance Measurement Policy

- **Never judge rendering performance visually or by eyeballing an FPS counter.**
- `MainRenderer` instruments CPU timing per stage (`setProfilingEnabled` / `takeFrameProfile`), visible via the DEV overlay on `/chart`.
- Follow the methodology in [src/pages/public/Chart/bench/README.md](src/pages/public/Chart/bench/README.md):
  - Use `yarn chart:bench:paired --baseline <checkout>` for evaluating optimizations; absolute benchmark scores fluctuate heavily across sessions and thermal conditions.
  - Use `yarn chart:fill` to identify Canvas 2D fill-rate hotspots.
  - Use `yarn chart:visual` to catch rendering regressions.

---

## 6. Repository Relationships & Skills

### Sibling Backend Repository

- The Go backend lives in a sibling repository: `../maimai-prober` (or `F:\Developments\maimai-prober`).
- The backend does **not** maintain its own user-facing changelog.

### Unified Changelog (`public/docs/changelog.md`)

- `public/docs/changelog.md` is the **single unified changelog** for the entire platform, covering user-visible changes from **both this frontend repository and the Go backend repository**.
- **Changelog Skill**: When writing, updating, or reviewing release notes, follow [.agents/skills/changelog/SKILL.md](.agents/skills/changelog/SKILL.md).
  - Only record changes that produce observable external behavioral differences for end users (players) or third-party developers (e.g. new features, UI flow changes, API protocol adjustments, visible bugfixes).
  - Never record internal refactorings, CI/CD tweaks, dependency bumps, benchmark changes, or invisible fixes.
  - Merge unreleased fixes into existing entries to avoid redundant noise.

### Code Comments Standard

- **Code Comments Skill**: [.agents/skills/code-comments/SKILL.md](.agents/skills/code-comments/SKILL.md) is the **authoritative single source of truth** for all code comment rules, decision trees, and boundary enforcement in this repository.
  - **Core Rule**: Treat functions as black boxes. Caller-facing contracts belong outside the function in JSDoc (`/** ... */`) to document non-obvious details (`@throws`, side effects, ordering constraints, disposal requirements).
  - Avoid comments inside function bodies unless explaining critical, non-obvious engineering context (empirical physical constant derivation, browser/canvas quirks, hardware frame budgets) or irreducible algorithmic "Why".
  - Strictly prohibit syntax restatements, type translations, and commit-style change logs or performance bragging in comments.
