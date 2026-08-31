import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, AssociationTypeMismatch } from "../index.js";
import { HasOnePersistedAssignmentError } from "./errors.js";
import { Company, Firm } from "../test-helpers/models/company.js";
import { Account } from "../test-helpers/models/account.js";
import { Member } from "../test-helpers/models/member.js";
import { Membership } from "../test-helpers/models/membership.js";
import { Club } from "../test-helpers/models/club.js";
import { fixtures } from "../test-fixtures.js";
import { assertQueriesCount } from "../testing/query-assertions.js";

interface HasOneOwner {
  account?: unknown;
  club?: unknown;
  setAccount(value: unknown): void | Promise<void>;
  setAttributes(attrs: Record<string, unknown>): Promise<void> | void;
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
    const firm = (await Firm.create({ name: "GlobalMegaCorp" })) as unknown as HasOneOwner;
    const account = await Account.create({ credit_limit: 1000 });
    await firm.setAccount(account);
    expect((account as unknown as { firm_id: number }).firm_id).toBe(
      Number((firm as unknown as { id: unknown }).id),
    );
  });

  it("assigning the property is a plain JS write to a getter-only accessor", async () => {
    const firm = (await Firm.create({ name: "GlobalMegaCorp" })) as unknown as HasOneOwner;
    const account = await Account.create({ credit_limit: 1000 });
    expect(() => {
      firm.account = account;
    }).toThrow(TypeError);
  });

  it("mass-assignment raises the type mismatch before the persisted-owner throw", async () => {
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

  it("mass-assignment (setAttributes) awaits the has_one writer", async () => {
    const firm = (await Firm.create({ name: "GlobalMegaCorp" })) as unknown as HasOneOwner;
    const account = await Account.create({ credit_limit: 1000 });
    await firm.setAttributes({ account });
    expect((account as unknown as { firm_id: number }).firm_id).toBe(
      Number((firm as unknown as { id: unknown }).id),
    );
  });

  it("update awaits the has_one writer on a persisted owner", async () => {
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

  it("has_one_through mass-assignment awaits the through writer", async () => {
    const member = (await Member.create({ name: "Groucho" })) as unknown as HasOneOwner;
    const club = await Club.create({ name: "Moustache" });
    await member.setAttributes({ club });
    expect(await (member as unknown as { club: Promise<unknown> }).club).toBeTruthy();
  });

  it("construction issues no query for the association assignment", async () => {
    const account = new Account({ credit_limit: 1000 });
    await assertQueriesCount(0, false, async () => {
      new Firm({ name: "GlobalMegaCorp", account });
    });
  });

  it("construction does the in-memory replace on an unpersisted owner", async () => {
    const account = new Account({ credit_limit: 1000 });
    const firm = new Firm({ name: "GlobalMegaCorp", account });
    await firm.save();
    expect((account as unknown as { firm_id: number }).firm_id).toBe(Number(firm.id));
  });
});
