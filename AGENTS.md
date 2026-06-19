# AGENTS.md

This file provides guidance to AI agents (Claude Code and others) working in this repository. The conventions below apply to all agents.

This is the **maimai-prober** frontend: a Vike (vike-react) React 19 + TypeScript app. UI is built with Mantine v9, server state with TanStack Query, client state with Zustand.

## Common commands

The package manager is **Yarn 4** (`yarn@4.13.0`). Do not use npm.

- `yarn dev` — start the Vite dev server (`0.0.0.0:3000`). `/api` is proxied to `API_TARGET` (defaults to `http://localhost:7000`).
- `yarn build` — runs `tsc` (type check) then `vite build`. Type errors fail the build.
- `yarn lint` — ESLint with `--max-warnings 0` (any warning fails).
- `yarn format` / `yarn format:check` — oxfmt format / check.
- `yarn stylelint` — lint `src/**/*.css`.

There is **no test runner configured** (no test script, no vitest/jest), so there is no unit-test command. Verify changes with `yarn build` (types) + `yarn lint` + manually running `yarn dev`.

Environment variables (`.env`): `VITE_API_URL` (API base), `API_TARGET` (dev proxy target), `VITE_VIDEO_DIR` (optional local video dir for dev).

## Architecture

The "big picture" — the parts that require reading several files to understand:

**Vike file-based routing.** This is not a plain SPA, and not Next.js. Routes live under `src/pages/` using filename conventions: `+Page.tsx` (page), `+route.ts` (route), `+config.ts` (config), `+data.ts` (data loading), `+Layout.tsx` (layout). Pages are grouped by parentheses:

- `(csr)/` — purely client-side rendered (`ssr: false`, `prerender: false`); all authenticated pages live here.
- `(ssg)/` — prerendered (`prerender: true`), e.g. `docs/` is statically generated from markdown.

The root `src/pages/+config.ts` sets `ssr: false` and `lang: zh-Hans` globally.

**Dual-game model.** The app serves both maimai DX (`maimai`) and CHUNITHM (`chunithm`). The current game is stored in localStorage and read/written via `useGame()` ([src/hooks/useGame.ts](src/hooks/useGame.ts), which also reads the `?game=` URL param). **Almost every API path and query key is namespaced by game**: `user/${game}/...`. Follow this convention whenever adding a per-game endpoint.

**Two state layers.**

- _Server state_ uses TanStack Query. [src/lib/queryClient.ts](src/lib/queryClient.ts) installs a global `defaultQueryFn` that treats `queryKey[0]` as the API path and fetches it directly. All query keys are centralized in [src/hooks/queries/queryKeys.ts](src/hooks/queries/queryKeys.ts); query hooks live in `src/hooks/queries/`, mutations in `src/hooks/mutations/`.
- _Client/global state_ uses Zustand, named `src/hooks/use*Store.ts` (song lists, alias lists, score editing, etc.).

**API layer.** `fetchAPI()` in [src/utils/api/api.ts](src/utils/api/api.ts) wraps every request: it prefixes `VITE_API_URL`, attaches the `Bearer` token from localStorage, and refreshes an expired JWT single-flight (`refreshPromise`) before retrying. Uploads go through `uploadFile()` (multipart). There are two response conventions, mapped to two query fns (see [src/hooks/queries/queryFn.ts](src/hooks/queries/queryFn.ts)): `defaultQueryFn` handles the `{ success, data }` envelope (most `/user/*` endpoints), `resourceQueryFn` handles endpoints that return data directly and signal errors via HTTP status (public `/{game}/song/*`). Errors are thrown as `APIError` ([src/utils/errors.ts](src/utils/errors.ts)).

**Auth & permissions.** The JWT is stored in localStorage as `token` and decoded client-side ([src/utils/session.ts](src/utils/session.ts)). Permissions are a **bitmask**: `UserPermission` (`User=1`, `Developer=2`, `Administrator=4`), checked via `checkPermission()`. `+Layout.tsx` watches for token invalidation and redirects to `/login`.

**Song data cache.** `useSongListStore` ([src/hooks/useSongListStore.ts](src/hooks/useSongListStore.ts)) holds `MaimaiSongList` / `ChunithmSongList` class instances. Their `fetch()` caches the full song list in localStorage keyed by a resource hash delivered in the site config — it only refetches when the hash changes. The song lists are loaded on startup in `+Layout.tsx`.

**UI & provider stack.** Mantine v9. All global providers live in [src/pages/+Layout.tsx](src/pages/+Layout.tsx): `MantineProvider` (theme `primaryColor` driven by `useThemeColor`), `ModalsProvider`, `Notifications` (use `@mantine/notifications` to show toasts), `PhotoProvider`, and `ErrorBoundary` (`react-error-boundary`). Icons come from `@tabler/icons-react` and `@mdi/js`.

**Workspace package.** `@lxns-network/maimai-chart-engine` ([packages/maimai-chart-engine](packages/maimai-chart-engine)) is the maimai chart (simai) rendering engine; it exports renderers/core/types/constants and is referenced via a yarn workspace (`workspace:*`).

**Misc.** Path alias `@/` → `src/` (configured in both vite and tsconfig). Sentry handles error monitoring and uploads sourcemaps at build time. The build writes a timestamped `dist/client/version.json`; `useVersionChecker` uses it to prompt users to reload onto a new deploy.

## Code comments

Treat a function as a black box: callers only see the signature and should never have to read the implementation to use it. The job of a comment is to supply what the signature alone cannot.

- **Comments outside the function serve the caller.** Write them in a `/** ... */` block at the start of the function, focusing on what the interface (input/output types, naming) doesn't reveal: when it throws, side effects, call-ordering constraints, when/how an event listener or subscription must be unregistered, etc.
- **The same applies to React `useMemo` / `useEffect` / `useCallback` / custom hooks** — add a comment only when the purpose isn't clear from the name; otherwise leave it out.
- **Avoid comments inside the function body** unless the logic is genuinely complex. When you feel the body needs a comment, first ask whether the code could be written more clearly; only fall back to an in-body comment when there's truly no clearer form.

In one line: **put comments outside the function, not inside, describing what isn't obvious to the caller.**
