/**
 * Trails-only: the mass-assignment hasOne arm deviates from Rails on a
 * *persisted* owner. (RFC 0087 §1 removed the native `=` property setter that
 * shared the deviation; `set#{Name}` is the writer now.)
 * Rails' `HasOneAssociation#replace`
 * (vendor/rails/activerecord/lib/active_record/associations/has_one_association.rb:59-84)
 * persists the displacement + new record inline at assignment — synchronous DB
 * I/O JS cannot do from a property setter. Rather than silently deferring the
 * writes to the owner's next `save()` (the order-undefined two-row race
 * RFC 0068 exists to kill), the assignment THROWS and names the awaitable
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
import { fixtures } from "../test-fixtures.js";

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

  it("set#{Name} persists the replacement on a persisted owner", async () => {
    // The awaitable writer the deviation names: it reaches
    // `HasOneAssociation#writer` → Rails' inline replace/persist.
    const firm = (await Firm.create({ name: "GlobalMegaCorp" })) as unknown as HasOneOwner;
    const account = await Account.create({ credit_limit: 1000 });
    await firm.setAccount(account);
    expect((account as unknown as { firm_id: number }).firm_id).toBe(
      Number((firm as unknown as { id: unknown }).id),
    );
  });

  it("assigning the property is a plain JS write to a getter-only accessor", async () => {
    // RFC 0087 §1: no `#{name}=` setter is generated, so the write fails as an
    // ordinary strict-mode assignment rather than routing anywhere.
    const firm = (await Firm.create({ name: "GlobalMegaCorp" })) as unknown as HasOneOwner;
    const account = await Account.create({ credit_limit: 1000 });
    expect(() => {
      firm.account = account;
    }).toThrow(TypeError);
  });

  it("mass-assignment raises the type mismatch before the persisted-owner throw", async () => {
    // Rails' `replace` raises `AssociationTypeMismatch` as its first line
    // (has_one_association.rb:59-60), before any other work — the sync guard is
    // preserved ahead of the persisted-owner deviation.
    const firm = (await Firm.create({ name: "GlobalMegaCorp" })) as unknown as HasOneOwner;
    expect(() =>
      (firm as unknown as { association(n: string): { syncWrite(v: unknown): void } })
        .association("account")
        .syncWrite(1),
    ).toThrow(AssociationTypeMismatch);
  });

  it("throw message names the association and the awaitable replacement", async () => {
    const firm = (await Firm.create({ name: "GlobalMegaCorp" })) as unknown as HasOneOwner;
    const account = await Account.create({ credit_limit: 1000 });
    try {
      (firm as unknown as { association(n: string): { syncWrite(v: unknown): void } })
        .association("account")
        .syncWrite(account);
      expect.unreachable("expected the persisted assignment to throw");
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

  it("update awaits the has_one writer on a persisted owner", async () => {
    // `#update` is async, so — unlike mass assignment — it reaches Rails'
    // inline replace/persist (has_one_association.rb:59-84) instead of the
    // deviation's throw.
    const firm = (await Firm.create({ name: "GlobalMegaCorp" })) as unknown as HasOneOwner;
    const account = await Account.create({ credit_limit: 1000 });
    await firm.update({ account });
    expect((account as unknown as { firm_id: number }).firm_id).toBe(
      Number((firm as unknown as { id: unknown }).id),
    );
  });

  it("has_one_through mass-assignment throws HasOnePersistedAssignmentError on a persisted owner", async () => {
    const member = (await Member.create({ name: "Groucho" })) as unknown as HasOneOwner;
    const club = await Club.create({ name: "Moustache" });
    expect(() =>
      (member as unknown as { association(n: string): { syncWrite(v: unknown): void } })
        .association("club")
        .syncWrite(club),
    ).toThrow(HasOnePersistedAssignmentError);
  });

  it("has_one_through mass-assignment throws on a persisted owner", async () => {
    const member = (await Member.create({ name: "Groucho" })) as unknown as HasOneOwner;
    const club = await Club.create({ name: "Moustache" });
    expect(() => {
      member.assignAttributes({ club });
    }).toThrow(/await owner\.setClub\(x\)/);
  });

  it("mass-assignment does the in-memory replace on an unpersisted owner", async () => {
    const firm = new Firm({ name: "GlobalMegaCorp" });
    const account = new Account({ credit_limit: 1000 });
    const owner = firm as unknown as HasOneOwner;
    expect(() => {
      owner.assignAttributes({ account });
    }).not.toThrow();
    await firm.save();
    expect((account as unknown as { firm_id: number }).firm_id).toBe(Number(firm.id));
  });
});
