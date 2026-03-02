import { fetchAPI } from "./api.ts";
import type {
  PasskeyRegisterData,
  PasskeyAuthenticateData,
  PasskeyUpdateNameData
} from "@/types/user";

export async function updateUserProfile(data: object): Promise<Response> {
  return fetchAPI("user/profile", { method: "POST", body: data });
}

export async function getUserCrawlToken(): Promise<Response> {
  return fetchAPI("user/crawl/token", { method: "GET" });
}

export async function getCrawlStatus(): Promise<Response> {
  return fetchAPI("user/crawl/status", { method: "GET" });
}

export async function updateUserConfig(game: string, data: object): Promise<Response> {
  return fetchAPI(`user/${game}/config`, { method: "POST", body: data });
}

export async function updateUserBind(data: object): Promise<Response> {
  return fetchAPI("user/bind", { method: "POST", body: data });
}

export async function generateUserToken(): Promise<Response> {
  return fetchAPI("user/token", { method: "POST" });
}

export async function logoutUser(): Promise<Response> {
  return fetchAPI("user/logout", { method: "POST" });
}

export async function editUserPassword(data: object): Promise<Response> {
  return fetchAPI("user/password", { method: "POST", body: data });
}

export async function deleteSelfUser(): Promise<Response> {
  return fetchAPI("user", { method: "DELETE" });
}

export async function getUsers(): Promise<Response> {
  return fetchAPI("user/admin/users", { method: "GET" });
}

export async function deleteUsers(data: object): Promise<Response> {
  return fetchAPI("user/admin/users", { method: "DELETE", body: data });
}

export async function sendBatchEmail(data: object): Promise<Response> {
  return fetchAPI("user/admin/email", { method: "POST", body: data });
}

export async function updateUser(userId: number, data: object): Promise<Response> {
  return fetchAPI(`user/admin/user/${userId}`, { method: "POST", body: data });
}

export async function deleteUser(userId: number): Promise<Response> {
  return fetchAPI(`user/admin/user/${userId}`, { method: "DELETE" });
}

export async function confirmUserOAuthAuthorize(data: object): Promise<Response> {
  return fetchAPI("user/oauth/authorize/confirm", { method: "POST", body: data });
}

export async function revokeUserOAuthApp(clientId: string): Promise<Response> {
  return fetchAPI(`user/oauth/authorize/app/${clientId}`, { method: "DELETE" });
}

// Passkey APIs
export async function registerPasskey(data: PasskeyRegisterData): Promise<Response> {
  return fetchAPI("user/passkeys", { method: "POST", body: data });
}

export async function getPasskeys(): Promise<Response> {
  return fetchAPI("user/passkeys", { method: "GET" });
}

export async function updatePasskeyName(id: number, data: PasskeyUpdateNameData): Promise<Response> {
  return fetchAPI(`user/passkeys/${id}`, { method: "PUT", body: data });
}

export async function deletePasskey(id: number): Promise<Response> {
  return fetchAPI(`user/passkeys/${id}`, { method: "DELETE" });
}

export async function authenticatePasskey(data: PasskeyAuthenticateData): Promise<Response> {
  return fetchAPI("user/passkey/authenticate", { method: "POST", body: data });
}

export async function getPasskeyRegisterChallenge(): Promise<Response> {
  return fetchAPI("user/passkeys/challenge", { method: "GET" });
}

export async function getPasskeyLoginChallenge(): Promise<Response> {
  return fetchAPI("user/passkey/challenge", { method: "GET" });
}
