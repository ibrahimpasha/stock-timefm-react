import axios from "axios";
import type { HealthCheck } from "../lib/types";

/** Shared axios instance — all API calls go through Vite proxy at /api */
const apiClient = axios.create({
  baseURL: "/api",
  timeout: 60_000,
  headers: {
    "Content-Type": "application/json",
  },
});

/** Request interceptor — could add auth headers here later */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Server responded with error status
      const msg =
        error.response.data?.detail ||
        error.response.data?.message ||
        error.response.statusText;
      console.error(
        `[API] ${error.response.status}: ${msg}`,
        error.config?.url
      );
    } else if (error.request) {
      // No response received
      console.error("[API] No response from server", error.config?.url);
    } else {
      console.error("[API] Request error", error.message);
    }
    return Promise.reject(error);
  }
);

/** Health check helper — /health is on root, not /api prefix */
export async function fetchHealth(): Promise<HealthCheck> {
  const { data } = await axios.get<HealthCheck>("/health");
  return data;
}

export default apiClient;
