import { fetchAPI } from "./api.ts";
import type { 
  PasskeyRegisterData, 
  PasskeyAuthenticateData, 
  PasskeyUpdateNameData 
} from "@/types/user";

export async function updateUserProfile(data: unknown) {
  return fetchAPI("user/profile", { method: "POST", body: data });
}

export async function getUserCrawlToken() {
  return fetchAPI("user/crawl/token", { method: "GET" });
}

export async function getCrawlStatus() {
  return fetchAPI("user/crawl/status", { method: "GET" });
}

export async function updateUserConfig(game: string, data: unknown) {
  return fetchAPI(`user/${game}/config`, { method: "POST", body: data });
}

export async function updateUserBind(data: unknown) {
  return fetchAPI("user/bind", { method: "POST", body: data });
}

export async function generateUserToken() {
  return fetchAPI("user/token", { method: "POST" });
}

export async function logoutUser() {
  return fetchAPI("user/logout", { method: "POST" });
}

export async function editUserPassword(data: unknown) {
  return fetchAPI("user/password", { method: "POST", body: data });
}

export async function deleteSelfUser() {
  return fetchAPI("user", { method: "DELETE" });
}

export async function getUsers() {
  return fetchAPI("user/admin/users", { method: "GET" });
}

export async function deleteUsers(data: unknown) {
  return fetchAPI("user/admin/users", { method: "DELETE", body: data });
}

export async function sendBatchEmail(data: unknown) {
  return fetchAPI("user/admin/email", { method: "POST", body: data });
}

export async function updateUser(userId: number, data: unknown) {
  return fetchAPI(`user/admin/user/${userId}`, { method: "POST", body: data });
}

export async function deleteUser(userId: number) {
  return fetchAPI(`user/admin/user/${userId}`, { method: "DELETE" });
}

export async function confirmUserOAuthAuthorize(data: unknown) {
  return fetchAPI("user/oauth/authorize/confirm", { method: "POST", body: data });
}

export async function revokeUserOAuthApp(clientId: string) {
  return fetchAPI(`user/oauth/authorize/app/${clientId}`, { method: "DELETE" });
}

// Passkey APIs
export async function registerPasskey(data: PasskeyRegisterData) {
  return fetchAPI("user/passkeys", { method: "POST", body: data });
}

export async function getPasskeys() {
  return fetchAPI("user/passkeys", { method: "GET" });
}

export async function updatePasskeyName(id: number, data: PasskeyUpdateNameData) {
  return fetchAPI(`user/passkeys/${id}`, { method: "PUT", body: data });
}

export async function deletePasskey(id: number) {
  return fetchAPI(`user/passkeys/${id}`, { method: "DELETE" });
}

export async function authenticatePasskey(data: PasskeyAuthenticateData) {
  return fetchAPI("user/passkey/authenticate", { method: "POST", body: data });
}

export async function getPasskeyChallenge(credentialId: string) {
  return fetchAPI(`user/passkey/challenge?credential_id=${encodeURIComponent(credentialId)}`, { method: "GET" });
}

export async function getPasskeyRegisterChallenge() {
  return fetchAPI("user/passkeys/challenge", { method: "GET" });
}

export async function getPasskeyLoginChallenge() {
  return fetchAPI("user/passkey/challenge", { method: "GET" });
}