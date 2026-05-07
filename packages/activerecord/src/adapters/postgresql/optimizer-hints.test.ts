/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/optimizer_hints_test.rb
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

  describe("PostgreSQLOptimizerHintsTest", () => {
    it.skip("optimizer hints", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in optimizer-hints
      // ROOT-CAUSE: adapters/postgresql/optimizer-hints.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/optimizer-hints.ts; affects ~10–47 tests in optimizer-hints.test.ts
    });
    it.skip("optimizer hints with count", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in optimizer-hints
      // ROOT-CAUSE: adapters/postgresql/optimizer-hints.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/optimizer-hints.ts; affects ~10–47 tests in optimizer-hints.test.ts
    });
    it.skip("optimizer hints with delete all", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in optimizer-hints
      // ROOT-CAUSE: adapters/postgresql/optimizer-hints.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/optimizer-hints.ts; affects ~10–47 tests in optimizer-hints.test.ts
    });
    it.skip("optimizer hints with update all", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in optimizer-hints
      // ROOT-CAUSE: adapters/postgresql/optimizer-hints.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/optimizer-hints.ts; affects ~10–47 tests in optimizer-hints.test.ts
    });
    it.skip("optimizer hints with pluck", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in optimizer-hints
      // ROOT-CAUSE: adapters/postgresql/optimizer-hints.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/optimizer-hints.ts; affects ~10–47 tests in optimizer-hints.test.ts
    });

    it.skip("optimizer hints with count subquery", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in optimizer-hints
      // ROOT-CAUSE: adapters/postgresql/optimizer-hints.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/optimizer-hints.ts; affects ~10–47 tests in optimizer-hints.test.ts
    });

    it.skip("optimizer hints is sanitized", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in optimizer-hints
      // ROOT-CAUSE: adapters/postgresql/optimizer-hints.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/optimizer-hints.ts; affects ~10–47 tests in optimizer-hints.test.ts
    });

    it.skip("optimizer hints with unscope", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in optimizer-hints
      // ROOT-CAUSE: adapters/postgresql/optimizer-hints.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/optimizer-hints.ts; affects ~10–47 tests in optimizer-hints.test.ts
    });

    it.skip("optimizer hints with or", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in optimizer-hints
      // ROOT-CAUSE: adapters/postgresql/optimizer-hints.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/optimizer-hints.ts; affects ~10–47 tests in optimizer-hints.test.ts
    });
  });
});
