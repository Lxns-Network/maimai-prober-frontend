import { fetchAPI, uploadFile } from "./api.ts";

export async function sendDeveloperApply(data: any) {
  return fetchAPI(`user/developer/apply`, { method: "POST", body: data });
}

export async function resetDeveloperApiKey() {
  return fetchAPI("user/developer/reset", { method: "POST" });
}

export async function uploadOAuthAppLogo(file: File) {
  return uploadFile("user/developer/oauth/upload-app-logo", file);
}

export async function createOAuthApp(data: any) {
  return fetchAPI("user/developer/oauth/app", { method: "POST", body: data });
}

export async function editOAuthApp(clientId: string, data: any) {
  return fetchAPI(`user/developer/oauth/app/${clientId}`, { method: "POST", body: data });
}

export async function deleteOAuthApp(clientId: string) {
  return fetchAPI(`user/developer/oauth/app/${clientId}`, { method: "DELETE" });
}

export async function getDevelopers() {
  return fetchAPI("user/admin/developers", { method: "GET" });
}

export async function revokeDeveloper(data: any) {
  return fetchAPI("user/admin/developer", { method: "DELETE", body: data });
}