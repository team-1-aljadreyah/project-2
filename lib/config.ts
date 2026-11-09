// Reads the settings from .env (see .env.example).
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

// true = fake data from lib/api/mock.ts, false = the real backend.
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";
