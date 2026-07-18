/**
 * trails-only coverage for the unified `perform_query` primitive.
 *
 * Rails' PostgreSQL adapter has one SQL primitive, perform_query
 * (postgresql/database_statements.rb:135), which both `execute` and
 * `executeMutation` now delegate to; affected rows come from a separate
 * `affected_rows` read rather than the statement result. These assert the
 * shared branch, the affected-rows source, and that PG's RETURNING-append +
 * readonly guard survive the fold.
 */
import { it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { ReadOnlyError } from "../../errors.js";

describeIfPg("PostgreSQLAdapterPerformQueryTest (trails)", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS pq`);
    await adapter.exec(`CREATE TABLE pq (id serial primary key, nick character varying(255))`);
  });

  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS pq`);
    await adapter.close();
  });

  function preventWrites(a: PostgreSQLAdapter): void {
    (a as PostgreSQLAdapter & { pool: { preventWrites?: boolean } }).pool = { preventWrites: true };
  }

  it("execute runs a non-row-returning statement and returns no rows", async () => {
    // node-pg does not throw on a statement with no result columns, so DDL and a
    // bare INSERT flow through the public `execute` and come back as [].
    await expect(adapter.execute(`CREATE TABLE pq_ddl (id integer)`)).resolves.toEqual([]);
    await adapter.execute(`DROP TABLE pq_ddl`);
    await expect(adapter.execute(`INSERT INTO pq (nick) VALUES ('a')`)).resolves.toEqual([]);
  });

  it("execute still returns rows for a row-returning statement", async () => {
    await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('a')`);
    await expect(adapter.execute(`SELECT nick FROM pq`)).resolves.toEqual([{ nick: "a" }]);
  });

  it("affectedRows reports the rows changed by the last write", async () => {
    await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('a')`);
    await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('b')`);

    expect(await adapter.executeMutation(`UPDATE pq SET nick = 'z'`)).toBe(2);
    expect(adapter.affectedRows()).toBe(2);

    // A read leaves the count alone — it tracks the last write, as
    // affected_rows / @last_affected_rows does in Rails.
    await adapter.execute(`SELECT * FROM pq`);
    expect(adapter.affectedRows()).toBe(2);
  });

  it("executeMutation appends RETURNING id and returns the inserted id for a bare INSERT", async () => {
    // use_insert_returning? is true, so a bare INSERT is rewritten to
    // `... RETURNING id` and the first column of the first row is the id.
    const id = await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('a')`);
    expect(id).toBe(1);
    const second = await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('b')`);
    expect(second).toBe(2);
  });

  it("executeMutation returns the inserted id for an explicit INSERT ... RETURNING", async () => {
    const id = await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('a') RETURNING id`);
    expect(id).toBe(1);
  });

  it("executeMutation returns affected rows for UPDATE and DELETE", async () => {
    await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('a')`);
    await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('b')`);
    expect(await adapter.executeMutation(`UPDATE pq SET nick = 'z'`)).toBe(2);
    expect(await adapter.executeMutation(`DELETE FROM pq WHERE nick = 'z'`)).toBe(2);
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
