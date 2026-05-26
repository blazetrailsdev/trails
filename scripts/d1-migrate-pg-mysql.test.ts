import { describe, it, expect } from "vitest";
import { migrateText } from "./d1-migrate-pg-mysql.js";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname!, "..");
const PG_FILE = resolve(ROOT, "packages/activerecord/src/adapters/postgresql/explain.test.ts");
const MYSQL_FILE = resolve(
  ROOT,
  "packages/activerecord/src/adapters/abstract-mysql-adapter/mysql-explain.test.ts",
);

describe("d1-migrate-pg-mysql", () => {
  it("transforms PG beforeAll pattern", () => {
    const input = `
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { defineSchema } from "../../test-helpers/define-schema.js";
import { withTransactionalFixtures } from "../../test-helpers/with-transactional-fixtures.js";

beforeAll(() => { vi.stubEnv("AR_NO_AUTO_SCHEMA", "1"); });
afterAll(() => { vi.unstubAllEnvs(); });

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeAll(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await defineSchema(adapter, {});
  });
  afterAll(async () => {
    await adapter.close();
  });
  withTransactionalFixtures(() => adapter);

  describe("Test", () => {
    it("works", async () => {
      const { Base } = await import("../../index.js");
      class Foo extends Base {
        static { this.adapter = adapter; }
      }
    });
  });
});
`;
    const result = migrateText(input, PG_FILE);
    expect(typeof result).toBe("string");
    const output = result as string;
    expect(output).toContain("setupHandlerSuite()");
    expect(output).toContain("useHandlerTransactionalFixtures()");
    expect(output).toContain("Base.connection as PostgreSQLAdapter");
    expect(output).not.toContain("new PostgreSQLAdapter(PG_TEST_URL)");
    expect(output).not.toContain("this.adapter = adapter");
    expect(output).not.toContain("adapter.close()");
    expect(output).not.toContain("withTransactionalFixtures");
    expect(output).not.toContain("PG_TEST_URL");
  });

  it("transforms MySQL beforeEach pattern", () => {
    const input = `
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { defineSchema } from "../../test-helpers/define-schema.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("Test", () => {
    it("works", async () => {
      const { Base } = await import("../../index.js");
      class Bar extends Base {
        static { this.adapter = adapter; }
      }
      await defineSchema(adapter, { bars: { name: "string" } });
    });
  });
});
`;
    const result = migrateText(input, MYSQL_FILE);
    expect(typeof result).toBe("string");
    const output = result as string;
    expect(output).toContain("setupHandlerSuite()");
    expect(output).not.toContain("useHandlerTransactionalFixtures");
    expect(output).toContain("Base.connection as Mysql2Adapter");
    expect(output).not.toContain("new Mysql2Adapter(MYSQL_TEST_URL)");
    expect(output).not.toContain("this.adapter = adapter");
    expect(output).not.toContain("adapter.close()");
    expect(output).not.toContain("MYSQL_TEST_URL");
    expect(output).toContain("defineSchema({");
  });

  it("skips already-migrated files", () => {
    const input = `
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
setupHandlerSuite();
`;
    const result = migrateText(input, PG_FILE);
    expect(result).toEqual({ skip: "already-migrated" });
  });

  it("handles this.adapter = adapter as any", () => {
    const input = `
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { defineSchema } from "../../test-helpers/define-schema.js";
import { withTransactionalFixtures } from "../../test-helpers/with-transactional-fixtures.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeAll(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await defineSchema(adapter, {});
  });
  afterAll(async () => { await adapter.close(); });
  withTransactionalFixtures(() => adapter);

  describe("Test", () => {
    it("works", async () => {
      const { Base } = await import("../../index.js");
      class Baz extends Base {
        static {
          this.tableName = "bazzes";
          this.adapter = adapter as any;
        }
      }
    });
  });
});
`;
    const result = migrateText(input, PG_FILE);
    expect(typeof result).toBe("string");
    const output = result as string;
    expect(output).not.toContain("this.adapter = adapter");
    expect(output).toContain('this.tableName = "bazzes"');
  });
});
