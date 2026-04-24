/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/connection_test.rb
 */
import { it, expect, describe, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresqlConnectionTest", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });

  afterEach(async () => {
    await adapter.close();
  });

  it("encoding", async () => {
    const enc = await adapter.encoding();
    expect(enc).toBeTruthy();
  });

  it("collation", async () => {
    const col = await adapter.collation();
    expect(col).toBeTruthy();
  });

  it("ctype", async () => {
    const ct = await adapter.ctype();
    expect(ct).toBeTruthy();
  });

  it("default client min messages", async () => {
    const level = await adapter.clientMinMessages();
    expect(level).toBe("warning");
  });

  it.skip("connection options", async () => {
    // Requires establish_connection with options: "-c geqo=off" and leasing model connections
  });

  it.skip("reset", async () => {
    // Requires reset!() — clears session config and returns connection to clean state
  });

  it.skip("reset with transaction", async () => {
    // Requires reset!() with an open transaction
  });

  it.skip("tables logs name", async () => {
    // Requires SQLSubscriber / ActiveSupport::Notifications query tagging
  });

  it.skip("indexes logs name", async () => {
    // Requires SQLSubscriber / ActiveSupport::Notifications query tagging
  });

  it.skip("table exists logs name", async () => {
    // Requires SQLSubscriber / ActiveSupport::Notifications query tagging
  });

  it.skip("table alias length logs name", async () => {
    // Requires SQLSubscriber / ActiveSupport::Notifications query tagging
  });

  it.skip("current database logs name", async () => {
    // Requires SQLSubscriber / ActiveSupport::Notifications query tagging
  });

  it.skip("encoding logs name", async () => {
    // Requires SQLSubscriber / ActiveSupport::Notifications query tagging
  });

  it.skip("schema names logs name", async () => {
    // Requires SQLSubscriber / ActiveSupport::Notifications query tagging
  });

  it.skip("statement key is logged", async () => {
    // Requires SQLSubscriber payload inspection and prepared statement name tracking
  });

  it.skip("prepare false with binds", async () => {
    // Requires QueryAttribute / Relation::QueryAttribute with prepare: false exec_query path
  });

  it.skip("reconnection after actual disconnection with verify", async () => {
    // Requires verify!() / active?() and fixture connection pool repair infrastructure
  });

  it("set session variable true", async () => {
    const a = new PostgreSQLAdapter({
      connectionString: PG_TEST_URL,
      variables: { debug_print_plan: true },
    });
    try {
      const rows = await a.execQuery("SHOW DEBUG_PRINT_PLAN");
      expect(rows.rows).toEqual([["on"]]);
    } finally {
      await a.close();
    }
  });

  it("set session variable false", async () => {
    const a = new PostgreSQLAdapter({
      connectionString: PG_TEST_URL,
      variables: { debug_print_plan: false },
    });
    try {
      const rows = await a.execQuery("SHOW DEBUG_PRINT_PLAN");
      expect(rows.rows).toEqual([["off"]]);
    } finally {
      await a.close();
    }
  });

  it("set session variable nil", async () => {
    // null means skip SET — value stays at server default, same as a connection with no variables config.
    const baseline = await adapter.execQuery("SHOW DEBUG_PRINT_PLAN");
    const a = new PostgreSQLAdapter({
      connectionString: PG_TEST_URL,
      variables: { debug_print_plan: null },
    });
    try {
      const rows = await a.execQuery("SHOW DEBUG_PRINT_PLAN");
      expect(rows.rows).toEqual(baseline.rows);
    } finally {
      await a.close();
    }
  });

  it("set session variable default", async () => {
    // "default" issues SET SESSION key TO DEFAULT — resets to compile default, same as no config.
    const baseline = await adapter.execQuery("SHOW DEBUG_PRINT_PLAN");
    const a = new PostgreSQLAdapter({
      connectionString: PG_TEST_URL,
      variables: { debug_print_plan: "default" },
    });
    try {
      const rows = await a.execQuery("SHOW DEBUG_PRINT_PLAN");
      expect(rows.rows).toEqual(baseline.rows);
    } finally {
      await a.close();
    }
  });

  it("set session timezone", async () => {
    const a = new PostgreSQLAdapter({
      connectionString: PG_TEST_URL,
      variables: { timezone: "America/New_York" },
    });
    try {
      const rows = await a.execute("SHOW TIME ZONE");
      expect(rows[0]?.TimeZone).toBe("America/New_York");
    } finally {
      await a.close();
    }
  });

  it("get and release advisory lock", async () => {
    const lockId = 52959019;
    const listLocks = `SELECT objid FROM pg_locks WHERE locktype = 'advisory'`;

    const got = await adapter.getAdvisoryLock(lockId);
    expect(got).toBe(true);

    const rows = await adapter.execute(listLocks);
    const found = rows.some((r) => Number(r.objid) === lockId);
    expect(found).toBe(true);

    const released = await adapter.releaseAdvisoryLock(lockId);
    expect(released).toBe(true);

    const rowsAfter = await adapter.execute(listLocks);
    const stillHeld = rowsAfter.some((r) => Number(r.objid) === lockId);
    expect(stillHeld).toBe(false);
  });

  it("release non existent advisory lock", async () => {
    const fakeLockId = 29400750;
    const result = await adapter.releaseAdvisoryLock(fakeLockId);
    expect(result).toBe(false);
  });

  it("non-default minMessages is applied to connection", async () => {
    const a = new PostgreSQLAdapter({ connectionString: PG_TEST_URL, minMessages: "notice" });
    try {
      const level = await a.clientMinMessages();
      expect(level).toBe("notice");
    } finally {
      await a.close();
    }
  });
});

describe("PostgreSQLAdapter constructor validation", () => {
  it("rejects invalid variable key", () => {
    expect(
      () =>
        new PostgreSQLAdapter({ connectionString: PG_TEST_URL, variables: { "bad;key": "val" } }),
    ).toThrow("Invalid PostgreSQL session variable name");
  });

  it("rejects undefined variable value", () => {
    expect(
      () =>
        new PostgreSQLAdapter({
          connectionString: PG_TEST_URL,
          variables: { debug_print_plan: undefined as unknown as null },
        }),
    ).toThrow("must be string | number | boolean | null");
  });

  it("rejects object variable value", () => {
    expect(
      () =>
        new PostgreSQLAdapter({
          connectionString: PG_TEST_URL,
          variables: { debug_print_plan: {} as unknown as string },
        }),
    ).toThrow("must be string | number | boolean | null");
  });

  it("accepts numeric variable value (e.g. statement_timeout: 5000)", async () => {
    let a: PostgreSQLAdapter | undefined;
    try {
      expect(() => {
        a = new PostgreSQLAdapter({
          connectionString: PG_TEST_URL,
          variables: { statement_timeout: 5000 },
        });
      }).not.toThrow();
    } finally {
      await a?.close();
    }
  });

  it("rejects non-plain-object variables", () => {
    expect(
      () =>
        new PostgreSQLAdapter({
          connectionString: PG_TEST_URL,
          variables: new Map() as unknown as Record<string, string>,
        }),
    ).toThrow("variables must be a plain object");
  });
});
