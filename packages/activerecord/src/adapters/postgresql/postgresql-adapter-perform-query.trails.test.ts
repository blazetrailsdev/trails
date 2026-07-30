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
import { it, expect, beforeEach, afterEach, vi } from "vitest";
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
    vi.restoreAllMocks();
    await adapter.exec(`DROP TABLE IF EXISTS pq`);
    await adapter.close();
  });

  function preventWrites(a: PostgreSQLAdapter): void {
    (
      a as PostgreSQLAdapter & { pool: { preventWrites?: boolean; connectionDescriptor?: unknown } }
    ).pool = {
      preventWrites: true,
      connectionDescriptor: { name: "ActiveRecord::Base" },
    };
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

  it("executeMutation sources affected rows through the affectedRows port", async () => {
    await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('a')`);
    await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('b')`);
    await adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('c')`);

    // The count comes from the statement's own PG::Result (cmd_tuples), read
    // via the affectedRows port — no cross-statement state.
    expect(await adapter.executeMutation(`UPDATE pq SET nick = 'z' WHERE nick <> 'a'`)).toBe(2);
    expect(await adapter.executeMutation(`UPDATE pq SET nick = 'y' WHERE nick = 'nope'`)).toBe(0);
    expect(await adapter.executeMutation(`DELETE FROM pq`)).toBe(3);
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

  it("re-applies the session timezone on a reconnected session", async () => {
    // update_typemap_for_default_timezone is guarded on @mapped_default_timezone
    // (postgresql_adapter.rb:1094). A reconnect opens a fresh session at
    // PostgreSQL's default timezone, so the cache must be cleared in
    // configure_connection (:1112) or the guard would skip reconfiguring it.
    await adapter.execute(`SELECT 1`); // maps the timezone for the first session
    const spy = vi.spyOn(adapter, "reconfigureConnectionTimezone");
    await adapter.reconnect(); // opens a fresh session; configure clears the cache
    await adapter.execute(`SELECT 1`); // fresh session must re-apply the timezone
    expect(spy).toHaveBeenCalled();
  });
});
