import { fetchAPI } from "./api.ts";

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

export function refreshToken() {
  return new Promise((resolve, reject) => {
    fetchAPI("user/refresh", { method: "GET" })
      .then(res => res.json())
      .then(data => {
        if (!data.success) {
          reject(data.message);
        }
        localStorage.setItem("token", data.data.token);
        resolve(data.data);
      })
      .catch((error) => {
        reject(error);
      });
  });
}