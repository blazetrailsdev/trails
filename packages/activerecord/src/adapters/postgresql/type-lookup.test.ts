import { describe, it, expect, beforeEach } from "vitest";
import { RangeError as ActiveModelRangeError } from "@blazetrails/activemodel";
import { describeIfPg, leasePgAdapter, PostgreSQLAdapter } from "./test-helper.js";
import { Range } from "@blazetrails/ruby-compat";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = await leasePgAdapter();
  });

  describe("PostgresqlTypeLookupTest", () => {
    it("array delimiters are looked up correctly", () => {
      const boxArray = adapter.typeMap.lookup(1020) as any;
      const intArray = adapter.typeMap.lookup(1007) as any;
      expect(boxArray.delimiter).toBe(";");
      expect(intArray.delimiter).toBe(",");
    });

    it("array types correctly respect registration of subtypes", () => {
      const bigNum = 3_000_000_000;
      const intArray = adapter.typeMap.lookup(1007, -1, "integer[]");
      const bigintArray = adapter.typeMap.lookup(1016, -1, "bigint[]");

      expect(() => intArray.serialize([bigNum])).toThrow(ActiveModelRangeError);
      expect(adapter.typeCast(bigintArray.serialize([bigNum]))).toBe(`{${bigNum}}`);
    });

    it("range types correctly respect registration of subtypes", () => {
      const bigNum = 3_000_000_000;
      const intRange = adapter.typeMap.lookup(3904, -1, "int4range");
      const bigintRange = adapter.typeMap.lookup(3926, -1, "int8range");
      const bigRange = new Range(0, bigNum, false);

      expect(() => intRange.serialize(bigRange)).toThrow(ActiveModelRangeError);
      expect(adapter.typeCast(bigintRange.serialize(bigRange))).toBe(`[0,${bigNum}]`);
    });
  });
});
