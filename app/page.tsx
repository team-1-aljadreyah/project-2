import { USE_MOCK } from "@/lib/config";

// Temporary start page. It will be replaced when the project design is ready.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-3xl font-semibold">Project 2</h1>
      <p className="text-foreground/70">The setup is ready. Pages come next.</p>
      <p className="text-sm text-foreground/50">Data: {USE_MOCK ? "mock (fake)" : "real API"}</p>
    </main>
  );
}
