import { fetchAPI } from "./api";

export async function getProfile() {
  return fetchAPI("user/profile", { method: "GET" });
}

export async function getUserCrawlToken() {
  return fetchAPI("user/crawl/token", { method: "GET" });
}

export async function getCrawlStatus() {
  return fetchAPI("user/crawl/status", { method: "GET" });
}

export async function getUserConfig(game: string) {
  return fetchAPI(`user/${game}/config`, { method: "GET" });
}

export async function updateUserConfig(game: string, data: any) {
  return fetchAPI(`user/${game}/config`, { method: "POST", body: data });
}

export async function updateUserBind(data: any) {
  return fetchAPI("user/bind", { method: "POST", body: data });
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

export async function updateUser(data: any) {
  return fetchAPI("user/admin/user", { method: "POST", body: data });
}

export async function deleteUser(data: any) {
  return fetchAPI("user/admin/user", { method: "DELETE", body: data });
}

export function refreshToken() {
  return new Promise((resolve, reject) => {
    fetchAPI("user/refresh", { method: "GET" })
      .then(res => res.json())
      .then(data => {
        if (data.code === 200) {
          localStorage.setItem("token", data.data.token);
          resolve(true);
        } else {
          reject(false);
        }
      })
      .catch((error) => {
        reject(error);
      });
  });
}