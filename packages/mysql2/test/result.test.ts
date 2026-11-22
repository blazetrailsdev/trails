import "@blazetrails/vitest-matchers";
import { BigDecimal, rbCFloat, rbCNilClass } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it } from "vitest";
import { Time } from "@blazetrails/date";
import { Mysql2, type Client, type Result } from "../lib/index.js";
import { specHelper } from "./spec-helper.js";

const testResult = async (client: Client) =>
  (await client.query("SELECT * FROM mysql2_test ORDER BY id DESC LIMIT 1"))!.toA()[0] as Record<
    string,
    unknown
  >;
describe("Mysql2::Result", () => {
  const state = specHelper();
  // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
  it.skip("should raise a TypeError exception when it doesn't wrap a result set", () => {});
  it.skip("should have included Enumerable", () => {});
  it("should respond to #each", async () => {
    const result = await state.client.query("SELECT 1");
    expect(result).toRespondTo("each");
  });
  it("should respond to #free", async () => {
    const result = await state.client.query("SELECT 1");
    expect(result).toRespondTo("free");
  });
  it("should raise a Mysql2::Error exception upon a bad query", async () => {
    await expect(state.client.query("bad sql")).rejects.toThrow(Mysql2.Error);

    await expect(state.client.query("SELECT 1")).resolves.not.toThrow();
  });
  // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
  it.skip("should respond to #count, which is aliased as #size", () => {});
  it("should be able to return the number of rows in the result set", async () => {
    const r = await state.client.query("SELECT 1");
    expect((r as Result).count()).toBe(1);
    expect(r!.size).toBe(1);
  });
  describe("metadata queries", () => {
    it("should show tables", async () => {
      await state.client.query("SHOW TABLES");
    });
  });
  describe("#each", () => {
    it("should yield rows as hash's", async () => {
      const result = (await state.client.query("SELECT 1"))!;
      result.each((row) => {
        expect(row).toBeExactInstanceOf(Object);
      });
    });
    it("should yield rows as hash's with symbol keys if :symbolize_keys was set to true", async () => {
      const result = (await state.client.query("SELECT 1"))!;
      result.each({ symbolizeKeys: true }, (row) => {
        expect(Object.keys(row)[0]).toBeExactInstanceOf(String);
      });
    });
    it("should be able to return results as an array", async () => {
      const result = (await state.client.query("SELECT 1"))!;
      result.each({ as: "array" }, (row) => {
        expect(row).toBeInstanceOf(Array);
      });
    });
    it("should cache previously yielded results by default", async () => {
      const result = (await state.client.query("SELECT 1"))!;
      expect(result.toA()[0]).toBe(result.toA()[0]);
    });
    it("should not cache previously yielded results if cache_rows is disabled", async () => {
      const result = (await state.client.query("SELECT 1", { cacheRows: false }))!;
      expect(result.toA()[0]).not.toBe(result.toA()[0]);
    });
    it("should be able to iterate a second time even if cache_rows is disabled", async () => {
      const result = (await state.client.query("SELECT 1 UNION SELECT 2", { cacheRows: false }))!;
      expect(result.toA()).toEqual(result.toA());
    });
    // BLOCKED: mysql2-result-stream-option-reads-the-driver-row-stream
    it.skip("should yield different value for #first if streaming", () => {});
    it("should yield the same value for #first if streaming is disabled", async () => {
      const result = (await state.client.query("SELECT 1 UNION SELECT 2", { stream: false }))!;
      expect(result.toA()[0]).toEqual(result.toA()[0]);
    });
    // BLOCKED: mysql2-result-stream-option-reads-the-driver-row-stream
    it.skip("should throw an exception if we try to iterate twice when streaming is enabled", () => {});
  });
  describe("#fields", () => {
    it("method should exist", async () => {
      const test_result = await state.client.query(
        "SELECT * FROM mysql2_test ORDER BY id DESC LIMIT 1",
      );
      expect(test_result!).toRespondTo("fields");
    });
    it("should return an array of field names in proper order", async () => {
      const result = await state.client.query("SELECT 'a', 'b', 'c'");
      expect(result!.fields).toEqual(["a", "b", "c"]);
    });
    // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
    it.skip("should return an array of frozen strings", () => {});
  });
  describe("#field_types", () => {
    // PERMANENT-SKIP: Field / field_types / server_flags are outside the RFC 0254 surface (Non-goals).
    it.skip("method should exist", () => {});
    it.skip("should return correct types", () => {});
    it.skip("should return an array of field types in proper order", () => {});
    it.skip("should return json type on mysql 8.0", () => {});
  });
  describe("streaming", () => {
    // BLOCKED: mysql2-result-stream-option-reads-the-driver-row-stream
    it.skip("should maintain a count while streaming", () => {});
    it.skip("should retain the count when mixing first and each", () => {});
    it.skip("should not yield nil at the end of streaming", () => {});
    it.skip("#count should be zero for rows after streaming when there were no results", () => {});
    it.skip("should raise an exception if streaming ended due to a timeout", () => {});
  });
  describe("row data type mapping", () => {
    it("should return nil values for NULL and strings for everything else when :cast is false", async () => {
      const result = (await state.client.query(
        "SELECT null_test, tiny_int_test, bool_cast_test, int_test, date_test, enum_test FROM mysql2_test WHERE bool_cast_test = 1 LIMIT 1",
        { cast: false },
      ))!.toA()[0] as Record<string, unknown>;
      expect(result["null_test"]).toBeNull();
      expect(result["tiny_int_test"]).toBe("1");
      expect(result["bool_cast_test"]).toBe("1");
      expect(result["int_test"]).toBe("10");
      expect(result["date_test"]).toBe("2010-04-04");
      expect(result["enum_test"]).toBe("val1");
    });
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
        const result1 = (await state.client.query(
          `SELECT bool_cast_test FROM mysql2_test WHERE id = ${id1} LIMIT 1`,
          { castBooleans: true },
        ))!;
        const result2 = (await state.client.query(
          `SELECT bool_cast_test FROM mysql2_test WHERE id = ${id2} LIMIT 1`,
          { castBooleans: true },
        ))!;
        const result3 = (await state.client.query(
          `SELECT bool_cast_test FROM mysql2_test WHERE id = ${id3} LIMIT 1`,
          { castBooleans: true },
        ))!;
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
        const result1 = (await state.client.query(
          `SELECT single_bit_test FROM mysql2_test WHERE id = ${id1}`,
          { castBooleans: true },
        ))!;
        const result2 = (await state.client.query(
          `SELECT single_bit_test FROM mysql2_test WHERE id = ${id2}`,
          { castBooleans: true },
        ))!;
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
      expect(test_result["float_test"]).toBe(10.3);
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
      const r = (await state.client.query(
        "SELECT CAST('1901-12-13 20:45:51' AS DATETIME) as test",
      ))!;
      expect((r.toA()[0] as Record<string, unknown>)["test"]).toBeExactInstanceOf(Time);
    });
    it("should return Time when timestamp is > 2038-01-19T03:14:07", async () => {
      const r = (await state.client.query(
        "SELECT CAST('2038-01-19 03:14:08' AS DATETIME) as test",
      ))!;
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
      const result = (await state.client.query(
        "SELECT CAST('1972-00-27 00:00:00' AS DATETIME) as bad_datetime",
      ))!;
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
  describe("server flags", () => {
    // PERMANENT-SKIP: Field / field_types / server_flags are outside the RFC 0254 surface (Non-goals).
    it.skip("should set a definitive value for query_was_slow", () => {});
    it.skip("should set a definitive value for no_index_used", () => {});
    it.skip("should set a definitive value for no_good_index_used", () => {});
  });
});
