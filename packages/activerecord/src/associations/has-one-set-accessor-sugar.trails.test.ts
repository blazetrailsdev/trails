/**
 * Trails-only surface: the generated `set#{Name}` awaitable accessor
 * (`await firm.setAccount(x)` / `await member.setClub(x)`), the RFC 0068
 * ergonomic alternative to the racy native `firm.account = x` property setter.
 *
 * It is a thin delegation to `association(name).writer(value)`, so it inherits
 * the Rails-faithful immediate-persist replace path
 * (`HasOneAssociation#writeImmediate/persistImmediate`, and the
 * `HasOneThroughAssociation#writer` → `persistReplace` override for through).
 * Rails reaches that path through the synchronous `=` setter, which in JS
 * cannot await, so these assertions have no verbatim Rails test to mirror.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  registerModel,
  enableSti,
  registerSubclass,
  RecordNotSaved,
  RecordNotFound,
  type Base,
} from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import {
  Company,
  Firm,
  DependentFirm,
  ExclusivelyDependentFirm,
  RestrictedWithExceptionFirm,
  RestrictedWithErrorFirm,
  Client,
} from "../test-helpers/models/company.js";
import { Account } from "../test-helpers/models/account.js";
import { Pirate } from "../test-helpers/models/pirate.js";
import { Ship } from "../test-helpers/models/ship.js";
import { Member } from "../test-helpers/models/member.js";
import { Club } from "../test-helpers/models/club.js";
import { Membership, CurrentMembership } from "../test-helpers/models/membership.js";

type Setter = { [k: string]: (value: Base | null) => Promise<void> };
const set = (owner: unknown) => owner as Setter;

async function readHasOne(owner: Base, name: string): Promise<Base | null> {
  return await (
    owner as unknown as { association(n: string): { loadTarget(): Promise<Base | null> } }
  )
    .association(name)
    .loadTarget();
}

describe("has_one set#{Name} awaitable accessor", () => {
  const { companies, pirates } = fixtures(["companies", "accounts", "pirates", "ships"]);

  beforeAll(() => {
    registerModel(Company);
    registerModel(Firm);
    registerModel(DependentFirm);
    registerModel(ExclusivelyDependentFirm);
    registerModel(RestrictedWithExceptionFirm);
    registerModel(RestrictedWithErrorFirm);
    registerModel(Client);
    registerModel(Account);
    enableSti(Company);
    registerSubclass(Firm);
    registerSubclass(DependentFirm);
    registerSubclass(ExclusivelyDependentFirm);
    registerSubclass(RestrictedWithExceptionFirm);
    registerSubclass(RestrictedWithErrorFirm);
    registerSubclass(Client);
    registerModel(Pirate);
    registerModel(Ship);
  });

  it("persists the replacement immediately on a persisted owner", async () => {
    const firm = (await Firm.find(1)) as Base;
    const account = new Account({ credit_limit: 1000 });

    await set(firm).setAccount(account);

    // Immediate persist, not deferred to `firm.save()`.
    expect(account.isPersisted()).toBe(true);
    expect((await readHasOne(firm, "account"))?.id).toBe(account.id);
  });

  it("destroys the displaced dependent target inline, not at owner save", async () => {
    const firm = companies("first_firm") as Base;
    const oldAccountId = (await readHasOne(firm, "account"))?.id;

    await set(firm).setAccount(new Account({ credit_limit: 5 }));

    // No `firm.save()`: the dependent: :destroy removal already ran.
    await expect(Account.find(oldAccountId)).rejects.toThrow(RecordNotFound);
  });

  it("nullifies the displaced dependent-nullify target inline", async () => {
    const firm = companies("rails_core") as Base;
    const oldAccountId = (await readHasOne(firm, "account"))?.id;

    await set(firm).setAccount(new Account({ credit_limit: 5 }));

    expect((await Account.find(oldAccountId)).firm_id).toBeNull();
  });

  it("clears the association when set to null", async () => {
    const firm = companies("first_firm") as Base;
    const oldAccountId = (await readHasOne(firm, "account"))?.id;

    await set(firm).setAccount(null);

    expect(await readHasOne(firm, "account")).toBeNull();
    await expect(Account.find(oldAccountId)).rejects.toThrow(RecordNotFound);
  });

  it("rejects with RecordNotSaved when the new record fails to save", async () => {
    const pirate = pirates("redbeard") as Base;
    const newShip = new Ship();

    let error: unknown;
    try {
      await set(pirate).setShip(newShip);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RecordNotSaved);
    expect((error as { record: unknown }).record).toBe(newShip);
    expect(await readHasOne(pirate, "ship")).toBeNull();
  });
});

describe("has_one :through set#{Name} awaitable accessor", () => {
  const { members } = fixtures(["members", "clubs", "memberships"]);

  beforeAll(() => {
    registerModel(Member);
    registerModel(Club);
    enableSti(Membership);
    registerModel(Membership);
    registerModel(CurrentMembership);
  });

  it("replaces the through target immediately on a persisted owner", async () => {
    const member = members("groucho") as Base;
    const newClub = await Club.create({ name: "Marx Bros" });

    await set(member).setClub(newClub);
    await (member as unknown as { reload(): Promise<unknown> }).reload();

    expect((await readHasOne(member, "club"))?.id).toBe(newClub.id);
  });
});
