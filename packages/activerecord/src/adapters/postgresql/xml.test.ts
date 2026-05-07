/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/xml_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgreSQLXMLTest", () => {
    it.skip("xml column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in xml
      // ROOT-CAUSE: adapters/postgresql/xml.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/xml.ts; affects ~10–47 tests in xml.test.ts
    });
    it.skip("xml default", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in xml
      // ROOT-CAUSE: adapters/postgresql/xml.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/xml.ts; affects ~10–47 tests in xml.test.ts
    });
    it.skip("xml type cast", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in xml
      // ROOT-CAUSE: adapters/postgresql/xml.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/xml.ts; affects ~10–47 tests in xml.test.ts
    });
    it.skip("xml write", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in xml
      // ROOT-CAUSE: adapters/postgresql/xml.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/xml.ts; affects ~10–47 tests in xml.test.ts
    });
    it.skip("xml schema dump", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in xml
      // ROOT-CAUSE: adapters/postgresql/xml.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/xml.ts; affects ~10–47 tests in xml.test.ts
    });
    it.skip("null xml", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in xml
      // ROOT-CAUSE: adapters/postgresql/xml.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/xml.ts; affects ~10–47 tests in xml.test.ts
    });
    it.skip("round trip", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in xml
      // ROOT-CAUSE: adapters/postgresql/xml.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/xml.ts; affects ~10–47 tests in xml.test.ts
    });
    it.skip("update all", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in xml
      // ROOT-CAUSE: adapters/postgresql/xml.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/xml.ts; affects ~10–47 tests in xml.test.ts
      /* TODO: needs imports from original file */
    });
  });
});
