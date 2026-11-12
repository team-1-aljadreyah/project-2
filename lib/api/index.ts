import { USE_MOCK } from "../config";
import { httpApi, type Api } from "./http";

// Pages always use `api`. The .env switch decides if it is the fake or the real backend.
//
// The fake backend (the demo data and all its rules) is big, so it is not part of every page's first load:
// it is fetched the first time a page asks for something, right after the page shows. Every call returns a
// promise anyway, so the pages don't see a difference. (The real backend is just small HTTP calls.)
let mock: Promise<Api> | null = null;
const loadMock = () => (mock ??= import("./mock").then((m) => m.mockApi));
const lazyMock = new Proxy({} as Api, {
  get: (_t, key: string) =>
    (...args: unknown[]) =>
      loadMock().then((m) => (m[key as keyof Api] as (...a: unknown[]) => Promise<unknown>)(...args)),
});

export const api: Api = USE_MOCK ? lazyMock : httpApi;

export { ApiError } from "./errors";
export type { Lookups, ShelfRow, SalesGroup } from "./http";
export type * from "./types";
