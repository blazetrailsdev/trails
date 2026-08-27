import { it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  describeIfMysqlAdapter,
  leaseMysqlAdapter,
  Mysql2Adapter,
} from "../abstract-mysql-adapter/test-helper.js";
import { Base } from "../../base.js";
import { ReadOnlyError } from "../../errors.js";

describeIfMysqlAdapter("Mysql2AdapterPerformQueryTest (trails)", () => {
  let adapter: Mysql2Adapter;

  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
    await adapter.exec(`DROP TABLE IF EXISTS pq`);
    await adapter.exec(`DROP TABLE IF EXISTS pq_ddl`);
    await adapter.exec(
      `CREATE TABLE pq (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, nick varchar(255))`,
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await adapter.exec(`DROP TABLE IF EXISTS pq`);
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

  it("executeMutation returns the driver insert id for a bare INSERT", async () => {
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
    await Base.whilePreventingWrites(async () => {
      await expect(adapter.executeMutation(`INSERT INTO pq (nick) VALUES ('a')`)).rejects.toThrow(
        ReadOnlyError,
      );
    });
  });

  it("does not prevent a read routed through execute while preventing writes", async () => {
    await Base.whilePreventingWrites(async () => {
      await expect(adapter.execute(`SELECT * FROM pq`)).resolves.toEqual([]);
    });
  });
  it("internalExecute prepares when prepare is true", async () => {
    await adapter.internalExecute("SELECT 1", "SQL", [], { prepare: true });
    const pool = adapter._statements;
    expect(pool?.get("SELECT 1")).toBeTruthy();
  });

  it("internalExecute does not prepare when prepare is false", async () => {
    await adapter.internalExecute("SELECT 2", "SQL", [], { prepare: false });
    const pool = adapter._statements;
    expect(pool?.get("SELECT 2")).toBeFalsy();
  });
});
