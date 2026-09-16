import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL, SQLSubscriber } from "./test-helper.js";
import { QueryAttribute } from "../../relation/query-attribute.js";
import { Value } from "../../type.js";
import { Base } from "../../base.js";
import type { AbstractAdapter } from "../../connection-adapters/abstract-adapter.js";
import { ReadOnlyError, StatementInvalid } from "../../errors.js";

describeIfPg("PostgreSQLAdapterPerformQueryTest (trails)", () => {
  let adapter: PostgreSQLAdapter;
  let connection: AbstractAdapter;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.execute(`DROP TABLE IF EXISTS pq`);
    await adapter.execute(`DROP TABLE IF EXISTS pq_ddl`);
    await adapter.execute(`CREATE TABLE pq (id serial primary key, nick character varying(255))`);
    connection = await Base.leaseConnection();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await adapter.execute(`DROP TABLE IF EXISTS pq`);
    await adapter.disconnectBang();
  });

  it("execute runs a non-row-returning statement and returns no rows", async () => {
    await expect(adapter.execute(`CREATE TABLE pq_ddl (id integer)`)).resolves.toEqual([]);
    await adapter.execute(`DROP TABLE pq_ddl`);
    await expect(adapter.execute(`INSERT INTO pq (nick) VALUES ('a')`)).resolves.toEqual([]);
  });

  it("execute still returns rows for a row-returning statement", async () => {
    await adapter.execute(`INSERT INTO pq (nick) VALUES ('a')`);
    await expect(adapter.execute(`SELECT nick FROM pq`)).resolves.toEqual([{ nick: "a" }]);
  });

  it("update and delete source affected rows through the affectedRows port", async () => {
    await adapter.execute(`INSERT INTO pq (nick) VALUES ('a')`);
    await adapter.execute(`INSERT INTO pq (nick) VALUES ('b')`);
    await adapter.execute(`INSERT INTO pq (nick) VALUES ('c')`);

    expect(await adapter.update(`UPDATE pq SET nick = 'z' WHERE nick <> 'a'`)).toBe(2);
    expect(await adapter.update(`UPDATE pq SET nick = 'y' WHERE nick = 'nope'`)).toBe(0);
    expect(await adapter.delete(`DELETE FROM pq`)).toBe(3);
  });

  it("insert appends RETURNING id and returns the inserted id for a bare INSERT", async () => {
    const id = await adapter.insert(`INSERT INTO pq (nick) VALUES ('a')`);
    expect(id).toBe(1);
    const second = await adapter.insert(`INSERT INTO pq (nick) VALUES ('b')`);
    expect(second).toBe(2);
  });

  it("insert emits one sql.active_record for an INSERT into a table without a primary key", async () => {
    await adapter.execute(`CREATE TABLE pq_ddl (nick character varying(255))`);
    const subscriber = new SQLSubscriber();
    subscriber.start();
    try {
      await adapter.transaction(async () => {
        expect(await adapter.insert(`INSERT INTO pq_ddl (nick) VALUES ('a')`)).toBe(1);
      });
      const inserts = subscriber.logged.filter(([sql]) => sql.startsWith("INSERT"));
      expect(inserts).toEqual([[`INSERT INTO pq_ddl (nick) VALUES ('a')`, "SQL", []]]);
    } finally {
      subscriber.stop();
      await adapter.execute(`DROP TABLE IF EXISTS pq_ddl`);
    }
  });

  it("errors when a write is routed through insert while preventing writes", async () => {
    await Base.whilePreventingWrites(async () => {
      await expect(connection.insert(`INSERT INTO pq (nick) VALUES ('a')`)).rejects.toThrow(
        ReadOnlyError,
      );
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
    await adapter.reconnectBang();
    await adapter.execute(`SELECT 1`);
    expect(spy).toHaveBeenCalled();
  });
  it("configureConnection re-applies session variables through internalExecute on reset, reconnect and discard", async () => {
    const live = new PostgreSQLAdapter({
      connectionString: PG_TEST_URL,
      variables: { statement_timeout: "4321" },
    });
    const subscriber = new SQLSubscriber();
    subscriber.start();
    const expectConfigured = async () => {
      expect(await live.queryValue("SHOW intervalstyle")).toBe("iso_8601");
      expect(await live.queryValue("SHOW statement_timeout")).toBe("4321ms");
    };
    try {
      await expectConfigured();
      await live.resetBang();
      await expectConfigured();
      await live.reconnectBang();
      await expectConfigured();
      await live.disconnectBang();
      await expectConfigured();
      expect(subscriber.logged).toContainEqual(["SET intervalstyle = iso_8601", "SCHEMA", []]);
      expect(subscriber.logged).toContainEqual([
        "SET SESSION statement_timeout TO '4321'",
        "SCHEMA",
        [],
      ]);
    } finally {
      subscriber.stop();
      await live.disconnectBang();
    }
  });

  it("reconfigureConnectionTimezone issues its SET once through rawExecute as SCHEMA", async () => {
    await adapter.execute(`SELECT 1`);
    const subscriber = new SQLSubscriber();
    subscriber.start();
    try {
      await adapter.reconnectBang();
      await adapter.execute(`SELECT 1`);
      const sets = subscriber.logged.filter(([sql]) => sql.startsWith("SET SESSION timezone"));
      expect(sets).toHaveLength(1);
      expect(sets[0][1]).toBe("SCHEMA");
    } finally {
      subscriber.stop();
    }
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

  it("prepareStatement raises StatementInvalid on a bad prepare and records no statement", async () => {
    const sql = "select * from pq_missing_table where id = $1";
    await adapter.withRawConnection({}, async (conn) => {
      await expect(
        adapter.prepareStatement(
          sql,
          [1],
          conn as unknown as Parameters<typeof adapter.prepareStatement>[2],
        ),
      ).rejects.toBeInstanceOf(StatementInvalid);
    });
    expect(adapter._statements.isKey(adapter.sqlKey(sql))).toBe(false);
  });

  it("prepareStatement parses once so the named query reuses the statement", async () => {
    const sql = "select nick from pq where id = $1";
    await adapter.execute(`INSERT INTO pq (nick) VALUES ('a')`);
    const rows = await adapter.execQuery(sql, "SQL", [1], { prepare: true });
    expect(rows.toArray()).toEqual([{ nick: "a" }]);
    expect(adapter._statements.isKey(adapter.sqlKey(sql))).toBe(true);
  });
});
