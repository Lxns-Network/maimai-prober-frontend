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
    const response = await fetch(`${API_URL}/${endpoint}`, requestOptions);

    if (response.status === 200) {
      const data = await response.json();
      if (data.success) {
        return data.data;
      } else {
        throw data; // 抛出数据以处理错误
      }
    } else {
      throw response; // 抛出响应以处理错误
    }
  } catch (error) {
    return null;
  }
}

export function getProfile() {
  return fetchAPI("user/profile", { method: "GET" });
}

export function getPlayerData() {
  return fetchAPI("user/player", { method: "GET" });
}