export const API_URL = import.meta.env.VITE_API_URL;

export function getProfile() {
  return fetch(`${API_URL}/user/profile`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${localStorage.getItem("token")}`,
      "Content-Type": "application/json"
    }
  }).then(res => {
    if (res.status === 200) {
      return res.json();
    } else {
      return Promise.reject(res);
    }
  });
}