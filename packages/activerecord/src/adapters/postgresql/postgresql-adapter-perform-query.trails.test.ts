import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL, SQLSubscriber } from "./test-helper.js";
import { QueryAttribute } from "../../relation/query-attribute.js";
import { Value } from "../../type.js";
import { Base } from "../../base.js";
import type { AbstractAdapter } from "../../connection-adapters/abstract-adapter.js";
import { ReadOnlyError } from "../../errors.js";

describeIfPg("PostgreSQLAdapterPerformQueryTest (trails)", () => {
  let adapter: PostgreSQLAdapter;
  let connection: AbstractAdapter;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS pq`);
    await adapter.exec(`DROP TABLE IF EXISTS pq_ddl`);
    await adapter.exec(`CREATE TABLE pq (id serial primary key, nick character varying(255))`);
    connection = await Base.leaseConnection();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await adapter.exec(`DROP TABLE IF EXISTS pq`);
    await adapter.close();
  });

  it("execute runs a non-row-returning statement and returns no rows", async () => {
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

    expect(await adapter.executeMutation(`UPDATE pq SET nick = 'z' WHERE nick <> 'a'`)).toBe(2);
    expect(await adapter.executeMutation(`UPDATE pq SET nick = 'y' WHERE nick = 'nope'`)).toBe(0);
    expect(await adapter.executeMutation(`DELETE FROM pq`)).toBe(3);
  });

  it("executeMutation appends RETURNING id and returns the inserted id for a bare INSERT", async () => {
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
    await Base.whilePreventingWrites(async () => {
      await expect(
        connection.executeMutation(`INSERT INTO pq (nick) VALUES ('a')`),
      ).rejects.toThrow(ReadOnlyError);
    });
  });

  it("does not prevent a read routed through execute while preventing writes", async () => {
    await Base.whilePreventingWrites(async () => {
      await expect(connection.execute(`SELECT * FROM pq`)).resolves.toEqual([]);
    });
  });

  it("re-applies the session timezone on a reconnected session", async () => {
    await adapter.execute(`SELECT 1`);
    const spy = vi.spyOn(adapter, "reconfigureConnectionTimezone");
    await adapter.reconnect();
    await adapter.execute(`SELECT 1`);
    expect(spy).toHaveBeenCalled();
  });
  it("internalExecute prepares when prepare is true", async () => {
    const bind = new QueryAttribute("", 1, new Value());
    const subscriber = new SQLSubscriber();
    subscriber.start();
    try {
      await adapter.internalExecute("SELECT $1::integer", "SQL", [bind], {
        prepare: true,
      });
      const payload = subscriber.payloads.find((p) => p["sql"] === "SELECT $1::integer");
      expect(payload?.["statement_name"]).toBeTruthy();
    } finally {
      subscriber.stop();
    }
  });

  it("internalExecute does not prepare when prepare is false", async () => {
    const bind = new QueryAttribute("", 2, new Value());
    const subscriber = new SQLSubscriber();
    subscriber.start();
    try {
      await adapter.internalExecute("SELECT $1::integer + 0", "SQL", [bind], {
        prepare: false,
      });
      const payload = subscriber.payloads.find((p) => p["sql"] === "SELECT $1::integer + 0");
      expect(payload?.["statement_name"]).toBeUndefined();
    } finally {
      subscriber.stop();
    }
  });
});
