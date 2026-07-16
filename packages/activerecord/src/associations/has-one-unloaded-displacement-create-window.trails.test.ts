/**
 * trails-only regression (no Rails counterpart).
 *
 * Rails' `HasOneAssociation#replace` (has_one_association.rb:66-84) removes the
 * displaced record synchronously at assignment, so by the time `create_account`
 * runs the old row is already detached — the window this file covers cannot
 * exist there. The JS property setter cannot `await`, so `queueWrite` defers the
 * removal to the owner's save. When the has_one was *unloaded* at assignment
 * there is no in-memory `_displacedRecord`, only `_removeDisplacedFromDb`, and
 * the removal is resolved by an FK re-query at save time. A `createAccount()` in
 * between inserts a second FK-matching row, so that re-query could return the
 * just-created account, trip `removeDisplaced`'s `!sameRecord(found, savedTarget)`
 * guard, and leave the *old* account attached — the outcome then depended on DB
 * row ordering. `_createRecord` now flushes the pending displacement before its
 * insert, restoring Rails' ordering.
 */
import { describe, it, expect } from "vitest";
import { Company } from "../test-helpers/models/company.js";
import { Account } from "../test-helpers/models/account.js";
import { fixtures } from "../test-helpers/fixtures.js";

// The generated `create#{name}` accessor is not on the model's declared type.
interface CreatesAccount {
  createAccount(attributes: Record<string, unknown>): Promise<Account | null>;
}

describe("has_one unloaded displacement followed by create", () => {
  fixtures(["companies", "accounts"]);

  it("detaches the prior DB account when create_account follows an unloaded displacement", async () => {
    const company = await Company.create({ name: "37signals" });
    const original = await Account.create({ firm_id: company.id, credit_limit: 50 });

    // Re-find the company so its `account` association is unloaded: the deferred
    // setter then records `_removeDisplacedFromDb` with no in-memory target.
    const reloaded = await Company.find(company.id);
    reloaded.account = Account.new({ credit_limit: 60 });

    const owner = reloaded as Company & CreatesAccount;
    const created = (await owner.createAccount({ credit_limit: 70 })) as Account;

    // Rails has already detached the old account by the time `create_account`
    // returns. Asserting here — before the owner's save — pins the ordering
    // rather than the luck of which FK-matching row the save-time re-query
    // happens to see first.
    expect((await Account.find(original.id)).firm_id).toBeNull();

    await reloaded.save();

    expect((await Account.find(original.id)).firm_id).toBeNull();
    expect((await Account.find(created.id)).firm_id).toBe(company.id);
    expect(await Account.where({ firm_id: company.id }).count()).toBe(1);
  });
});
