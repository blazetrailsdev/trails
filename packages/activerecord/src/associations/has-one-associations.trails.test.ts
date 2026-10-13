import { describe, it, expect, vi } from "vitest";
import { registerModel, RecordNotFound } from "../index.js";
import { Company, Firm } from "../test-helpers/models/company.js";
import { Account } from "../test-helpers/models/account.js";
import { fixtures } from "../test-fixtures.js";
import { assertQueriesMatch } from "../testing/query-assertions.js";

type AccountAttributes = { credit_limit: number };
type AccountBuilders = {
  createAccount(attributes: AccountAttributes): Promise<Account>;
  buildAccount(attributes: AccountAttributes): Promise<Account>;
};

describe("HasOneAssociationsTest", () => {
  const { companies } = fixtures(["companies", "accounts"]);
  registerModel(Company);
  registerModel(Firm);
  registerModel(Account);

  async function findCompany(id: unknown): Promise<Company & AccountBuilders> {
    return (await Company.find(id)) as Company & AccountBuilders;
  }

  it("direct destroy records destroyed account id via unloaded belongs_to", async () => {
    const account = await Account.find(1);
    expect(account.association("firm").isLoaded()).toBe(false);
    expect(Account.destroyedAccountIds().get(account.firm_id) ?? []).toEqual([]);
    await account.destroy();
    expect(Account.destroyedAccountIds().get(account.firm_id) ?? []).toEqual([account.id]);
  });

  it("direct destroy only preloads the belongs_to the callback references", async () => {
    const account = await Account.find(1);
    expect(account.association("firm").isLoaded()).toBe(false);
    expect(account.association("unautosavedFirm").isLoaded()).toBe(false);
    await assertQueriesMatch(/FROM\s+.?companies.?/i, 1, false, async () => {
      await account.destroy();
    });
  });

  it("create over a loaded target nullifies the prior account", async () => {
    const company = await Company.create({ name: "NewCo" });
    const original = await Account.create({ firm_id: Number(company.id), credit_limit: 50 });
    const found = await findCompany(company.id);
    await found.account;
    const created = await found.createAccount({ credit_limit: 70 });
    expect((await Account.find(original.id)).firm_id).toBeNull();
    expect(await Account.where({ firm_id: Number(company.id) }).count()).toBe(1);
    expect((await found.account)!.id).toBe(created.id);
  });

  it("create over a loaded target destroys the prior dependent account", async () => {
    const firm = companies("first_firm") as Firm & AccountBuilders;
    const originalId = (await firm.account)!.id;
    const created = await firm.createAccount({ credit_limit: 70 });
    await expect(Account.find(originalId)).rejects.toThrow(RecordNotFound);
    expect((await firm.account)!.id).toBe(created.id);
  });

  it("create over an unloaded target nullifies the prior account", async () => {
    const company = await Company.create({ name: "UnloadedCo" });
    const original = await Account.create({ firm_id: Number(company.id), credit_limit: 50 });
    const found = await findCompany(company.id);
    const created = await found.createAccount({ credit_limit: 70 });
    expect((await Account.find(original.id)).firm_id).toBeNull();
    expect(await Account.where({ firm_id: Number(company.id) }).count()).toBe(1);
    expect((await found.account)!.id).toBe(created.id);
  });

  it("create over an unloaded target destroys the prior dependent account", async () => {
    const firm = (await Firm.find(companies("first_firm").id)) as Firm & AccountBuilders;
    const originalId = (await Account.where({ firm_id: Number(firm.id) }).first())!.id;
    const created = await firm.createAccount({ credit_limit: 70 });
    await expect(Account.find(originalId)).rejects.toThrow(RecordNotFound);
    expect((await firm.account)!.id).toBe(created.id);
  });

  it("create re-raises a deferred target-load error after a successful build", async () => {
    const company = await Company.create({ name: "DeferredLoadCo" });
    const found = await findCompany(company.id);
    const association = found.association("account") as unknown as {
      isLoaded(): boolean;
      loadTargetForBuild(): Promise<unknown>;
    };
    expect(association.isLoaded()).toBe(false);
    const loadError = new Error("connection lost while loading the displaced target");
    vi.spyOn(association, "loadTargetForBuild").mockRejectedValue(loadError);

    await expect(found.createAccount({ credit_limit: 70 })).rejects.toBe(loadError);
    expect(await Account.where({ firm_id: Number(company.id) }).count()).toBe(1);
  });

  it("build over a loaded target nullifies the prior account", async () => {
    const company = await Company.create({ name: "BuildCo" });
    const original = await Account.create({ firm_id: Number(company.id), credit_limit: 50 });
    const found = await findCompany(company.id);
    await found.account;
    const built = await found.buildAccount({ credit_limit: 70 });
    expect((await Account.find(original.id)).firm_id).toBeNull();
    expect(built.isPersisted()).toBe(false);
  });
});
