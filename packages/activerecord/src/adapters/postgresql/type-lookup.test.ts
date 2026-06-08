/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/type_lookup_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ActiveModelRangeError } from "@blazetrails/activemodel";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { Range } from "../../connection-adapters/postgresql/oid/range.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    // Populate the type map with array/range OIDs from pg_type.
    await adapter.loadAdditionalTypes();
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlTypeLookupTest", () => {
    it("array delimiters are looked up correctly", () => {
      // Rails: @connection.send(:type_map).lookup(1020) → box array (delimiter ";")
      // Rails: @connection.send(:type_map).lookup(1007) → int4 array (delimiter ",")
      const boxArray = adapter.typeMap.lookup(1020) as any;
      const intArray = adapter.typeMap.lookup(1007) as any;
      expect(boxArray.delimiter).toBe(";");
      expect(intArray.delimiter).toBe(",");
    });

    it("array types correctly respect registration of subtypes", () => {
      // Rails uses 123456789123456789 (Bignum); JS loses precision for values > 2^53,
      // so we use 3_000_000_000 which exceeds int4 max (2147483647) but fits in int8.
      const bigNum = 3_000_000_000;
      const intArray = adapter.typeMap.lookup(1007, -1, "integer[]");
      const bigintArray = adapter.typeMap.lookup(1016, -1, "bigint[]");

      // Rails: assert_raises(ActiveModel::RangeError) { int_array.serialize(big_array) }
      expect(() => intArray.serialize([bigNum])).toThrow(ActiveModelRangeError);
      // Rails: assert_equal "{123456789123456789}", @connection.type_cast(bigint_array.serialize(...))
      expect(adapter.typeCast(bigintArray.serialize([bigNum]))).toBe(`{${bigNum}}`);
    });

    it("range types correctly respect registration of subtypes", () => {
      // Same precision rationale as "array types" above.
      const bigNum = 3_000_000_000;
      const intRange = adapter.typeMap.lookup(3904, -1, "int4range");
      const bigintRange = adapter.typeMap.lookup(3926, -1, "int8range");
      const bigRange = new Range(0, bigNum, false);

      // Rails: assert_raises(ActiveModel::RangeError) { int_range.serialize(big_range) }
      expect(() => intRange.serialize(bigRange)).toThrow(ActiveModelRangeError);
      // Rails: assert_equal "[0,123456789123456789]", @connection.type_cast(bigint_range.serialize(...))
      expect(adapter.typeCast(bigintRange.serialize(bigRange))).toBe(`[0,${bigNum}]`);
    });
  });
});
