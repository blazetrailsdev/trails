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
  MyAppBusinessClient,
  MyAppBusinessClientContact,
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

  it.skip("module table name prefix with global prefix", () => {
    // Mutates ActiveRecord::Base.table_name_prefix globally + reset_table_name;
    // unsafe under shared-worker parallel fixtures. Tracked as follow-up story
    // module-namespaced-table-name-global-prefix-suffix-reset.
  });

  it("module table name suffix", () => {
    expect(MyAppBusinessSuffixedCompany.tableName).toBe("companies_suffixed");
    expect(MyAppBusinessSuffixedNestedCompany.tableName).toBe("companies_suffixed");
    expect(MyAppBusinessSuffixedFirm.tableName).toBe("companies");
  });

  it.skip("module table name suffix with global suffix", () => {
    // Mutates ActiveRecord::Base.table_name_suffix globally + reset_table_name;
    // unsafe under shared-worker parallel fixtures. Tracked as follow-up story
    // module-namespaced-table-name-global-prefix-suffix-reset.
  });
});
