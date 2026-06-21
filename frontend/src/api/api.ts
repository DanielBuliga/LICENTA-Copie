import axios from "axios";
import { clearToken, getToken, isTokenExpired } from "./auth";

const baseURL = import.meta.env.VITE_API_BASE_URL as string;

export const api = axios.create({
  baseURL,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token && isTokenExpired(token)) {
    clearToken();
    if (!window.location.pathname.includes("/login")) {
      window.location.assign("/login");
    }
    return config;
  }

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const method = response.config.method?.toUpperCase();
    const url = response.config.url ?? "";
    if (method && ["POST", "PATCH", "PUT", "DELETE"].includes(method) && !url.includes("/notifications")) {
      window.dispatchEvent(new Event("smartplanner:notifications-refresh"));
    }
    return response;
  },
  (error) => {
    if (error?.response?.status === 401) {
      clearToken();
      if (!window.location.pathname.includes("/login")) {
        window.location.assign("/login");
      }
    }

    return Promise.reject(error);
  }
);
