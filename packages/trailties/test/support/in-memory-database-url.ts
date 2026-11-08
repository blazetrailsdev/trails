import { afterAll, beforeAll } from "vitest";
import { env, setEnv } from "@blazetrails/ruby-compat";

export function useInMemoryDatabaseUrl(): void {
  let saved: string | undefined;
  beforeAll(() => {
    saved = env.DATABASE_URL;
    setEnv("DATABASE_URL", "sqlite3::memory:");
  });
  afterAll(() => {
    setEnv("DATABASE_URL", saved);
  });
}
