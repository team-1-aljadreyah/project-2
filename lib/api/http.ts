import { http } from "./axios";
import type { Health } from "./types";

// The real backend. One function for each endpoint.
export const httpApi = {
  health: () => http.get<Health>("/health").then((r) => r.data),
};

export type Api = typeof httpApi;
