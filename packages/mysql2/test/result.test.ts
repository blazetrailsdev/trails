import "@blazetrails/vitest-matchers";
import { rbCFloat, rbCNilClass } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
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
        expect(row).toBeInstanceOf(Object);
        expect(Array.isArray(row)).toBe(false);
      });
    });
    it("should yield rows as hash's with symbol keys if :symbolize_keys was set to true", async () => {
      const result = (await state.client.query("SELECT 1"))!;
      result.each({ symbolizeKeys: true }, (row) => {
        expect(typeof Object.keys(row)[0]).toBe("string");
      });
    });
    it("should be able to return results as an array", async () => {
      const result = (await state.client.query("SELECT 1"))!;
      result.each({ as: "array" }, (row) => {
        expect(row).toBeInstanceOf(Array);
      });
    });
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should cache previously yielded results by default", () => {});
    // PERMANENT-SKIP: streaming, cache_rows and async_result are outside the RFC 0254 surface (Non-goals).
    it.skip("should not cache previously yielded results if cache_rows is disabled", () => {});
    it.skip("should be able to iterate a second time even if cache_rows is disabled", () => {});
    it.skip("should yield different value for #first if streaming", () => {});
    it.skip("should yield the same value for #first if streaming is disabled", () => {});
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
    // PERMANENT-SKIP: streaming, cache_rows and async_result are outside the RFC 0254 surface (Non-goals).
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
  describe("server flags", () => {
    // PERMANENT-SKIP: Field / field_types / server_flags are outside the RFC 0254 surface (Non-goals).
    it.skip("should set a definitive value for query_was_slow", () => {});
    it.skip("should set a definitive value for no_index_used", () => {});
    it.skip("should set a definitive value for no_good_index_used", () => {});
  });
});
