import type { Api } from "./http";

// Fake backend used while NEXT_PUBLIC_USE_MOCK=true. It must have the same functions as httpApi.
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));

export const mockApi: Api = {
  health: async () => {
    await wait();
    return { status: "ok" };
  },
};
