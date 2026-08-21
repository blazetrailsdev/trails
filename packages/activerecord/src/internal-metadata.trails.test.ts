// trails-only InternalMetadata cases — vendor/rails/activerecord/test/cases has
// no internal_metadata_test.rb, so these have no Rails counterpart to mirror.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { InternalMetadata } from "./internal-metadata.js";
import { Base } from "./base.js";
import { fixtures } from "./test-fixtures.js";
import { NullPool } from "./connection-adapters/abstract/connection-pool.js";
import { toSqlAndBinds } from "./connection-adapters/abstract/database-statements.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";

function fakeAdapter(defaultTimezone: string): DatabaseAdapter {
  return { defaultTimezone } as unknown as DatabaseAdapter;
}

type CurrentTimeHost = { currentTime(connection: DatabaseAdapter): string };

const metadataBuiltOverLocalAdapter = new InternalMetadata(
  new NullPool(),
) as unknown as CurrentTimeHost;

function currentTime(defaultTimezone: string): string {
  return metadataBuiltOverLocalAdapter.currentTime(fakeAdapter(defaultTimezone));
}

// 2026-07-25T23:25:21.123Z is 19:25:21.123 in New York — a fixed instant and a
// fixed non-UTC zone, so the utc and local branches differ by a whole 4 hours
// no matter what zone the host (or CI) runs in.
const FIXED_INSTANT = "2026-07-25T23:25:21.123Z";
const FIXED_UTC = "2026-07-25 23:25:21.123";
const FIXED_LOCAL = "2026-07-25 19:25:21.123";

describe("InternalMetadata#currentTime", () => {
  beforeAll(() => {
    vi.stubEnv("TZ", "America/New_York");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_INSTANT));
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("formats as YYYY-MM-DD HH:mm:ss.SSS with no zone designator", () => {
    for (const tz of ["utc", "local"]) {
      expect(currentTime(tz)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
    }
  });

  it("reads the clock the connection's default timezone selects", () => {
    expect(currentTime("utc")).toBe(FIXED_UTC);
    expect(currentTime("local")).toBe(FIXED_LOCAL);
  });
});

fixtures({}, { useTransactionalTests: false });

describe("InternalMetadata built from a connection pool", () => {
  // Regression: `ConnectionPool#internalMetadata` used to hand over the pool's
  // dispatch proxy, whose every member answers a Promise — so `toSql` returned
  // one, `execute` rejected on it, and `tableExists()` swallowed that into a
  // silent `false` even with the table right there.
  it("reports the table as present after createTable", async () => {
    const internalMetadata = new InternalMetadata(Base.connectionPool());
    await internalMetadata.dropTable();
    expect(await internalMetadata.tableExists()).toBe(false);

    await internalMetadata.createTable();
    expect(await internalMetadata.tableExists()).toBe(true);
  });
});

describe("InternalMetadata#selectEntry", () => {
  // `select_entry` wraps the key in `Arel::Nodes::BindParam`
  // (internal_metadata.rb:157), so the key travels as a bind rather than being
  // inlined at compile time. A create+find roundtrip cannot see the difference,
  // so this asserts on the SQL the manager compiles to.
  it("sends the key as a bind rather than inlining it", async () => {
    const internalMetadata = new InternalMetadata(Base.connectionPool());
    await internalMetadata.createTable();
    const connection = await Base.connectionPool().checkout();
    const selectAll = vi.spyOn(connection, "selectAll");
    try {
      await (
        internalMetadata as unknown as {
          selectEntry(c: DatabaseAdapter, key: string): Promise<unknown>;
        }
      ).selectEntry(connection, "environment");
      const [sql, binds] = toSqlAndBinds.call(
        connection as never,
        selectAll.mock.calls[0][0] as never,
      );
      expect(sql).not.toContain("environment");
      expect(binds).toEqual(["environment"]);
    } finally {
      selectAll.mockRestore();
      Base.connectionPool().checkin(connection);
    }
  });
});

describe("InternalMetadata built over a NullPool", () => {
  // `enabled?` is `@pool.db_config.use_metadata_table?`
  // (internal_metadata.rb:35-36) and NullPool's NullConfig answers nil for
  // every key (abstract/connection_pool.rb:17-22), so a pool-less collaborator
  // reads as disabled — it does not fall back to the default.
  it("reads as disabled", () => {
    expect(new InternalMetadata(new NullPool()).enabled).toBeFalsy();
  });

  // NullPool defines no `with_connection`, so the send raises NoMethodError
  // rather than silently doing nothing (abstract/connection_pool.rb:14-51).
  it("raises NoMethodError rather than silently no-opping on a write", async () => {
    const internalMetadata = new InternalMetadata(new NullPool());
    await expect(internalMetadata.deleteAllEntries()).rejects.toThrow(
      /undefined method 'withConnection'/,
    );
  });

  // NullPool#schema_cache answers nil (abstract/connection_pool.rb:38), so
  // `@pool.schema_cache.data_source_exists?` (internal_metadata.rb:108) raises.
  it("raises NoMethodError from tableExists", async () => {
    const internalMetadata = new InternalMetadata(new NullPool());
    await expect(internalMetadata.tableExists()).rejects.toThrow(
      /undefined method 'data_source_exists\?' for nil/,
    );
  });
});
