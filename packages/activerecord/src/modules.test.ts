import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./index.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
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
import { ShopCollection } from "./test-helpers/models/shop.js";
import { ShopProduct } from "./test-helpers/models/shop.js";

describe("ModulesTest", () => {
  useHandlerFixtures([
    "accounts",
    "companies",
    "projects",
    "developers",
    "collections",
    "products",
    "variants",
  ]);

  // Rails setup: store_full_sti_class = false; teardown: restore to true.
  // Module-namespaced models (MyAppBusiness*) store demodulized type names in
  // the DB — the fixture data uses "Firm" / "Client", not the full module path.
  let _prevStoreFullStiClass: boolean;
  beforeEach(() => {
    _prevStoreFullStiClass = Base.storeFullStiClass;
    Base.storeFullStiClass = false;
  });
  afterEach(() => {
    Base.storeFullStiClass = _prevStoreFullStiClass;
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
    const firm = await MyAppBusinessFirm.first();
    const client = await MyAppBusinessClient.first();
    let error: unknown;
    try {
      type WithClients = { clients: { setIds(ids: number[]): Promise<void> } };
      await (firm as unknown as WithClients).clients.setIds([client!.id as number]);
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
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

  it.skip("compute type can infer class name of sibling inside module", () => {
    // TRACKED-PENDING-CONVERGENCE: trails computeType enforces a subclass constraint
    // that Rails does not — sibling lookup (Firm from Client.computeType("Firm"))
    // throws SubclassNotFound in trails. Convergence needed in inheritance.ts.
    // Rails modules_test.rb:146-147 sets store_full_sti_class = true for this test;
    // the outer beforeEach leaves it false, so restore it here for future un-skippers.
    const prev = Base.storeFullStiClass;
    Base.storeFullStiClass = true;
    try {
      expect(MyAppBusinessClient.computeType("Firm")).toBe(MyAppBusinessFirm);
    } finally {
      Base.storeFullStiClass = prev;
    }
  });

  it("nested models should not raise exception when using delete all dependency on association", async () => {
    const collection = await ShopCollection.first();
    expect(await collection!.products.toArray()).not.toEqual([]);
    let error: unknown;
    try {
      await collection!.destroy();
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });

  it("nested models should not raise exception when using nullify dependency on association", async () => {
    const product = await ShopProduct.first();
    expect(await product!.variants.toArray()).not.toEqual([]);
    let error: unknown;
    try {
      await product!.destroy();
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });
});
