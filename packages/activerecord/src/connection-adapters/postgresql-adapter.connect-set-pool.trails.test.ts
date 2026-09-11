import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectionNotEstablished } from "../errors.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

describe("PostgreSQLAdapter#connect", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stamps the adapter's pool onto a ConnectionNotEstablished", async () => {
    const error = new ConnectionNotEstablished("connection refused");
    const adapter = new PostgreSQLAdapter({
      adapter: "postgresql",
      database: "trails_test",
    } as never);
    const pool = {};
    adapter.pool = pool as never;
    vi.spyOn(adapter as never, "_acquireFreshClient" as never).mockRejectedValue(error as never);

    await expect(adapter.connect()).rejects.toBe(error);
    expect(error.connectionPool).toBe(pool);
  });
});
