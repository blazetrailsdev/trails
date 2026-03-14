/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/geometric_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlGeometricTest", () => {
    it.skip("point column", async () => {});
    it.skip("point default", async () => {});
    it.skip("point type cast", async () => {});
    it.skip("point write", async () => {});
    it.skip("line column", async () => {});
    it.skip("line default", async () => {});
    it.skip("line type cast", async () => {});
    it.skip("line write", async () => {});
    it.skip("lseg column", async () => {});
    it.skip("lseg type cast", async () => {});
    it.skip("lseg write", async () => {});
    it.skip("box column", async () => {});
    it.skip("box type cast", async () => {});
    it.skip("box write", async () => {});
    it.skip("path column", async () => {});
    it.skip("path open", async () => {});
    it.skip("path closed", async () => {});
    it.skip("path type cast", async () => {});
    it.skip("path write", async () => {});
    it.skip("polygon column", async () => {});
    it.skip("polygon type cast", async () => {});
    it.skip("polygon write", async () => {});
    it.skip("circle column", async () => {});
    it.skip("circle type cast", async () => {});
    it.skip("circle write", async () => {});
    it.skip("geometric schema dump", async () => {});
    it.skip("geometric where", async () => {});
    it.skip("geometric invalid", async () => {});
    it.skip("geometric nil", async () => {});
    it.skip("mutation", () => {});
    it.skip("array assignment", () => {});
    it.skip("hash assignment", () => {});
    it.skip("string assignment", () => {});
    it.skip("empty string assignment", () => {});
    it.skip("array of points round trip", () => {});
    it.skip("legacy column", () => {});
    it.skip("legacy default", () => {});
    it.skip("legacy schema dumping", () => {});
    it.skip("legacy roundtrip", () => {});
    it.skip("legacy mutation", () => {});
    it.skip("geometric types", () => {});
    it.skip("alternative format", () => {});
    it.skip("geometric function", () => {});
    it.skip("geometric line type", () => {});
    it.skip("alternative format line type", () => {});
    it.skip("schema dumping for line type", () => {});
    it.skip("creating column with point type", () => {});
    it.skip("creating column with line type", () => {});
    it.skip("creating column with lseg type", () => {});
    it.skip("creating column with box type", () => {});
    it.skip("creating column with path type", () => {});
    it.skip("creating column with polygon type", () => {});
    it.skip("creating column with circle type", () => {});
  });
  it.skip("column", async () => {});

  it.skip("schema dumping", () => {});

  it.skip("roundtrip", async () => {});
});
