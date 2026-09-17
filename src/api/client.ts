import axios, { AxiosError } from "axios";
import type { HealthCheck } from "../lib/types";

/** Shared axios instance — all API calls go through Vite proxy at /api */
const apiClient = axios.create({
  baseURL: "/api",
  timeout: 60_000,
  headers: {
    "Content-Type": "application/json",
    // Cloudflare Access returns 401 for expired AJAX sessions instead of a
    // cross-origin login redirect that browsers obscure as a network failure.
    "X-Requested-With": "XMLHttpRequest",
  },
});

/** Request interceptor — could add auth headers here later */
apiClient.interceptors.response.use(
  (response) => {
    if (String(response.headers["content-type"] ?? "").includes("text/html")) {
      throw new AxiosError("API returned an HTML page instead of JSON", "ERR_BAD_RESPONSE",
        response.config, response.request, response);
    }
    return response;
  },
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
  const { data } = await apiClient.get<HealthCheck>("/health", { baseURL: "/" });
  return data;
}

export default apiClient;
