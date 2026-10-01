import { it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  describeIfMysqlAdapter,
  leaseMysqlAdapter,
  Mysql2Adapter,
} from "../abstract-mysql-adapter/test-helper.js";
import { asJson, BigDecimal } from "@blazetrails/activesupport";
import { BigIntegerType } from "@blazetrails/activemodel";
import { Base } from "../../base.js";
import { ReadOnlyError, RecordNotUnique } from "../../errors.js";
import type { Mysql2RawResult } from "../../connection-adapters/mysql2/database-statements.js";

describeIfMysqlAdapter("Mysql2AdapterPerformQueryTest (trails)", () => {
  let adapter: Mysql2Adapter;

  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
    await adapter.execute(`DROP TABLE IF EXISTS pq`);
    await adapter.execute(`DROP TABLE IF EXISTS pq_ddl`);
    await adapter.execute(
      `CREATE TABLE pq (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, nick varchar(255))`,
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await adapter.execute(`DROP TABLE IF EXISTS pq`);
  });

  it("execute runs a non-row-returning statement and returns no rows", async () => {
    expect(
      ((await adapter.execute(`CREATE TABLE pq_ddl (id integer)`)) as Mysql2RawResult).rows,
    ).toBeNull();
    await adapter.execute(`DROP TABLE pq_ddl`);
    expect(
      ((await adapter.execute(`INSERT INTO pq (nick) VALUES ('a')`)) as Mysql2RawResult).rows,
    ).toBeNull();
  });

  it("execute still returns rows for a row-returning statement", async () => {
    await adapter.execute(`INSERT INTO pq (nick) VALUES ('a')`);
    expect(((await adapter.execute(`SELECT nick FROM pq`)) as Mysql2RawResult).rows).toEqual([
      ["a"],
    ]);
  });

  it("the driver casts numerics, so castResult reports no column types", async () => {
    const result = await adapter.selectAll(
      `SELECT 1.10 AS scaled, CAST(3 AS DECIMAL(10,0)) AS summed, 9007199254740993 AS big`,
    );
    expect(result.columnTypes).toEqual({});
    const [scaled, summed, big] = result.rows[0];
    expect(scaled).toBeInstanceOf(BigDecimal);
    expect((scaled as BigDecimal).toString()).toBe(new BigDecimal("1.10").toString());
    expect(summed).toBe(3);
    expect(big).toBe(9007199254740993n);
    expect(new BigIntegerType({ limit: 8 }).cast(big)).toBe(9007199254740993n);
    expect(asJson([summed, big])).toEqual([3, "9007199254740993"]);
  });

  it("update and delete source affected rows through the affectedRows port", async () => {
    await adapter.execute(`INSERT INTO pq (nick) VALUES ('a')`);
    await adapter.execute(`INSERT INTO pq (nick) VALUES ('b')`);
    await adapter.execute(`INSERT INTO pq (nick) VALUES ('c')`);

    expect(await adapter.update(`UPDATE pq SET nick = 'z' WHERE nick <> 'a'`)).toBe(2);
    expect(await adapter.update(`UPDATE pq SET nick = 'y' WHERE nick = 'nope'`)).toBe(0);
    expect(await adapter.delete(`DELETE FROM pq`)).toBe(3);
  });

  it("insert returns the driver insert id for a bare INSERT", async () => {
    const id = await adapter.insert(`INSERT INTO pq (nick) VALUES ('a')`);
    expect(id).toBe(1);
    const second = await adapter.insert(`INSERT INTO pq (nick) VALUES ('b')`);
    expect(second).toBe(2);
  });

  it("errors when a write is routed through insert while preventing writes", async () => {
    await Base.whilePreventingWrites(async () => {
      await expect(adapter.insert(`INSERT INTO pq (nick) VALUES ('a')`)).rejects.toThrow(
        ReadOnlyError,
      );
    });
  });

  it("does not prevent a read routed through execute while preventing writes", async () => {
    await Base.whilePreventingWrites(async () => {
      expect(((await adapter.execute(`SELECT * FROM pq`)) as Mysql2RawResult).rows).toEqual([]);
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

  it("closes the statement when an unprepared bound query raises", async () => {
    const closed = async () =>
      Number(
        ((await adapter.execute(`SHOW SESSION STATUS LIKE 'Com_stmt_close'`)) as Mysql2RawResult)
          .rows![0][1],
      );
    const sql = "INSERT INTO pq (id, nick) VALUES (?, ?)";
    await adapter.internalExecute(sql, "SQL", [1, "a"], { prepare: false });
    const before = await closed();
    await expect(adapter.internalExecute(sql, "SQL", [1, "a"], { prepare: false })).rejects.toThrow(
      RecordNotUnique,
    );
    expect(await closed()).toBe(before + 1);
  });
});
