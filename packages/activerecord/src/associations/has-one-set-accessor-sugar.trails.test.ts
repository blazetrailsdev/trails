import { describe, it, expect, beforeAll, vi } from "vitest";
import {
  registerModel,
  registerSubclass,
  RecordNotSaved,
  RecordNotFound,
  type Base,
} from "../index.js";
import { fixtures } from "../test-fixtures.js";
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
import { Sponsor } from "../test-helpers/models/sponsor.js";

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
    Company.inheritanceColumn = "type";
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

    expect(account.isPersisted()).toBe(true);
    expect((await readHasOne(firm, "account"))?.id).toBe(account.id);
  });

  it("destroys the displaced dependent target inline, not at owner save", async () => {
    const firm = companies("first_firm") as Base;
    const oldAccountId = (await readHasOne(firm, "account"))?.id;

    await set(firm).setAccount(new Account({ credit_limit: 5 }));

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
    Membership.inheritanceColumn = "type";
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

describe("polymorphic has_one set#{Name} awaitable accessor", () => {
  const { members } = fixtures(["members", "sponsors"]);

  beforeAll(() => {
    registerModel(Member);
    registerModel(Sponsor);
  });

  it("persists the replacement, setting the polymorphic foreign key and type", async () => {
    const member = members("groucho") as Base;
    const sponsor = new Sponsor();

    await set(member).setSponsor(sponsor);

    expect(sponsor.isPersisted()).toBe(true);
    expect(sponsor.sponsorable_id).toBe(Number((member as unknown as { id: number }).id));
    expect(sponsor.sponsorable_type).toBe("Member");
  });
});

describe("has_one replace with no loaded target and no record", () => {
  fixtures(["companies", "accounts"]);

  beforeAll(() => {
    registerModel(Firm);
    registerModel(Account);
  });

  it("returns before reaching replace, leaving the association empty", async () => {
    const firm = (await Firm.create({ name: "no account" })) as Base;
    const assoc = (
      firm as unknown as { association(n: string): { removeTargetBang(m: string): Promise<void> } }
    ).association("account");
    const removeTargetBang = vi.spyOn(assoc, "removeTargetBang");
    const transaction = vi.spyOn(
      Account as unknown as { transaction: () => unknown },
      "transaction",
    );

    await set(firm).setAccount(null);

    expect(removeTargetBang).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(await (firm as unknown as { account: Promise<Base | null> }).account).toBe(null);
    expect(await Account.where({ firm_id: (firm as unknown as { id: number }).id }).count()).toBe(
      0,
    );
  });
});
