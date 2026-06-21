/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import {
  MyAppBusinessCompany,
  MyAppBusinessFirm,
  MyAppBusinessClient,
  MyAppBusinessClientContact,
  MyAppBusinessDeveloper,
  MyAppBusinessProject,
  MyAppBusinessPrefixedCompany,
  MyAppBusinessPrefixedNestedCompany,
  MyAppBusinessPrefixedFirm,
  MyAppBusinessSuffixedCompany,
  MyAppBusinessSuffixedNestedCompany,
  MyAppBusinessSuffixedFirm,
  MyAppBillingAccount,
} from "./test-helpers/models/company-in-module.js";

describe("ModulesTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({
      accounts: { name: "string" },
      billing_accounts: { name: "string" },
      app_billing_accounts: { name: "string" },
      accounts_archive: { name: "string" },
      accounts_archive_v2: { name: "string" },
      vehicles: { type: "string" },
      posts: { title: "string", author_id: "integer" },
    });
  });
  it.skip("module spanning associations", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — ruby-module-semantics
  });
  it.skip("module spanning has and belongs to many associations", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — ruby-module-semantics
  });
  it.skip("associations spanning cross modules", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — ruby-module-semantics
  });
  it.skip("find account and include company", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — ruby-module-semantics
  });

  it("table name", () => {
    expect(MyAppBillingAccount.tableName).toBe("accounts");
    expect(MyAppBusinessClient.tableName).toBe("companies");
    expect(MyAppBusinessClientContact.tableName).toBe("company_contacts");
  });

  it("assign ids", async () => {
    class Account extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    const a = await Account.create({ name: "test" });
    expect(a.id).toBeDefined();
  });

  it.skip("eager loading in modules", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — ruby-module-semantics
  });

  it("module table name prefix", () => {
    expect(MyAppBusinessPrefixedCompany.tableName).toBe("prefixed_companies");
    expect(MyAppBusinessPrefixedNestedCompany.tableName).toBe("prefixed_companies");
    expect(MyAppBusinessPrefixedFirm.tableName).toBe("companies");
  });

  it("module table name prefix with global prefix", () => {
    // Mirrors Rails set/reset/assert/ensure. The mutation of the global
    // Base.tableNamePrefix and the recompute via resetTableName run fully
    // synchronously (no awaits), so no sibling test can observe the mutated
    // global before the finally restores it.
    const classes = [
      MyAppBusinessCompany,
      MyAppBusinessFirm,
      MyAppBusinessClient,
      MyAppBusinessClientContact,
      MyAppBusinessDeveloper,
      MyAppBusinessProject,
      MyAppBusinessPrefixedCompany,
      MyAppBusinessPrefixedNestedCompany,
      MyAppBillingAccount,
    ];
    Base.tableNamePrefix = "global_";
    try {
      classes.forEach((klass) => klass.resetTableName());
      expect(MyAppBusinessCompany.tableName).toBe("global_companies");
      expect(MyAppBusinessPrefixedCompany.tableName).toBe("prefixed_companies");
      expect(MyAppBusinessPrefixedNestedCompany.tableName).toBe("prefixed_companies");
      expect(MyAppBusinessPrefixedFirm.tableName).toBe("companies");
    } finally {
      Base.tableNamePrefix = "";
      classes.forEach((klass) => klass.resetTableName());
    }
  });

  it("module table name suffix", () => {
    expect(MyAppBusinessSuffixedCompany.tableName).toBe("companies_suffixed");
    expect(MyAppBusinessSuffixedNestedCompany.tableName).toBe("companies_suffixed");
    expect(MyAppBusinessSuffixedFirm.tableName).toBe("companies");
  });

  it("module table name suffix with global suffix", () => {
    // Mirrors Rails set/reset/assert/ensure; see the prefix test above for why
    // the synchronous mutate-and-restore is safe under shared-worker fixtures.
    const classes = [
      MyAppBusinessCompany,
      MyAppBusinessFirm,
      MyAppBusinessClient,
      MyAppBusinessClientContact,
      MyAppBusinessDeveloper,
      MyAppBusinessProject,
      MyAppBusinessSuffixedCompany,
      MyAppBusinessSuffixedNestedCompany,
      MyAppBillingAccount,
    ];
    Base.tableNameSuffix = "_global";
    try {
      classes.forEach((klass) => klass.resetTableName());
      expect(MyAppBusinessCompany.tableName).toBe("companies_global");
      expect(MyAppBusinessSuffixedCompany.tableName).toBe("companies_suffixed");
      expect(MyAppBusinessSuffixedNestedCompany.tableName).toBe("companies_suffixed");
      expect(MyAppBusinessSuffixedFirm.tableName).toBe("companies");
    } finally {
      Base.tableNameSuffix = "";
      classes.forEach((klass) => klass.resetTableName());
    }
  });
});
