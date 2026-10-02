import { describe, it, expect } from "vitest";
import { registerModel, type Base } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Company, Firm } from "../test-helpers/models/company.js";
import { Account } from "../test-helpers/models/account.js";
import { Member } from "../test-helpers/models/member.js";
import { Club } from "../test-helpers/models/club.js";
import { Membership, CurrentMembership } from "../test-helpers/models/membership.js";

type Writer = { association(name: string): { writer(record: Base | null): unknown } };
const writer = (owner: Base, name: string) => (owner as unknown as Writer).association(name);

describe("SingularAssociation#writer", () => {
  const { companies, accounts, members, clubs } = fixtures([
    "companies",
    "accounts",
    "members",
    "clubs",
    "memberships",
  ]);

  registerModel(Company);
  registerModel(Firm);
  registerModel(Account);
  registerModel(Member);
  registerModel(Club);
  Membership.inheritanceColumn = "type";
  registerModel(Membership);
  registerModel(CurrentMembership);

  it("returns the record a belongs_to was assigned", () => {
    const account = accounts("signals37");
    const firm = companies("first_firm");

    expect(writer(account, "firm").writer(firm)).toBe(firm);
    expect(writer(account, "firm").writer(null)).toBeNull();
  });

  it("returns the record a has_one :through was assigned", async () => {
    const member = members("some_other_guy");
    const club = clubs("moustache_club");

    expect(await writer(member, "club").writer(club)).toBe(club);
    expect(await writer(member, "club").writer(null)).toBeNull();
  });
});
