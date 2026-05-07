/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/type_lookup_test.rb
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

  describe("PostgresqlTypeLookupTest", () => {
    it.skip("type lookup", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in type-lookup
      // ROOT-CAUSE: adapters/postgresql/type-lookup.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/type-lookup.ts; affects ~10–47 tests in type-lookup.test.ts
    });
    it.skip("type lookup array", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in type-lookup
      // ROOT-CAUSE: adapters/postgresql/type-lookup.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/type-lookup.ts; affects ~10–47 tests in type-lookup.test.ts
    });
    it.skip("type lookup custom", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in type-lookup
      // ROOT-CAUSE: adapters/postgresql/type-lookup.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/type-lookup.ts; affects ~10–47 tests in type-lookup.test.ts
    });
    it.skip("array delimiters are looked up correctly", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in type-lookup
      // ROOT-CAUSE: adapters/postgresql/type-lookup.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/type-lookup.ts; affects ~10–47 tests in type-lookup.test.ts
    });
    it.skip("array types correctly respect registration of subtypes", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in type-lookup
      // ROOT-CAUSE: adapters/postgresql/type-lookup.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/type-lookup.ts; affects ~10–47 tests in type-lookup.test.ts
    });
    it.skip("range types correctly respect registration of subtypes", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in type-lookup
      // ROOT-CAUSE: adapters/postgresql/type-lookup.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/type-lookup.ts; affects ~10–47 tests in type-lookup.test.ts
    });
  });
});
