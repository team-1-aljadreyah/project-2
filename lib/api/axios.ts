import axios, { AxiosError } from "axios";
import { API_URL } from "../config";
import { clearToken, getToken } from "../auth";
import { ApiError, NETWORK_ERROR } from "./errors";

// Calls to these paths never get the login token.
const PUBLIC_PATHS = ["/auth/login", "/auth/register", "/public/"];

export const http = axios.create({
  baseURL: API_URL,
  timeout: 20_000,
});

// Before each request: add the token, except on public paths.
http.interceptors.request.use((config) => {
  const isPublic = PUBLIC_PATHS.some((p) => config.url?.startsWith(p));
  const token = getToken();
  if (!isPublic && token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// After each response: turn every failure into an ApiError.
http.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ message?: string; errors?: Record<string, unknown> }>) => {
    if (!err.response) throw new ApiError(NETWORK_ERROR, "");
    const { status, data } = err.response;
    if (status === 401) clearToken();
    throw new ApiError(status, data?.message ?? "", data?.errors);
  },
);
