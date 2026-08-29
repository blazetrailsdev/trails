import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { InternalMetadata } from "./internal-metadata.js";
import { Base } from "./base.js";
import { fixtures } from "./test-fixtures.js";
import { NullPool } from "./connection-adapters/abstract/connection-pool.js";
import { toSqlAndBinds } from "./connection-adapters/abstract/database-statements.js";
import { Nodes } from "@blazetrails/arel";
import { resetLocalTimeZoneId } from "@blazetrails/date";
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

const FIXED_INSTANT = "2026-07-25T23:25:21.123Z";
const FIXED_UTC = "2026-07-25 23:25:21.123";
const FIXED_LOCAL = "2026-07-25 19:25:21.123";

describe("InternalMetadata#currentTime", () => {
  beforeAll(() => {
    vi.stubEnv("TZ", "America/New_York");
    resetLocalTimeZoneId();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_INSTANT));
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    resetLocalTimeZoneId();
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
  it("reports the table as present after createTable", async () => {
    const internalMetadata = new InternalMetadata(Base.connectionPool());
    await internalMetadata.dropTable();
    expect(await internalMetadata.tableExists()).toBe(false);

    await internalMetadata.createTable();
    expect(await internalMetadata.tableExists()).toBe(true);
  });
});

describe("InternalMetadata#selectEntry", () => {
  it("sends the key as a bind rather than inlining it", async () => {
    const internalMetadata = new InternalMetadata(Base.connectionPool());
    await internalMetadata.createTable();
    await Base.connectionPool().withConnection(async (connection) => {
      const selectAll = vi.spyOn(connection, "selectAll");
      try {
        await (
          internalMetadata as unknown as {
            selectEntry(c: DatabaseAdapter, key: string): Promise<unknown>;
          }
        ).selectEntry(connection, "environment");
        const sm = selectAll.mock.calls[0][0] as {
          constraints: { right: unknown }[];
        };
        const right = sm.constraints[0].right as Nodes.BindParam;
        expect(right).toBeInstanceOf(Nodes.BindParam);
        expect(right.value).toBe("environment");

        if ((connection as unknown as { preparedStatements?: boolean }).preparedStatements) {
          const [sql, binds] = toSqlAndBinds.call(connection as never, sm as never);
          expect(sql).not.toContain("environment");
          expect(binds).toEqual(["environment"]);
        }
      } finally {
        selectAll.mockRestore();
      }
    });
  });
});

describe("InternalMetadata built over a NullPool", () => {
  it("reads as disabled", () => {
    expect(new InternalMetadata(new NullPool()).enabled).toBeFalsy();
  });

  it("raises NoMethodError rather than silently no-opping on a write", async () => {
    const internalMetadata = new InternalMetadata(new NullPool());
    await expect(internalMetadata.deleteAllEntries()).rejects.toThrow(
      /undefined method 'withConnection'/,
    );
  });

  it("raises NoMethodError from tableExists", async () => {
    const internalMetadata = new InternalMetadata(new NullPool());
    await expect(internalMetadata.tableExists()).rejects.toThrow(
      /undefined method 'data_source_exists\?' for nil/,
    );
  });
});
