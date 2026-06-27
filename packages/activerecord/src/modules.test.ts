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
import { ShopCollection, ShopProduct } from "./test-helpers/models/shop.js";

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
    // PERMANENT-SKIP: Ruby Module#ancestors / constant-path lookup for cross-module association
    // resolution has no JS equivalent (scripts/api-compare/unported-files.ts).
  });
  it.skip("module spanning has and belongs to many associations", () => {
    // PERMANENT-SKIP: Ruby Module#ancestors / constant-path lookup for cross-module association
    // resolution has no JS equivalent (scripts/api-compare/unported-files.ts).
  });
  it.skip("associations spanning cross modules", () => {
    // PERMANENT-SKIP: Ruby Module#ancestors / constant-path lookup for cross-module association
    // resolution has no JS equivalent (scripts/api-compare/unported-files.ts).
  });
  it.skip("find account and include company", () => {
    // PERMANENT-SKIP: Ruby Module#ancestors / constant-path lookup for cross-module association
    // resolution has no JS equivalent (scripts/api-compare/unported-files.ts).
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
    // PERMANENT-SKIP: Ruby Module#ancestors / constant-path lookup for cross-module association
    // resolution has no JS equivalent (scripts/api-compare/unported-files.ts).
  });

  it("module table name prefix", () => {
    expect(MyAppBusinessPrefixedCompany.tableName).toBe("prefixed_companies");
    expect(MyAppBusinessPrefixedNestedCompany.tableName).toBe("prefixed_companies");
    expect(MyAppBusinessPrefixedFirm.tableName).toBe("companies");
  });

  it("module table name prefix with global prefix", () => {
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
    // TRACKED-PENDING-CONVERGENCE: trails computeType enforces a subclass constraint that
    // Rails does not — sibling lookup (Firm from Client.computeType("Firm")) throws
    // SubclassNotFound in trails. Story: compute-type-sibling-lookup (RFC 0019).
    // Listed in scripts/api-compare/unported-files.ts until convergence lands.
    expect(MyAppBusinessClient.computeType("Firm")).toBe(MyAppBusinessFirm);
  });

  it("nested models should not raise exception when using delete all dependency on association", async () => {
    const prev = Base.storeFullStiClass;
    Base.storeFullStiClass = true;
    try {
      const collection = await ShopCollection.first();
      expect(await collection!.products.toArray()).not.toEqual([]);
      let error: unknown;
      try {
        await collection!.destroy();
      } catch (e) {
        error = e;
      }
      expect(error).toBeUndefined();
    } finally {
      Base.storeFullStiClass = prev;
    }
  });

  it("nested models should not raise exception when using nullify dependency on association", async () => {
    const prev = Base.storeFullStiClass;
    Base.storeFullStiClass = true;
    try {
      const product = await ShopProduct.first();
      expect(await product!.variants.toArray()).not.toEqual([]);
      let error: unknown;
      try {
        await product!.destroy();
      } catch (e) {
        error = e;
      }
      expect(error).toBeUndefined();
    } finally {
      Base.storeFullStiClass = prev;
    }
  });
});
