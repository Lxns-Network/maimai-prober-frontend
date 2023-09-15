import { fetchAPI } from "./api";

export async function getProfile() {
  return fetchAPI("user/profile", { method: "GET" });
}

export async function getCrawlStatus() {
  return fetchAPI("user/crawl/status", { method: "GET" });
}

export async function getUserConfig() {
  return fetchAPI("user/config", { method: "GET" });
}

export async function updateUserConfig(data: any) {
  return fetchAPI("user/config", { method: "POST", body: data });
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
      .then(res => res?.json())
      .then(data => {
        if (data?.code === 200) {
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