import { fetchAPI } from "./api";

export async function sendDeveloperApply(data: any) {
  return fetchAPI(`user/developer/apply`, { method: "POST", body: data });
}

export async function getDeveloperApply() {
  return fetchAPI("user/developer/apply", { method: "GET" });
}

export async function resetDeveloperApiKey() {
  return fetchAPI("user/developer/reset", { method: "POST" });
}

export async function getDevelopers() {
  return fetchAPI("user/admin/developers", { method: "GET" });
}

export async function revokeDeveloper(data: any) {
  return fetchAPI("user/admin/developer", { method: "DELETE", body: data });
}