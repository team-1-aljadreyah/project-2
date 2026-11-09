import axios, { AxiosError, type AxiosResponse } from "axios";
import { API_URL } from "../config";
import { currentLocale } from "../boot";
import { clearToken, getToken } from "../auth";
import { ApiError, NETWORK_ERROR, type ErrorCode } from "./errors";

// Calls to these paths never get the login token.
const PUBLIC_PATHS = ["/auth/login", "/auth/refresh"];

interface Envelope {
  success: boolean;
  data?: unknown;
  message?: string;
  code?: ErrorCode;
  errors?: Record<string, string>;
}

export const http = axios.create({
  baseURL: `${API_URL}/api/v1`,
  timeout: 20_000,
});

// Before each request: add the token (except public paths) and the language for error messages.
http.interceptors.request.use((config) => {
  const isPublic = PUBLIC_PATHS.some((p) => config.url?.startsWith(p));
  const token = getToken();
  if (!isPublic && token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers["Accept-Language"] = currentLocale();
  return config;
});

// After each response: unwrap { success, data }, and turn every failure into an ApiError.
http.interceptors.response.use(
  (res: AxiosResponse<Envelope>) => {
    const body = res.data;
    if (body && body.success === false) {
      throw new ApiError(res.status, body.message ?? "", body.errors, body.code);
    }
    return { ...res, data: body?.success ? body.data : body };
  },
  (err: AxiosError<Envelope>) => {
    if (!err.response) throw new ApiError(NETWORK_ERROR, "", undefined, "NETWORK");
    const { status, data } = err.response;
    if (status === 401) clearToken();
    throw new ApiError(status, data?.message ?? "", data?.errors, data?.code);
  },
);
