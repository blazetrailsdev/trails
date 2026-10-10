import { it, expect, beforeEach, afterEach, vi } from "vitest";
import pg from "pg";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import {
  ConnectionFailed,
  ConnectionNotEstablished,
  NoDatabaseError,
  StatementInvalid,
} from "../../errors.js";
import type { PGConnection } from "../../pg/connection.js";
import { pgError } from "../../pg/exceptions.js";
import { PG } from "../../pg/pg.js";
import { fixtures } from "../../test-fixtures.js";

type Stamped = Error & { result: { errorField(fieldcode: number): string | null } | null };

describeIfPg("PG::Error#result (trails)", () => {
  let adapter: PostgreSQLAdapter;

  fixtures([]);

  beforeEach(() => {
    adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await adapter.disconnectBang();
  });

  async function rawConnection(): Promise<PGConnection> {
    await adapter.execute("SELECT 1");
    return (adapter as unknown as { _rawConnection: PGConnection })._rawConnection;
  }

  it("a server error from perform_query carries the SQLSTATE through result", async () => {
    const error = (await adapter
      .execute("SELECT * FROM missing_error_result_table")
      .catch((e: unknown) => e)) as StatementInvalid;
    expect(error).toBeInstanceOf(StatementInvalid);
    const cause = error.cause as Stamped;
    expect(cause).toBeInstanceOf(pg.DatabaseError);
    expect(cause.result?.errorField(PG.PG_DIAG_SQLSTATE)).toBe("42P01");
    expect(Object.keys(cause)).not.toContain("result");
    expect(cause).not.toBeInstanceOf(PG.ConnectionBad);
  });

  it("a server error from prepare is the object node-pg raised", async () => {
    const conn = await rawConnection();
    const error = (await conn
      .prepare("pg_error_result", "SELEC 1")
      .catch((e: unknown) => e)) as Stamped;
    expect(error).toBeInstanceOf(pg.DatabaseError);
    expect((error as unknown as pg.DatabaseError).code).toBe("42601");
    expect(error.result?.errorField(PG.PG_DIAG_SQLSTATE)).toBe("42601");
    expect(Object.prototype.propertyIsEnumerable.call(error, "result")).toBe(false);
  });

  it("a connection-level failure answers a nil result and is a ConnectionBad", async () => {
    const conn = await rawConnection();
    await conn.end();
    const error = (await conn.asyncExec("SELECT 1").catch((e: unknown) => e)) as Stamped;
    expect(error).not.toBeInstanceOf(pg.DatabaseError);
    expect("result" in error).toBe(true);
    expect(error.result).toBeNull();
    expect(error).toBeInstanceOf(PG.ConnectionBad);
    expect(PG.ConnectionBad.isLibpq(error)).toBe(false);
  });

  it("a failed connect is stamped before new_client translates it", async () => {
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    await expect(
      PostgreSQLAdapter.newClient({ host: "localhost", port: 59999, dbname: "nonexistent" }),
    ).rejects.toBeInstanceOf(ConnectionNotEstablished);
    const error = (await (connect.mock.results[0].value as Promise<void>).catch(
      (e: unknown) => e,
    )) as Stamped;
    expect("result" in error).toBe(true);
    expect(error.result).toBeNull();
  });

  it("a severed connection met by a mocked raw query is still a ConnectionFailed", async () => {
    const conn = await rawConnection();
    vi.spyOn(conn, "query").mockRejectedValue(new Error("Connection terminated unexpectedly"));
    const error = await adapter.execute("SELECT 1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConnectionFailed);
    expect((error as Error).cause).toBeInstanceOf(PG.ConnectionBad);
  });

  it("an error raised anywhere else does not answer result", () => {
    expect("result" in new Error("Connection terminated")).toBe(false);
    expect(new Error("Connection terminated")).not.toBeInstanceOf(PG.ConnectionBad);
  });

  it("new_client rescues a driver error and reads the database from conn_params", async () => {
    vi.spyOn(pg.Client.prototype, "connect").mockRejectedValue(
      Object.assign(new Error('database "nope" does not exist'), { name: "error", code: "3D000" }),
    );
    await expect(PostgreSQLAdapter.newClient({ dbname: "nope" })).rejects.toBeInstanceOf(
      NoDatabaseError,
    );
  });

  it("new_client lets an error the driver did not raise propagate unchanged", async () => {
    const error = new TypeError("not a driver error");
    vi.spyOn(pg.Client.prototype, "connect").mockRejectedValue(error);
    expect(await PostgreSQLAdapter.newClient({ dbname: "nope" }).catch((e) => e)).toBe(error);
    expect(error).not.toBeInstanceOf(PG.Error);
  });

  it("is_cached_plan_failure? reads SQLSTATE and source function through result", () => {
    const error = Object.assign(new Error("cached plan must not change result type"), {
      name: "error",
      code: "0A000",
      routine: "RevalidateCachedQuery",
    });
    expect(adapter.isCachedPlanFailure(error as never)).toBe(false);
    expect(adapter.isCachedPlanFailure(pgError(error) as never)).toBe(true);
    expect(adapter.isCachedPlanFailure(pgError(new Error("gone")) as never)).toBe(false);
  });

  it("an Error that merely carries a result is not a PG::Error", () => {
    const error = Object.assign(new Error("not from the driver"), { result: null });
    expect(error).not.toBeInstanceOf(PG.Error);
    expect(pgError(new Error("Connection terminated unexpectedly"))).toBeInstanceOf(PG.Error);
  });
});
