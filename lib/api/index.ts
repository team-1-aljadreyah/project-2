import { USE_MOCK } from "../config";
import { httpApi } from "./http";
import { mockApi } from "./mock";

// Pages always use `api`. The .env switch decides if it is the fake or the real backend.
export const api = USE_MOCK ? mockApi : httpApi;

export { ApiError } from "./errors";
export type * from "./types";
