import { isTokenExpired, isTokenUndefined } from "@/utils/session.ts";
import { mutate } from "swr";

export const API_URL = import.meta.env.VITE_API_URL;

export async function fetchAPI(endpoint: string, options: { method: string, body?: any, headers?: any }) {
  if (!isTokenUndefined() && isTokenExpired()) {
    if (endpoint !== "user/refresh") {
      await mutate("user/refresh");
    }
  }

  const { method = "GET", body, headers } = options;

  return await fetch(`${API_URL}/${endpoint}`, {
    method,
    credentials: "include",
    headers: {
      "Authorization": `Bearer ${localStorage.getItem("token")}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}
