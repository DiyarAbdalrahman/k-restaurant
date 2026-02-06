// frontend/lib/api.js
import axios from "axios";
import { getToken } from "./auth";

const envBackendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "";

let fallbackBackendUrl = "http://localhost:4000";
if (typeof window !== "undefined") {
  const host = window.location.hostname;
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    fallbackBackendUrl = `https://api.${host}`;
  }
}

export const BACKEND_URL = envBackendUrl || fallbackBackendUrl;

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    if (status === 401 && typeof window !== "undefined") {
      const url = err?.config?.url || "";
      const isAuthCall =
        url.includes("/auth/login") ||
        url.includes("/auth/pin-login") ||
        url.includes("/auth/register");
      const isOnLogin = window.location.pathname === "/login";
      if (isAuthCall || isOnLogin) {
        return Promise.reject(err);
      }
      try {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      } catch {}
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
