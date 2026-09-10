import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAPI, refreshAccessToken } from "@/utils/api/api.ts";
import { defaultQueryFn, resourceQueryFn } from "@/hooks/queries/queryFn.ts";
import { QueryClient } from "@tanstack/react-query";
import { createStorage } from "./storage.ts";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorage());
  vi.stubGlobal("window", { setTimeout });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: true, data: [] })));
});

it("can fetch public resources when local storage is unavailable", async () => {
  vi.spyOn(localStorage, "getItem").mockImplementation(() => {
    throw new DOMException("Denied", "SecurityError");
  });
  await expect(fetchAPI("maimai/song/list", { method: "GET" })).resolves.toBeInstanceOf(Response);
  expect(fetch).toHaveBeenCalledOnce();
});

describe("request cancellation", () => {
  it("does not send an already-cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchAPI("user/profile", { method: "GET", signal: controller.signal }),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([defaultQueryFn, resourceQueryFn])(
    "aborts fetch when TanStack cancels a query",
    async (queryFn) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      let requestSignal: AbortSignal | null | undefined;
      const started = deferred<void>();
      vi.mocked(fetch).mockImplementation((_url, options) => {
        requestSignal = options?.signal;
        started.resolve();
        return new Promise((_resolve, reject) => {
          requestSignal?.addEventListener("abort", () => reject(requestSignal?.reason), {
            once: true,
          });
        });
      });
      const queryKey = ["user/profile"];
      const result = client.fetchQuery({ queryKey, queryFn }).catch((error: unknown) => error);
      await started.promise;
      await client.cancelQueries({ queryKey });
      expect(requestSignal?.aborted).toBe(true);
      await result;
      client.clear();
    },
  );

  it("lets a shared refresh finish but skips the cancelled caller's request", async () => {
    const claims = { id: 1, name: "test", permission: 1, exp: 1 };
    localStorage.setItem(
      "token",
      `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`,
    );
    const response = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(response.promise);
    const controller = new AbortController();
    const first = fetchAPI("user/maimai/player", { method: "GET", signal: controller.signal });
    const cancelled = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = fetchAPI("user/chunithm/player", { method: "GET" });
    expect(fetch).toHaveBeenCalledTimes(1);
    controller.abort();
    response.resolve(Response.json({ success: true, data: { token: "new-token" } }));
    await cancelled;
    await second;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith(
      "https://api.example.test/user/chunithm/player",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer new-token" }),
      }),
    );
  });
});

it.each([false, 0, "", null])("sends an explicit falsy JSON body: %j", async (body) => {
  await fetchAPI("user/config", { method: "POST", body });
  expect(fetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
});

it("rejects HTTP failures even when the body claims success", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ success: true, data: [] }, { status: 503 }),
  );
  const client = new QueryClient();
  await expect(
    client.fetchQuery({ queryKey: ["user/profile"], queryFn: defaultQueryFn, retry: false }),
  ).rejects.toMatchObject({ status: 503 });
  client.clear();
});

it("shares concurrent refresh requests", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ success: true, data: { token: "refreshed" } }),
  );
  await Promise.all([refreshAccessToken(), refreshAccessToken(), refreshAccessToken()]);
  expect(fetch).toHaveBeenCalledOnce();
  expect(localStorage.getItem("token")).toBe("refreshed");
});
