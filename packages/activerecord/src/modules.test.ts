import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  assertEqual,
  assertNil,
  assertNot,
  assertNotNil,
  assertNothingRaised,
  constantize,
} from "@blazetrails/activesupport";
import {
  isRegisteredConstant,
  registerConstant,
  unregisterConstant,
} from "@blazetrails/ruby-compat";
import { Base } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { assertNoQueries } from "./testing/query-assertions.js";
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
  MyAppBillingFirm,
  MyAppBillingNestedFirm,
} from "./test-helpers/models/company-in-module.js";
import { ShopCollection } from "./test-helpers/models/shop.js";
import { ShopProduct } from "./test-helpers/models/shop.js";

describe("ModulesTest", () => {
  fixtures([
    "accounts",
    "companies",
    "projects",
    "developers",
    "collections",
    "products",
    "variants",
  ]);

  let undefinedConsts: Record<string, unknown>;

  beforeEach(() => {
    undefinedConsts = {};

    for (const constant of ["Firm", "Client"]) {
      if (isRegisteredConstant(constant)) {
        undefinedConsts[constant] = constantize(constant);
        unregisterConstant(constant, undefinedConsts[constant]);
      }
    }

    Base.storeFullStiClass = false;
  });

  afterEach(() => {
    for (const [constant, value] of Object.entries(undefinedConsts)) {
      if (value != null) registerConstant(constant, value);
    }

    Base.storeFullStiClass = true;
  });

  it("module spanning associations", async () => {
    const firm = await MyAppBusinessFirm.first();
    assertNot(await firm!.clients.isEmpty(), "Firm should have clients");
    assertNil(
      (firm!.constructor as typeof MyAppBusinessFirm).tableName!.match("::"),
      "Firm shouldn't have the module appear in its table name",
    );
  });

  it("module spanning has and belongs to many associations", async () => {
    const project = await MyAppBusinessProject.first();
    await project!.developers.push(await MyAppBusinessDeveloper.create({ name: "John" }));
    assertEqual("John", (await project!.developers.last())!.name);
  });

  it("associations spanning cross modules", async () => {
    const account = await MyAppBillingAccount.all().mergeBang({ order: "id" }).first();
    expect(await account!.firm).toBeInstanceOf(MyAppBusinessFirm);
    expect(await account!.qualifiedBillingFirm).toBeInstanceOf(MyAppBillingFirm);
    expect(await account!.unqualifiedBillingFirm).toBeInstanceOf(MyAppBillingFirm);
    expect(await account!.nestedQualifiedBillingFirm).toBeInstanceOf(MyAppBillingNestedFirm);
    expect(await account!.nestedUnqualifiedBillingFirm).toBeInstanceOf(MyAppBillingNestedFirm);
  });

  it("find account and include company", async () => {
    const account = await MyAppBillingAccount.all().mergeBang({ includes: "firm" }).find(1);
    expect(await account.firm).toBeInstanceOf(MyAppBusinessFirm);
  });

  it("table name", () => {
    expect(MyAppBillingAccount.tableName).toBe("accounts");
    expect(MyAppBusinessClient.tableName).toBe("companies");
    expect(MyAppBusinessClientContact.tableName).toBe("company_contacts");
  });

  it("assign ids", async () => {
    const firm = await MyAppBusinessFirm.first();
    const client = await MyAppBusinessClient.first();
    await assertNothingRaised(async () => {
      type WithAssociation = {
        association(name: string): { idsWriter(ids: number[]): Promise<void> };
      };
      await (firm as unknown as WithAssociation)
        .association("clients")
        .idsWriter([client!.id as number]);
    });
  });

  it("eager loading in modules", async () => {
    const clients: MyAppBusinessClient[] = [];

    await assertNothingRaised(async () => {
      clients.push(
        await MyAppBusinessClient.references("accounts")
          .mergeBang({ includes: { firm: "account" }, where: "accounts.id IS NOT NULL" })
          .find(3),
      );
      clients.push(await MyAppBusinessClient.includes({ firm: "account" }).find(3));
    });

    for (const client of clients) {
      await assertNoQueries(false, async () => {
        assertNotNil(await (await client.firm)!.account);
      });
    }
  });

  it("module table name prefix", () => {
    expect(MyAppBusinessPrefixedCompany.tableName).toBe("prefixed_companies");
    expect(MyAppBusinessPrefixedNestedCompany.tableName).toBe("prefixed_companies");
    expect(MyAppBusinessPrefixedFirm.tableName).toBe("companies");
  });

  it("module table name prefix with global prefix", () => {
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

  it("compute type can infer class name of sibling inside module", () => {
    const prev = Base.storeFullStiClass;
    Base.storeFullStiClass = true;
    try {
      expect(MyAppBusinessClient.computeType("Firm")).toBe(MyAppBusinessFirm);
    } finally {
      Base.storeFullStiClass = prev;
    }
  });

  it("nested models should not raise exception when using delete all dependency on association", async () => {
    const prev = Base.storeFullStiClass;
    Base.storeFullStiClass = true;
    try {
      const collection = await ShopCollection.first();
      assertNot((await collection!.products).length === 0, "Collection should have products");
      await assertNothingRaised(() => collection!.destroy());
    } finally {
      Base.storeFullStiClass = prev;
    }
  });

  it("nested models should not raise exception when using nullify dependency on association", async () => {
    const prev = Base.storeFullStiClass;
    Base.storeFullStiClass = true;
    try {
      const product = await ShopProduct.first();
      assertNot((await product!.variants).length === 0, "Product should have variants");
      await assertNothingRaised(() => product!.destroy());
    } finally {
      Base.storeFullStiClass = prev;
    }
  });
});
