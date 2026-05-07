/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/schema_authorization_test.rb
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

  describe("SchemaAuthorizationTest", () => {
    it.skip("schema authorization", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in schema-authorization
      // ROOT-CAUSE: adapters/postgresql/schema-authorization.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/schema-authorization.ts; affects ~10–47 tests in schema-authorization.test.ts
    });
    it.skip("schema authorization with quoted names", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in schema-authorization
      // ROOT-CAUSE: adapters/postgresql/schema-authorization.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/schema-authorization.ts; affects ~10–47 tests in schema-authorization.test.ts
    });
    it.skip("session authorization", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in schema-authorization
      // ROOT-CAUSE: adapters/postgresql/schema-authorization.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/schema-authorization.ts; affects ~10–47 tests in schema-authorization.test.ts
    });
    it.skip("reset authorization", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in schema-authorization
      // ROOT-CAUSE: adapters/postgresql/schema-authorization.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/schema-authorization.ts; affects ~10–47 tests in schema-authorization.test.ts
    });
    it.skip("sequence schema authorization", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in schema-authorization
      // ROOT-CAUSE: adapters/postgresql/schema-authorization.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/schema-authorization.ts; affects ~10–47 tests in schema-authorization.test.ts
    });
    it.skip("tables schema authorization", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in schema-authorization
      // ROOT-CAUSE: adapters/postgresql/schema-authorization.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/schema-authorization.ts; affects ~10–47 tests in schema-authorization.test.ts
    });
    it.skip("schema invisible", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in schema-authorization
      // ROOT-CAUSE: adapters/postgresql/schema-authorization.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/schema-authorization.ts; affects ~10–47 tests in schema-authorization.test.ts
    });
    it.skip("session auth=", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in schema-authorization
      // ROOT-CAUSE: adapters/postgresql/schema-authorization.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/schema-authorization.ts; affects ~10–47 tests in schema-authorization.test.ts
    });
    it.skip("setting auth clears stmt cache", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in schema-authorization
      // ROOT-CAUSE: adapters/postgresql/schema-authorization.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/schema-authorization.ts; affects ~10–47 tests in schema-authorization.test.ts
    });
    it.skip("auth with bind", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in schema-authorization
      // ROOT-CAUSE: adapters/postgresql/schema-authorization.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/schema-authorization.ts; affects ~10–47 tests in schema-authorization.test.ts
    });
    it.skip("sequence schema caching", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in schema-authorization
      // ROOT-CAUSE: adapters/postgresql/schema-authorization.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/schema-authorization.ts; affects ~10–47 tests in schema-authorization.test.ts
    });
    it.skip("tables in current schemas", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in schema-authorization
      // ROOT-CAUSE: adapters/postgresql/schema-authorization.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/schema-authorization.ts; affects ~10–47 tests in schema-authorization.test.ts
    });
  });
});
