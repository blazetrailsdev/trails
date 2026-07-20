/**
 * Trails-only: the native `=` has_one setter (and the mass-assignment hasOne
 * arm) deviates from Rails on a *persisted* owner. Rails' `HasOneAssociation#replace`
 * (vendor/rails/activerecord/lib/active_record/associations/has_one_association.rb:59-84)
 * persists the displacement + new record inline at assignment — synchronous DB
 * I/O JS cannot do from a property setter. Rather than silently deferring the
 * writes to the owner's next `save()` (the order-undefined two-row race
 * RFC 0068 exists to kill), the setter THROWS and names the awaitable
 * replacement (`await owner.set#{Name}(x)`). On an *unpersisted* owner Rails
 * does no I/O either, so the in-memory replace is faithful and kept. There is
 * no Rails test for this deviation.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, AssociationTypeMismatch } from "../index.js";
import { HasOnePersistedAssignmentError } from "./errors.js";
import { Company, Firm } from "../test-helpers/models/company.js";
import { Account } from "../test-helpers/models/account.js";
import { Member } from "../test-helpers/models/member.js";
import { Membership } from "../test-helpers/models/membership.js";
import { Club } from "../test-helpers/models/club.js";
import { fixtures } from "../test-helpers/fixtures.js";

interface HasOneOwner {
  account?: unknown;
  club?: unknown;
  setAccount(value: unknown): void | Promise<void>;
  assignAttributes(attrs: Record<string, unknown>): void;
  update(attrs: Record<string, unknown>): Promise<boolean>;
}

describe("HasOnePersistedSetterThrows", () => {
  fixtures(["companies", "accounts", "members", "memberships", "clubs"]);

  beforeAll(() => {
    registerModel(Company);
    registerModel(Firm);
    registerModel(Account);
    registerModel(Member);
    registerModel(Membership);
    registerModel(Club);
  });

  it("native = setter throws on a persisted owner", async () => {
    const firm = (await Firm.create({ name: "GlobalMegaCorp" })) as unknown as HasOneOwner;
    const account = await Account.create({ credit_limit: 1000 });
    expect(() => {
      firm.account = account;
    }).toThrow(HasOnePersistedAssignmentError);
  });

  it("native = setter raises the type mismatch before the persisted-owner throw", async () => {
    // Rails' `replace` raises `AssociationTypeMismatch` as its first line
    // (has_one_association.rb:59-60), before any other work — the sync guard is
    // preserved ahead of the persisted-owner deviation.
    const firm = (await Firm.create({ name: "GlobalMegaCorp" })) as unknown as HasOneOwner;
    expect(() => {
      firm.account = 1;
    }).toThrow(AssociationTypeMismatch);
  });

  it("throw message names the association and the awaitable replacement", async () => {
    const firm = (await Firm.create({ name: "GlobalMegaCorp" })) as unknown as HasOneOwner;
    const account = await Account.create({ credit_limit: 1000 });
    try {
      firm.account = account;
      expect.unreachable("expected the persisted setter to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(HasOnePersistedAssignmentError);
      expect((e as Error).message).toContain("`account`");
      expect((e as Error).message).toContain("await owner.setAccount(x)");
      expect((e as Error).message).toContain('await owner.association("account").writer(x)');
    }
  });

  it("mass-assignment (assignAttributes) throws on a persisted owner", async () => {
    const firm = (await Firm.create({ name: "GlobalMegaCorp" })) as unknown as HasOneOwner;
    const account = await Account.create({ credit_limit: 1000 });
    // `assignAttributes` wraps a setter throw in AttributeAssignmentError
    // (longstanding trails behavior), whose message carries the inner one.
    expect(() => {
      firm.assignAttributes({ account });
    }).toThrow(/await owner\.setAccount\(x\)/);
  });

  it("update throws on a persisted owner with a hasOne key", async () => {
    const firm = (await Firm.create({ name: "GlobalMegaCorp" })) as unknown as HasOneOwner;
    const account = await Account.create({ credit_limit: 1000 });
    await expect(firm.update({ account })).rejects.toThrow(/await owner\.setAccount\(x\)/);
  });

  it("has_one_through native = setter throws on a persisted owner", async () => {
    const member = (await Member.create({ name: "Groucho" })) as unknown as HasOneOwner;
    const club = await Club.create({ name: "Moustache" });
    expect(() => {
      member.club = club;
    }).toThrow(HasOnePersistedAssignmentError);
  });

  it("has_one_through mass-assignment throws on a persisted owner", async () => {
    const member = (await Member.create({ name: "Groucho" })) as unknown as HasOneOwner;
    const club = await Club.create({ name: "Moustache" });
    expect(() => {
      member.assignAttributes({ club });
    }).toThrow(/await owner\.setClub\(x\)/);
  });

  it("native = setter does the in-memory replace on an unpersisted owner", async () => {
    const firm = new Firm({ name: "GlobalMegaCorp" });
    const account = new Account({ credit_limit: 1000 });
    const owner = firm as unknown as HasOneOwner;
    expect(() => {
      owner.account = account;
    }).not.toThrow();
    await firm.save();
    expect((account as unknown as { firm_id: number }).firm_id).toBe(Number(firm.id));
  });
});
