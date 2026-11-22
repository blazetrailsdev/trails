import "@blazetrails/vitest-matchers";
import { BigDecimal, rbCFloat, rbCNilClass, stderr } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Date as RubyDate, Time } from "@blazetrails/date";
import { Mysql2, type Client } from "../lib/index.js";
import { lastIdTestLock, specHelper } from "./spec-helper.js";

const testResult = async (client: Client) =>
  (await (
    await client.prepare("SELECT * FROM mysql2_test ORDER BY id DESC LIMIT 1")
  ).execute())!.toA()[0] as Record<string, unknown>;
describe("Mysql2::Statement", () => {
  const state = specHelper();
  const performanceSchemaEnabled = async () =>
    (await state.client.query("SHOW VARIABLES LIKE 'performance_schema'"))!
      .toA()
      .some((x) => (x as Record<string, unknown>)["Value"] === "ON");
  const stmtCount = async () => {
    if (await performanceSchemaEnabled()) {
      const row = (await state.client.query(
        "SELECT COUNT(1) AS count FROM performance_schema.prepared_statements_instances",
      ))!.toA()[0] as Record<string, unknown>;
      return Number(row["count"]);
    }
    const row = (await state.client.query(
      "SHOW STATUS LIKE 'Prepared_stmt_count'",
    ))!.toA()[0] as Record<string, unknown>;
    return Number(row["Value"]);
  };
  it("should create a statement", async () => {
    let statement: unknown = null;
    await expect(async () => {
      statement = await state.client.prepare("SELECT 1");
    }).toChange(stmtCount, { by: 1 });
    expect(statement).toBeExactInstanceOf(Mysql2.Statement);
  });
  it("should raise an exception when server disconnects", async () => {
    await state.client.close();
    await expect(state.client.prepare("SELECT 1")).rejects.toThrow(Mysql2.Error);
  });
  it("should tell us the param count", async () => {
    const statement = await state.client.prepare("SELECT ?, ?");
    expect(statement.paramCount).toBe(2);

    const statement2 = await state.client.prepare("SELECT 1");
    expect(statement2.paramCount).toBe(0);
  });
  it("should tell us the field count", async () => {
    const statement = await state.client.prepare("SELECT ?, ?");
    expect(statement.fieldCount).toBe(2);

    const statement2 = await state.client.prepare("SELECT 1");
    expect(statement2.fieldCount).toBe(1);
  });
  it("should let us execute our statement", async () => {
    const statement = await state.client.prepare("SELECT 1");
    expect(await statement.execute()).not.toBe(null);
  });
  // PERMANENT-SKIP: LocalJumpError has no counterpart; Result#each answers its rows without a block.
  it.skip("should raise an exception without a block", () => {});
  it("should tell us the result count", async () => {
    const statement = await state.client.prepare("SELECT 1");
    const result = (await statement.execute())!;
    expect(result.count()).toBe(1);
  });
  it("should let us iterate over results", async () => {
    const statement = await state.client.prepare("SELECT 1");
    const result = (await statement.execute())!;
    const rows: unknown[] = [];
    result.each((r) => rows.push(r));
    expect(rows).toEqual([{ "1": 1 }]);
  });
  it("should handle booleans", async () => {
    const stmt = await state.client.prepare("SELECT ? AS `true`, ? AS `false`");
    const result = (await stmt.execute(true, false))!;
    expect(result.toA()).toEqual([{ true: 1, false: 0 }]);
  });
  // PERMANENT-SKIP: the npm mysql2 driver's Execute toParameter binds a bigint as VAR_STRING, not
  it.skip("should handle bignum but in int64_t", () => {});
  it.skip("should handle bignum but beyond int64_t", () => {});
  it("should accept keyword arguments on statement execute", async () => {
    const stmt = await state.client.prepare("SELECT 1 AS a");

    expect((await stmt.execute({ as: "hash" }))!.toA()[0]).toEqual({ a: 1 });
    expect((await stmt.execute({ as: "array" }))!.toA()[0]).toEqual([1]);
  });
  it("should accept bind arguments and keyword arguments on statement execute", async () => {
    const stmt = await state.client.prepare("SELECT ? AS a");

    expect((await stmt.execute(1, { as: "hash" }))!.toA()[0]).toEqual({ a: 1 });
    expect((await stmt.execute(1, { as: "array" }))!.toA()[0]).toEqual([1]);
  });
  it("should keep its result after other query", async () => {
    await state.client.query("CREATE TABLE IF NOT EXISTS mysql2_stmt_q(a int)");
    await state.client.query("INSERT INTO mysql2_stmt_q (a) VALUES (1), (2)");
    const stmt = await state.client.prepare("SELECT a FROM mysql2_stmt_q WHERE a = ?");
    const result1 = (await stmt.execute(1))!;
    const result2 = (await stmt.execute(2))!;
    expect(result2.toA()[0]).toEqual({ a: 2 });
    expect(result1.toA()[0]).toEqual({ a: 1 });
    await state.client.query("DROP TABLE IF EXISTS mysql2_stmt_q");
  });
  it("should be reusable 1000 times", async () => {
    const statement = await state.client.prepare("SELECT 1");
    for (let i = 0; i < 1000; i++) {
      const result = (await statement.execute())!;
      expect(result.toA().length).toBe(1);
    }
  });
  it("should be reusable 10000 times", async () => {
    const statement = await state.client.prepare("SELECT 1");
    for (let i = 0; i < 10000; i++) {
      const result = (await statement.execute())!;
      expect(result.toA().length).toBe(1);
    }
  }, 60_000);
  it("should handle comparisons and likes", async () => {
    await state.client.query("CREATE TABLE IF NOT EXISTS mysql2_stmt_q(a int, b varchar(10))");
    await state.client.query('INSERT INTO mysql2_stmt_q (a, b) VALUES (1, "Hello"), (2, "World")');
    let statement = await state.client.prepare("SELECT * FROM mysql2_stmt_q WHERE a < ?");
    let results = (await statement.execute(2))!;
    expect(results.toA()[0]).toEqual({ a: 1, b: "Hello" });

    statement = await state.client.prepare("SELECT * FROM mysql2_stmt_q WHERE b LIKE ?");
    results = (await statement.execute("%orld"))!;
    expect(results.toA()[0]).toEqual({ a: 2, b: "World" });

    await state.client.query("DROP TABLE IF EXISTS mysql2_stmt_q");
  });
  it("should select dates", async () => {
    const statement = await state.client.prepare("SELECT NOW()");
    const result = (await statement.execute())!;
    expect(Object.values(result.toA()[0])[0]).toBeExactInstanceOf(Time);
  });
  it("should prepare Date values", async () => {
    const now = RubyDate.today();
    const statement = await state.client.prepare("SELECT ? AS a");
    const result = (await statement.execute(now))!;
    expect(String((result.toA()[0] as Record<string, unknown>)["a"])).toBe(now.toString());
  });
  // PERMANENT-SKIP: the npm mysql2 driver's Execute toParameter binds a time only as a JS Date,
  it.skip("should prepare Time values with microseconds", () => {});
  it.skip("should prepare DateTime values with microseconds", () => {});
  it("should tell us about the fields", async () => {
    const statement = await state.client.prepare("SELECT 1 as foo, 2");
    await statement.execute();
    const list = statement.fields!;
    expect(list.length).toBe(2);
    expect(list[0]).toBe("foo");
    expect(list[1]).toBe("2");
  });
  // PERMANENT-SKIP: the npm mysql2 driver's Execute toParameter binds a string as VAR_STRING, not
  it.skip("should handle as a decimal binding a BigDecimal", () => {});
  it("should update a DECIMAL value passing a BigDecimal", async () => {
    await state.client.query("DROP TABLE IF EXISTS mysql2_stmt_decimal_test");
    await state.client.query("CREATE TABLE mysql2_stmt_decimal_test (decimal_test DECIMAL(10,3))");

    await (
      await state.client.prepare("INSERT INTO mysql2_stmt_decimal_test VALUES (?)")
    ).execute(new BigDecimal("123.45"));

    const test_result = (await state.client.query(
      "SELECT * FROM mysql2_stmt_decimal_test",
    ))!.toA()[0] as Record<string, BigDecimal>;
    expect(test_result["decimal_test"].toF()).toBe(123.45);
  });
  it("should warn but still work if cache_rows is set to false", async () => {
    const statement = await state.client.prepare("SELECT 1");
    const write = vi.spyOn(stderr, "write").mockImplementation(() => true);
    try {
      const result = (await statement.execute({ cacheRows: false }))!.toA();
      expect(write.mock.calls.map(([m]) => String(m)).join("")).toMatch(
        /:cache_rows is forced for prepared statements/,
      );
      expect(result.length).toBe(1);
    } finally {
      write.mockRestore();
    }
  });
  describe("utf8_db", () => {
    // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
    it.skip("should be able to retrieve utf8 field names correctly", () => {});
    it.skip("should be able to retrieve utf8 param query correctly", () => {});
    it.skip("should be able to retrieve query with param in different encoding correctly", () => {});
  });
  describe("streaming result", () => {
    it.skip("should be able to stream query result", () => {});
  });
  describe("#each", () => {
    it("should yield rows as hash's", async () => {
      const result = (await (await state.client.prepare("SELECT 1")).execute())!;
      result.each((row) => {
        expect(row).toBeExactInstanceOf(Object);
      });
    });
    it("should yield rows as hash's with symbol keys if :symbolize_keys was set to true", async () => {
      const result = (await (
        await state.client.prepare("SELECT 1")
      ).execute({ symbolizeKeys: true }))!;
      result.each((row) => {
        expect(Object.keys(row)[0]).toBeExactInstanceOf(String);
      });
    });
    it("should be able to return results as an array", async () => {
      const result = (await (await state.client.prepare("SELECT 1")).execute({ as: "array" }))!;
      result.each((row) => {
        expect(row).toBeInstanceOf(Array);
      });
    });
    it("should cache previously yielded results by default", async () => {
      const result = (await (await state.client.prepare("SELECT 1")).execute())!;
      expect(result.toA()[0]).toBe(result.toA()[0]);
    });
    it.skip("should yield different value for #first if streaming", () => {});
    it("should yield the same value for #first if streaming is disabled", async () => {
      const result = (await (
        await state.client.prepare("SELECT 1 UNION SELECT 2")
      ).execute({ stream: false }))!;
      expect(result.toA()[0]).toEqual(result.toA()[0]);
    });
    it.skip("should throw an exception if we try to iterate twice when streaming is enabled", () => {});
  });
  describe("#fields", () => {
    it("method should exist", async () => {
      const stmt = await state.client.prepare("SELECT 1");
      expect(stmt).toRespondTo("fields");
    });
    it("should return an array of field names in proper order", async () => {
      const stmt = await state.client.prepare("SELECT 'a', 'b', 'c'");
      expect(stmt.fields).toEqual(["a", "b", "c"]);
    });
    it("should return nil for statement with no result fields", async () => {
      const stmt = await state.client.prepare("INSERT INTO mysql2_test () VALUES ()");
      expect(stmt.fields).toBe(null);
    });
  });
  describe("row data type mapping", () => {
    it("should return nil for a NULL value", async () => {
      const test_result = await testResult(state.client);
      expect(test_result["null_test"]).toBeExactInstanceOf(rbCNilClass);
      expect(test_result["null_test"]).toBe(null);
    });
    it("should return String for a BIT(64) value", async () => {
      const test_result = await testResult(state.client);
      expect(test_result["bit_test"]).toBeInstanceOf(Uint8Array);
      expect(Array.from(test_result["bit_test"] as Uint8Array)).toEqual([0, 0, 0, 0, 0, 0, 0, 5]);
    });
    it("should return String for a BIT(1) value", async () => {
      const test_result = await testResult(state.client);
      expect(test_result["single_bit_test"]).toBeInstanceOf(Uint8Array);
      expect(Array.from(test_result["single_bit_test"] as Uint8Array)).toEqual([1]);
    });
    it("should return Fixnum for a TINYINT value", async () => {
      const test_result = await testResult(state.client);
      expect(["number", "bigint"]).toContain(typeof test_result["tiny_int_test"]);
      expect(Number(test_result["tiny_int_test"])).toBe(1);
    });
    describe("cast booleans for TINYINT if :cast_booleans is enabled", () => {
      let ids: number[] = [];
      afterEach(async () => {
        if (ids.length)
          await state.client.query(`DELETE from mysql2_test WHERE id IN(${ids.join(",")})`);
        ids = [];
      });
      it("should return TrueClass or FalseClass for a TINYINT value if :cast_booleans is enabled", async () => {
        const id1 = await (await state.client.query(
          "INSERT INTO mysql2_test (bool_cast_test) VALUES ( 1)",
        ),
        state.client.lastId!);
        const id2 = await (await state.client.query(
          "INSERT INTO mysql2_test (bool_cast_test) VALUES ( 0)",
        ),
        state.client.lastId!);
        const id3 = await (await state.client.query(
          "INSERT INTO mysql2_test (bool_cast_test) VALUES (-1)",
        ),
        state.client.lastId!);
        ids = [id1, id2, id3];
        const query = await state.client.prepare(
          "SELECT bool_cast_test FROM mysql2_test WHERE id = ?",
        );
        const result1 = (await query.execute(id1, { castBooleans: true }))!;
        const result2 = (await query.execute(id2, { castBooleans: true }))!;
        const result3 = (await query.execute(id3, { castBooleans: true }))!;
        expect((result1.toA()[0] as Record<string, unknown>)["bool_cast_test"]).toBe(true);
        expect((result2.toA()[0] as Record<string, unknown>)["bool_cast_test"]).toBe(false);
        expect((result3.toA()[0] as Record<string, unknown>)["bool_cast_test"]).toBe(true);
      });
    });
    describe("cast booleans for BIT(1) if :cast_booleans is enabled", () => {
      let ids: number[] = [];
      afterEach(async () => {
        if (ids.length)
          await state.client.query(`DELETE from mysql2_test WHERE id IN(${ids.join(",")})`);
        ids = [];
      });
      it("should return TrueClass or FalseClass for a BIT(1) value if :cast_booleans is enabled", async () => {
        const id1 = await (await state.client.query(
          "INSERT INTO mysql2_test (single_bit_test) VALUES (1)",
        ),
        state.client.lastId!);
        const id2 = await (await state.client.query(
          "INSERT INTO mysql2_test (single_bit_test) VALUES (0)",
        ),
        state.client.lastId!);
        ids = [id1, id2];
        const query = await state.client.prepare(
          "SELECT single_bit_test FROM mysql2_test WHERE id = ?",
        );
        const result1 = (await query.execute(id1, { castBooleans: true }))!;
        const result2 = (await query.execute(id2, { castBooleans: true }))!;
        expect((result1.toA()[0] as Record<string, unknown>)["single_bit_test"]).toBe(true);
        expect((result2.toA()[0] as Record<string, unknown>)["single_bit_test"]).toBe(false);
      });
    });
    it("should return Fixnum for a SMALLINT value", async () => {
      const test_result = await testResult(state.client);
      expect(["number", "bigint"]).toContain(typeof test_result["small_int_test"]);
      expect(Number(test_result["small_int_test"])).toBe(10);
    });
    it("should return Fixnum for a MEDIUMINT value", async () => {
      const test_result = await testResult(state.client);
      expect(["number", "bigint"]).toContain(typeof test_result["medium_int_test"]);
      expect(Number(test_result["medium_int_test"])).toBe(10);
    });
    it("should return Fixnum for an INT value", async () => {
      const test_result = await testResult(state.client);
      expect(["number", "bigint"]).toContain(typeof test_result["int_test"]);
      expect(Number(test_result["int_test"])).toBe(10);
    });
    it("should return Fixnum for a BIGINT value", async () => {
      const test_result = await testResult(state.client);
      expect(["number", "bigint"]).toContain(typeof test_result["big_int_test"]);
      expect(Number(test_result["big_int_test"])).toBe(10);
    });
    it("should return Fixnum for a YEAR value", async () => {
      const test_result = await testResult(state.client);
      expect(["number", "bigint"]).toContain(typeof test_result["year_test"]);
      expect(Number(test_result["year_test"])).toBe(2009);
    });
    it("should return BigDecimal for a DECIMAL value", async () => {
      const test_result = await testResult(state.client);
      expect(test_result["decimal_test"]).toBeExactInstanceOf(BigDecimal);
      expect((test_result["decimal_test"] as BigDecimal).toF()).toBe(10.3);
    });
    it("should return Float for a FLOAT value", async () => {
      const test_result = await testResult(state.client);
      expect(test_result["float_test"]).toBeExactInstanceOf(rbCFloat);
      expect(test_result["float_test"]).toSatisfy((v: number) => Math.abs(v - 10.3) <= 1e-5);
    });
    it("should return Float for a DOUBLE value", async () => {
      const test_result = await testResult(state.client);
      expect(test_result["double_test"]).toBeExactInstanceOf(rbCFloat);
      expect(test_result["double_test"]).toBe(10.3);
    });
    it("should return Time for a DATETIME value when within the supported range", async () => {
      const test_result = await testResult(state.client);
      expect(test_result["date_time_test"]).toBeInstanceOf(Time);
      expect((test_result["date_time_test"] as Time).strftime("%Y-%m-%d %H:%M:%S")).toBe(
        "2010-04-04 11:44:00",
      );
    });
    it("should return Time when timestamp is < 1901-12-13 20:45:52", async () => {
      const r = (await (
        await state.client.prepare("SELECT CAST('1901-12-13 20:45:51' AS DATETIME) as test")
      ).execute())!;
      expect((r.toA()[0] as Record<string, unknown>)["test"]).toBeExactInstanceOf(Time);
    });
    it("should return Time when timestamp is > 2038-01-19T03:14:07", async () => {
      const r = (await (
        await state.client.prepare("SELECT CAST('2038-01-19 03:14:08' AS DATETIME) as test")
      ).execute())!;
      expect((r.toA()[0] as Record<string, unknown>)["test"]).toBeExactInstanceOf(Time);
    });
    it("should return Time for a TIMESTAMP value when within the supported range", async () => {
      const test_result = await testResult(state.client);
      expect(test_result["timestamp_test"]).toBeInstanceOf(Time);
      expect((test_result["timestamp_test"] as Time).strftime("%Y-%m-%d %H:%M:%S")).toBe(
        "2010-04-04 11:44:00",
      );
    });
    it("should return Time for a TIME value", async () => {
      const test_result = await testResult(state.client);
      expect(test_result["time_test"]).toBeInstanceOf(Time);
      expect((test_result["time_test"] as Time).strftime("%Y-%m-%d %H:%M:%S")).toBe(
        "2000-01-01 11:44:00",
      );
    });
    it("should return Date for a DATE value", async () => {
      const test_result = await testResult(state.client);
      expect(test_result["date_test"]).toBeExactInstanceOf(Temporal.PlainDate);
      expect((test_result["date_test"] as Temporal.PlainDate).toString()).toBe("2010-04-04");
    });
    it("should return String for an ENUM value", async () => {
      const test_result = await testResult(state.client);
      expect(test_result["enum_test"]).toBeExactInstanceOf(String);
      expect(test_result["enum_test"]).toBe("val1");
    });
    it("should raise an error given an invalid DATETIME", async () => {
      const result = (await (
        await state.client.prepare("SELECT CAST('1972-00-27 00:00:00' AS DATETIME) as bad_datetime")
      ).execute())!;
      expect(() => result.each()).toThrow(
        new Mysql2.Error("Invalid date in field 'bad_datetime': 1972-00-27 00:00:00"),
      );
    });
    describe("string encoding for ENUM values", () => {
      // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
      it.skip("should default to the connection's encoding if Encoding.default_internal is nil", () => {});
      it.skip("should use Encoding.default_internal", () => {});
    });
    it("should return String for a SET value", async () => {
      const test_result = await testResult(state.client);
      expect(test_result["set_test"]).toBeExactInstanceOf(String);
      expect(test_result["set_test"]).toBe("val1,val2");
    });
    describe("string encoding for SET values", () => {
      // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
      it.skip("should default to the connection's encoding if Encoding.default_internal is nil", () => {});
      it.skip("should use Encoding.default_internal", () => {});
    });
    it("should return String for a BINARY value", async () => {
      const test_result = await testResult(state.client);
      expect(test_result["binary_test"]).toBeInstanceOf(Uint8Array);
      expect(Array.from(test_result["binary_test"] as Uint8Array)).toEqual([
        116, 101, 115, 116, 0, 0, 0, 0, 0, 0,
      ]);
    });
    describe("string encoding for BINARY values", () => {
      // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
      it.skip("should default to binary if Encoding.default_internal is nil", () => {});
      it.skip("should not use Encoding.default_internal", () => {});
    });
    it("should return a String for #{type}", async () => {
      const test_result = await testResult(state.client);
      for (const field of [
        "char_test",
        "varchar_test",
        "tiny_text_test",
        "text_test",
        "medium_text_test",
        "long_text_test",
      ]) {
        expect(test_result[field]).toBeExactInstanceOf(String);
        expect(test_result[field]).toBe("test");
      }
      for (const field of [
        "varbinary_test",
        "tiny_blob_test",
        "blob_test",
        "medium_blob_test",
        "long_blob_test",
      ]) {
        expect(test_result[field]).toBeInstanceOf(Uint8Array);
        expect(new TextDecoder().decode(test_result[field] as Uint8Array)).toBe("test");
      }
    });
    describe("string encoding for #{type} values", () => {
      // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
      it.skip("should default to binary if Encoding.default_internal is nil", () => {});
      it.skip("should not use Encoding.default_internal", () => {});
      it.skip("should default to utf-8 if Encoding.default_internal is nil", () => {});
      it.skip("should use Encoding.default_internal", () => {});
    });
  });
  describe("last_id", () => {
    lastIdTestLock(state);
    beforeEach(async () => {
      await state.client.query(
        "CREATE TABLE IF NOT EXISTS lastIdTest (`id` BIGINT NOT NULL AUTO_INCREMENT, blah INT(11), PRIMARY KEY (`id`))",
      );
    });
    afterEach(async () => {
      await state.client.query("DROP TABLE lastIdTest");
    });
    it("should return last insert id", async () => {
      const stmt = await state.client.prepare("INSERT INTO lastIdTest (blah) VALUES (?)");
      expect(stmt.lastId).toBe(0);
      await stmt.execute(1);
      expect(stmt.lastId).toBe(1);
    });
    it("should handle bigint ids", async () => {
      let stmt = await state.client.prepare("INSERT INTO lastIdTest (id, blah) VALUES (?, ?)");
      await stmt.execute(5000000000, 5000);
      expect(stmt.lastId).toBe(5000000000);

      stmt = await state.client.prepare("INSERT INTO lastIdTest (blah) VALUES (?)");
      await stmt.execute(5001);
      expect(stmt.lastId).toBe(5000000001);
    });
  });
  describe("affected_rows", () => {
    lastIdTestLock(state);
    beforeEach(async () => {
      await state.client.query(
        "CREATE TABLE IF NOT EXISTS lastIdTest (`id` BIGINT NOT NULL AUTO_INCREMENT, blah INT(11), PRIMARY KEY (`id`))",
      );
    });
    afterEach(async () => {
      await state.client.query("DROP TABLE lastIdTest");
    });
    it("should return number of rows affected by an insert", async () => {
      const stmt = await state.client.prepare("INSERT INTO lastIdTest (blah) VALUES (?)");
      await stmt.execute(1);
      expect(stmt.affectedRows).toBe(1);
    });
    it("should return number of rows affected by an update", async () => {
      let stmt = await state.client.prepare("INSERT INTO lastIdTest (blah) VALUES (?)");
      await stmt.execute(1);
      expect(stmt.affectedRows).toBe(1);
      await stmt.execute(2);
      expect(stmt.affectedRows).toBe(1);

      stmt = await state.client.prepare("UPDATE lastIdTest SET blah=? WHERE blah=?");
      await stmt.execute(0, 1);
      expect(stmt.affectedRows).toBe(1);
    });
    it("should return number of rows affected by a delete", async () => {
      let stmt = await state.client.prepare("INSERT INTO lastIdTest (blah) VALUES (?)");
      await stmt.execute(1);
      expect(stmt.affectedRows).toBe(1);
      await stmt.execute(2);
      expect(stmt.affectedRows).toBe(1);

      stmt = await state.client.prepare("DELETE FROM lastIdTest WHERE blah=?");
      await stmt.execute(1);
      expect(stmt.affectedRows).toBe(1);
    });
  });
  describe("close", () => {
    it("should free server resources", async () => {
      const stmt = await state.client.prepare("SELECT 1");
      await expect(() => stmt.close()).toChange(stmtCount, { by: -1 });
    });
    it("should raise an error on subsequent execution", async () => {
      const stmt = await state.client.prepare("SELECT 1");
      stmt.close();
      await expect(stmt.execute()).rejects.toThrow(/Invalid statement handle/);
    });
  });
});
