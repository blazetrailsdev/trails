/**
 * Faithful port of
 * activerecord/test/cases/connection_adapters/standalone_connection_test.rb.
 *
 * Rails builds the standalone adapter with `db_config.new_connection`; trails'
 * `DatabaseConfig#newConnection` is the same seam, pre-warmed via
 * `loadAdapter()` because ESM adapter resolution is async.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { Base } from "../index.js";
import { establishFromTestConfig } from "../support/connection.js";
import type { AbstractAdapter } from "./abstract-adapter.js";

describe("StandaloneConnectionTest", () => {
  let connection: AbstractAdapter;

  beforeAll(async () => {
    await establishFromTestConfig();
  });

  beforeEach(async () => {
    const dbConfig = Base.connectionDbConfig();
    await dbConfig.loadAdapter();
    connection = dbConfig.newConnection() as AbstractAdapter;
  });

  afterEach(async () => {
    await connection.disconnectBang();
  });

  it("can query", async () => {
    const result = await connection.selectAll("SELECT 1");
    expect(result.rows).toEqual([[1]]);
  });

  it.skip("async fallback", () => {
    // PERMANENT-SKIP: Rails' `select_all("SELECT 1", async: true)` returns a
    // `FutureResult::Complete` from the load_async infrastructure. Trails has
    // not ported FutureResult / load_async (selectAll takes no `async` option);
    // un-skip when that infrastructure lands.
  });

  it("can throw away", () => {
    connection.throwAwayBang();
    expect(connection.active).toBe(false);
  });

  it("can close", async () => {
    await connection.close();
    expect(connection.active).toBe(false);
  });
});
