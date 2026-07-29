/**
 * trails-only coverage for the unified `perform_query` primitive.
 *
 * Rails' Mysql2 adapter has one SQL primitive, perform_query
 * (mysql2/database_statements.rb:41), which both `execute` and
 * `executeMutation` now delegate to; affected rows come from a separate
 * `affected_rows` read (backed by `_affectedRowsBeforeWarnings`) rather than
 * the statement result. These assert the shared branch, the affected-rows
 * source, the insert-id path (MySQL 8 has no INSERT ... RETURNING, so the id
 * comes from the driver's `insertId`), and that the readonly guard survives the
 * fold on both entry points.
 */
import { it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  describeIfMysqlAdapter,
  leaseMysqlAdapter,
  Mysql2Adapter,
} from "../abstract-mysql-adapter/test-helper.js";
import { ReadOnlyError } from "../../errors.js";

describeIfMysqlAdapter("Mysql2AdapterPerformQueryTest (trails)", () => {
  let adapter: Mysql2Adapter;
  let originalPool: unknown;

  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
    await adapter.exec(`DROP TABLE IF EXISTS pq`);
    await adapter.exec(
      `CREATE TABLE pq (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, nick varchar(255))`,
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // The adapter is the shared leased connection, so the swapped-in
    // prevent-writes pool has to come back off before anything else uses it.
    if (originalPool !== undefined) {
      (adapter as Mysql2Adapter & { pool: unknown }).pool = originalPool;
      originalPool = undefined;
    }
    await adapter.exec(`DROP TABLE IF EXISTS pq`);
  });

  function preventWrites(a: Mysql2Adapter): void {
    originalPool = (a as Mysql2Adapter & { pool: unknown }).pool;
    (
      a as Mysql2Adapter & { pool: { preventWrites?: boolean; connectionDescriptor?: unknown } }
    ).pool = {
      preventWrites: true,
      connectionDescriptor: { name: "ActiveRecord::Base" },
    };
  }

  it("execute runs a non-row-returning statement and returns no rows", async () => {
    // mysql2 returns a ResultSetHeader (no rows array) for DDL and a bare
    // INSERT, so both flow through the public `execute` and come back as [].
    await expect(adapter.execute(`CREATE TABLE pq_ddl (id integer)`)).resolves.toEqual([]);
    await adapter.execute(`DROP TABLE pq_ddl`);
    await expect(adapter.execute(`INSERT INTO pq (nick) VALUES ('a')`)).resolves.toEqual([]);
  });

  it("execute still returns rows for a row-returning statement", async () => {
    await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('a')`);
    await expect(adapter.execute(`SELECT nick FROM pq`)).resolves.toEqual([{ nick: "a" }]);
  });

  it("executeMutation sources affected rows through the affectedRows port", async () => {
    await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('a')`);
    await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('b')`);
    await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('c')`);

    // The count comes from _affectedRowsBeforeWarnings, recorded by
    // perform_query and read back via the affectedRows port.
    expect(await adapter.executeMutation(`UPDATE pq SET nick = 'z' WHERE nick <> 'a'`)).toBe(2);
    expect(await adapter.executeMutation(`UPDATE pq SET nick = 'y' WHERE nick = 'nope'`)).toBe(0);
    expect(await adapter.executeMutation(`DELETE FROM pq`)).toBe(3);
  });

  it("executeMutation returns the driver insert id for a bare INSERT", async () => {
    // MySQL 8 has no INSERT ... RETURNING; the id comes from the driver's
    // insertId on the ResultSetHeader.
    const id = await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('a')`);
    expect(id).toBe(1);
    const second = await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('b')`);
    expect(second).toBe(2);
  });

  it("executeMutation returns affected rows for a multi-row INSERT", async () => {
    expect(await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('a'), ('b'), ('c')`)).toBe(
      3,
    );
  });

  it("errors when a write is routed through executeMutation while preventing writes", async () => {
    // The guard lives in preprocess_query's check_if_write_query, so it reaches
    // every write through the shared primitive.
    preventWrites(adapter);
    await expect(adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('a')`)).rejects.toThrow(
      ReadOnlyError,
    );
  });

  it("does not prevent a read routed through execute while preventing writes", async () => {
    preventWrites(adapter);
    await expect(adapter.execute(`SELECT * FROM pq`)).resolves.toEqual([]);
  });
});
