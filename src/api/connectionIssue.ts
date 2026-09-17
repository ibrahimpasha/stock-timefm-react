import axios from "axios";

// Public Access application identifier, not a credential. The team-domain
// link is outside the PWA's navigation cache and returns to the dashboard.
const ACCESS_LOGIN = "https://rough-field-2a03.cloudflareaccess.com/cdn-cgi/access/login/app.bididhilli.com?kid=7f9573224024d99ec58149ae2ee33d17f1419c7aef51dc87a12944f66b59d6d6&redirect_url=%2F";

export function connectionIssue(error: unknown) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  const loginUrl = window.location.hostname === "app.bididhilli.com" ? ACCESS_LOGIN : null;
  if (status === 401) {
    return { message: "Sign-in required. Your data session is unavailable.", loginUrl, status };
  }
  if (status === 403) {
    return { message: "Access denied. Check the account used to sign in.", loginUrl, status };
  }
  if (status && status >= 400) {
    return { message: `Data request failed (HTTP ${status}).`, loginUrl: null, status };
  }
  if (axios.isAxiosError(error) && ["ECONNABORTED", "ETIMEDOUT"].includes(error.code ?? "")) {
    return { message: "The data request timed out. Try again.", loginUrl: null, status };
  }
  if ((axios.isAxiosError(error) && error.response)
      || (error instanceof Error && error.message === "Invalid data-health response")) {
    return { message: "The data endpoint returned an unexpected response.", loginUrl: null, status };
  }
  return {
    message: "Cannot reach the data endpoint. Check your connection or sign in again.",
    loginUrl,
    status,
  };
}
