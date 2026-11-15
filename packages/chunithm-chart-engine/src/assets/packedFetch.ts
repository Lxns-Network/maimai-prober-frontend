import { fetchPack } from "./loadAssets";
import { packSlice, type Pack } from "./packFormat";

/** Shares bundle downloads during one resource load. Drop the fetcher after decoding its assets. */
export function createPackedFetch(
  base: string,
  bundles: Readonly<Record<string, string>>,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): typeof fetch {
  const files = new Map(
    Object.entries(bundles).map(([file, bundle]) => [new URL(file, base).href, { file, bundle }]),
  );
  const pending = new Map<string, Promise<Pack>>();
  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const entry = files.get(url);
    if (!entry) return fetcher(input, init);
    signal.throwIfAborted();
    let loading = pending.get(entry.bundle);
    if (!loading) {
      loading = fetchPack(new URL(entry.bundle, base).href, (request) =>
        fetcher(request, { signal, credentials: "omit" }),
      );
      pending.set(entry.bundle, loading);
    }
    const pack = await loading;
    signal.throwIfAborted();
    return new Response(packSlice(pack, entry.file).slice().buffer);
  };
}
