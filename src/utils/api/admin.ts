import { fetchAPI } from "./api.ts";

export async function getWorkers(): Promise<Response> {
  return fetchAPI("user/admin/workers", { method: "GET" });
}

export async function createWorker(data: { name: string }): Promise<Response> {
  return fetchAPI("user/admin/worker", { method: "POST", body: data });
}

export async function updateWorker(workerId: number, data: { name?: string; enabled?: boolean }): Promise<Response> {
  return fetchAPI(`user/admin/worker/${workerId}`, { method: "POST", body: data });
}

export async function deleteWorker(workerId: number): Promise<Response> {
  return fetchAPI(`user/admin/worker/${workerId}`, { method: "DELETE" });
}

export async function getSystemSettings(): Promise<Response> {
  return fetchAPI("user/admin/settings", { method: "GET" });
}

export async function updateSystemSettings(data: Record<string, unknown>): Promise<Response> {
  return fetchAPI("user/admin/settings", { method: "POST", body: data });
}
