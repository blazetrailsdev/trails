import { describe, it, expect } from "vitest";
import type { Base } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Firm } from "../test-helpers/models/company.js";
import { Account } from "../test-helpers/models/account.js";
import "../test-helpers/models/person.js";

type CreatesAccount = {
  createAccount(
    attributes: Record<string, unknown>,
    block: (record: Base) => Promise<void>,
  ): Promise<Account>;
};

describe("SingularAssociation#_create_record with an async block", () => {
  fixtures(["companies", "accounts"]);

  it("awaits the block before saving", async () => {
    const firm = (await Firm.create({ name: "GlobalMegaCorp" })) as unknown as CreatesAccount;
    const account = await firm.createAccount({ credit_limit: 10 }, async (record) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      (record as Account).credit_limit = 99;
    });
    expect((await Account.find(account.id)).credit_limit).toBe(99);
  });
});
