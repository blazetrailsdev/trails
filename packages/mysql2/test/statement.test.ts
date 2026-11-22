import "@blazetrails/vitest-matchers";
import { rbCFloat, rbCNilClass } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Time } from "@blazetrails/date";
import { Mysql2, type Client } from "../lib/index.js";
import { specHelper } from "./spec-helper.js";

const testResult = async (client: Client) =>
  (await client
    .prepare("SELECT * FROM mysql2_test ORDER BY id DESC LIMIT 1")
    .execute())!.toA()[0] as Record<string, unknown>;
describe("Mysql2::Statement", () => {
  const state = specHelper();
  // BLOCKED: mysql2-client-prepare-prepares-on-the-server
  it.skip("should create a statement", () => {});
  it.skip("should raise an exception when server disconnects", () => {});
  it.skip("should tell us the param count", () => {});
  it.skip("should tell us the field count", () => {});
  it("should let us execute our statement", async () => {
    const statement = state.client.prepare("SELECT 1");
    expect(await statement.execute()).not.toBe(null);
  });
  // PERMANENT-SKIP: LocalJumpError has no counterpart; Result#each answers its rows without a block.
  it.skip("should raise an exception without a block", () => {});
  it("should tell us the result count", async () => {
    const statement = state.client.prepare("SELECT 1");
    const result = (await statement.execute())!;
    expect(result.count()).toBe(1);
  });
  it("should let us iterate over results", async () => {
    const statement = state.client.prepare("SELECT 1");
    const result = (await statement.execute())!;
    const rows: unknown[] = [];
    result.each((r) => rows.push(r));
    expect(rows).toEqual([{ "1": 1 }]);
  });
  // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
  it.skip("should handle booleans", () => {});
  it.skip("should handle bignum but in int64_t", () => {});
  it.skip("should handle bignum but beyond int64_t", () => {});
  it.skip("should accept keyword arguments on statement execute", () => {});
  it.skip("should accept bind arguments and keyword arguments on statement execute", () => {});
  it.skip("should keep its result after other query", () => {});
  it.skip("should be reusable 1000 times", () => {});
  it.skip("should be reusable 10000 times", () => {});
  it.skip("should handle comparisons and likes", () => {});
  it.skip("should select dates", () => {});
  it.skip("should prepare Date values", () => {});
  it.skip("should prepare Time values with microseconds", () => {});
  it.skip("should prepare DateTime values with microseconds", () => {});
  it.skip("should tell us about the fields", () => {});
  it.skip("should handle as a decimal binding a BigDecimal", () => {});
  it.skip("should update a DECIMAL value passing a BigDecimal", () => {});
  // PERMANENT-SKIP: streaming, cache_rows and async_result are outside the RFC 0254 surface (Non-goals).
  it.skip("should warn but still work if cache_rows is set to false", () => {});
  describe("utf8_db", () => {
    // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
    it.skip("should be able to retrieve utf8 field names correctly", () => {});
    it.skip("should be able to retrieve utf8 param query correctly", () => {});
    it.skip("should be able to retrieve query with param in different encoding correctly", () => {});
  });
  describe("streaming result", () => {
    // PERMANENT-SKIP: streaming, cache_rows and async_result are outside the RFC 0254 surface (Non-goals).
    it.skip("should be able to stream query result", () => {});
  });
  describe("#each", () => {
    it("should yield rows as hash's", async () => {
      const result = (await state.client.prepare("SELECT 1").execute())!;
      result.each((row) => {
        expect(Array.isArray(row)).toBe(false);
      });
    });
    it("should yield rows as hash's with symbol keys if :symbolize_keys was set to true", async () => {
      const result = (await state.client.prepare("SELECT 1").execute({ symbolizeKeys: true }))!;
      result.each((row) => {
        expect(typeof Object.keys(row)[0]).toBe("string");
      });
    });
    it("should be able to return results as an array", async () => {
      const result = (await state.client.prepare("SELECT 1").execute({ as: "array" }))!;
      result.each((row) => {
        expect(row).toBeInstanceOf(Array);
      });
    });
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should cache previously yielded results by default", () => {});
    // PERMANENT-SKIP: streaming, cache_rows and async_result are outside the RFC 0254 surface (Non-goals).
    it.skip("should yield different value for #first if streaming", () => {});
    it.skip("should yield the same value for #first if streaming is disabled", () => {});
    it.skip("should throw an exception if we try to iterate twice when streaming is enabled", () => {});
  });
  describe("#fields", () => {
    // BLOCKED: mysql2-client-prepare-prepares-on-the-server
    it.skip("method should exist", () => {});
    it.skip("should return an array of field names in proper order", () => {});
    it.skip("should return nil for statement with no result fields", () => {});
  });
  describe("row data type mapping", () => {
    it("should return nil for a NULL value", async () => {
      const test_result = await testResult(state.client);
      expect(test_result["null_test"]).toBeExactInstanceOf(rbCNilClass);
      expect(test_result["null_test"]).toBe(null);
    });
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should return String for a BIT(64) value", () => {});
    it.skip("should return String for a BIT(1) value", () => {});
    it("should return Fixnum for a TINYINT value", async () => {
      const test_result = await testResult(state.client);
      expect(["number", "bigint"]).toContain(typeof test_result["tiny_int_test"]);
      expect(Number(test_result["tiny_int_test"])).toBe(1);
    });
    describe("cast booleans for TINYINT if :cast_booleans is enabled", () => {
      // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
      it.skip("should return TrueClass or FalseClass for a TINYINT value if :cast_booleans is enabled", () => {});
    });
    describe("cast booleans for BIT(1) if :cast_booleans is enabled", () => {
      // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
      it.skip("should return TrueClass or FalseClass for a BIT(1) value if :cast_booleans is enabled", () => {});
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
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should return BigDecimal for a DECIMAL value", () => {});
    it("should return Float for a FLOAT value", async () => {
      const test_result = await testResult(state.client);
      expect(test_result["float_test"]).toBeExactInstanceOf(rbCFloat);
      expect(test_result["float_test"]).toBeCloseTo(10.3, 5);
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
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should return Time when timestamp is < 1901-12-13 20:45:52", () => {});
    it.skip("should return Time when timestamp is > 2038-01-19T03:14:07", () => {});
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
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should return Date for a DATE value", () => {});
    it("should return String for an ENUM value", async () => {
      const test_result = await testResult(state.client);
      expect(test_result["enum_test"]).toBeExactInstanceOf(String);
      expect(test_result["enum_test"]).toBe("val1");
    });
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should raise an error given an invalid DATETIME", () => {});
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
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should return String for a BINARY value", () => {});
    describe("string encoding for BINARY values", () => {
      // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
      it.skip("should default to binary if Encoding.default_internal is nil", () => {});
      it.skip("should not use Encoding.default_internal", () => {});
    });
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should return a String for #{type}", () => {});
    describe("string encoding for #{type} values", () => {
      // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
      it.skip("should default to binary if Encoding.default_internal is nil", () => {});
      it.skip("should not use Encoding.default_internal", () => {});
      it.skip("should default to utf-8 if Encoding.default_internal is nil", () => {});
      it.skip("should use Encoding.default_internal", () => {});
    });
  });
  describe("last_id", () => {
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should return last insert id", () => {});
    it.skip("should handle bigint ids", () => {});
  });
  describe("affected_rows", () => {
    beforeEach(async () => {
      await state.client.query(
        "CREATE TABLE IF NOT EXISTS lastIdTest (`id` BIGINT NOT NULL AUTO_INCREMENT, blah INT(11), PRIMARY KEY (`id`))",
      );
    });
    afterEach(async () => {
      await state.client.query("DROP TABLE lastIdTest");
    });
    it("should return number of rows affected by an insert", async () => {
      const stmt = state.client.prepare("INSERT INTO lastIdTest (blah) VALUES (?)");
      await stmt.execute(1);
      expect(stmt.affectedRows).toBe(1);
    });
    it("should return number of rows affected by an update", async () => {
      let stmt = state.client.prepare("INSERT INTO lastIdTest (blah) VALUES (?)");
      await stmt.execute(1);
      expect(stmt.affectedRows).toBe(1);
      await stmt.execute(2);
      expect(stmt.affectedRows).toBe(1);

      stmt = state.client.prepare("UPDATE lastIdTest SET blah=? WHERE blah=?");
      await stmt.execute(0, 1);
      expect(stmt.affectedRows).toBe(1);
    });
    it("should return number of rows affected by a delete", async () => {
      let stmt = state.client.prepare("INSERT INTO lastIdTest (blah) VALUES (?)");
      await stmt.execute(1);
      expect(stmt.affectedRows).toBe(1);
      await stmt.execute(2);
      expect(stmt.affectedRows).toBe(1);

      stmt = state.client.prepare("DELETE FROM lastIdTest WHERE blah=?");
      await stmt.execute(1);
      expect(stmt.affectedRows).toBe(1);
    });
  });
  describe("close", () => {
    // BLOCKED: mysql2-client-prepare-prepares-on-the-server
    it.skip("should free server resources", () => {});
    it("should raise an error on subsequent execution", async () => {
      const stmt = state.client.prepare("SELECT 1");
      stmt.close();
      await expect(stmt.execute()).rejects.toThrow(Mysql2.Error);
      await expect(stmt.execute()).rejects.toThrow(/Invalid statement handle/);
    });
  });
});
