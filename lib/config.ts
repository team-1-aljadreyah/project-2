// Reads the settings from .env (see .env.example).
// The server's address without "/api/v1" (lib/api/axios.ts adds it). Given with it, or with a "/" at the end,
// it is cut off, so "https://api.ama8.uk", "https://api.ama8.uk/" and "https://api.ama8.uk/api/v1" all work.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").trim().replace(/\/+$/, "").replace(/\/api\/v1$/i, "");

// true = fake data from lib/api/mock.ts, false = the real backend.
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";
