import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectionNotEstablished } from "../errors.js";
import { Mysql2Adapter } from "./mysql2-adapter.js";

describe("Mysql2Adapter#connect", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stamps the adapter's pool onto a ConnectionNotEstablished", async () => {
    const error = new ConnectionNotEstablished("connection refused");
    const adapter = new Mysql2Adapter({ host: "localhost" });
    const pool = {};
    adapter.pool = pool as never;
    vi.spyOn(adapter as never, "_ensureClient" as never).mockRejectedValue(error as never);

    await expect(adapter.connect()).rejects.toBe(error);
    expect(error.connectionPool).toBe(pool);
  });
});
