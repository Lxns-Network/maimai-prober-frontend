import { logout } from "../session";

export const API_URL = import.meta.env.VITE_API_URL;

interface RequestOptions {
  method: string;
  headers: Record<string, string>;
  body?: string | null;
}

export async function fetchAPI(endpoint: string, options: { method: string, body?: any, headers?: any }) {
  const { method = "GET", body, headers } = options;

  const requestOptions: RequestOptions = {
    method,
    headers: {
      "Authorization": `Bearer ${localStorage.getItem("token")}`,
      "Content-Type": "application/json",
      ...headers,
    },
  };

  if (body) {
    requestOptions.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(`${API_URL}/${endpoint}`, requestOptions)

    if (res.status === 401) {
      logout();
      window.location.reload();
    }

    return res
  } catch (error) {
    return null;
  }
}

export async function getProfile() {
  return fetchAPI("user/profile", { method: "GET" });
}

export async function getPlayerDetail() {
  return fetchAPI("user/player", { method: "GET" });
}

export async function getPlayerScores() {
  return fetchAPI("user/player/scores", { method: "GET" });
}

export async function getUserConfig() {
  return fetchAPI("user/config", { method: "GET" });
}

export async function updateUserConfig(data: any) {
  return fetchAPI("user/config", { method: "POST", body: data });
}