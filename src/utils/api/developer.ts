import { fetchAPI, uploadFile } from "./api.ts";

export async function sendDeveloperApply(data: object): Promise<Response> {
  return fetchAPI(`user/developer/apply`, { method: "POST", body: data });
}

export async function resetDeveloperApiKey(): Promise<Response> {
  return fetchAPI("user/developer/reset", { method: "POST" });
}

export async function updateDeveloperInfo(data: object): Promise<Response> {
  return fetchAPI("user/developer", { method: "PUT", body: data });
}

export async function uploadOAuthAppLogo(file: File): Promise<Response> {
  return uploadFile("user/developer/oauth/upload-app-logo", file);
}

export async function createOAuthApp(data: object): Promise<Response> {
  return fetchAPI("user/developer/oauth/app", { method: "POST", body: data });
}

export async function editOAuthApp(clientId: string, data: object): Promise<Response> {
  return fetchAPI(`user/developer/oauth/app/${clientId}`, { method: "POST", body: data });
}

export async function deleteOAuthApp(clientId: string): Promise<Response> {
  return fetchAPI(`user/developer/oauth/app/${clientId}`, { method: "DELETE" });
}

export async function getDevelopers(): Promise<Response> {
  return fetchAPI("user/admin/developers", { method: "GET" });
}

export async function revokeDeveloper(data: object): Promise<Response> {
  return fetchAPI("user/admin/developer", { method: "DELETE", body: data });
}
