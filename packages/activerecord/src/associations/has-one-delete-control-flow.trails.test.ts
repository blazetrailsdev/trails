import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import "../support/canonical-model-index.js";
import { Account } from "../test-helpers/models/account.js";
import { Firm } from "../test-helpers/models/company.js";

type Deletable = { delete(method?: string): Promise<void> };

describe("HasOneAssociation#delete control flow", () => {
  const { accounts, companies } = fixtures(["accounts", "companies"]);

  it("delete leaves the target alone when the association has no :dependent", async () => {
    const firm = await Firm.find(companies("first_firm").id);
    const association = firm.association("dummyAccount") as unknown as Deletable;

    await association.delete();

    expect(await Account.isExists(accounts("signals37").id)).toBe(true);
  });
});
