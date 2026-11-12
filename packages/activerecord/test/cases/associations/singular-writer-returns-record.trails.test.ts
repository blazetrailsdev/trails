import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import { type Base } from "../../../lib/index.js";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { Company, Firm } from "../../models/company.js";
import { Account } from "../../models/account.js";
import { Member } from "../../models/member.js";
import { Club } from "../../models/club.js";
import { Membership, CurrentMembership } from "../../models/membership.js";

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

  constSet(TopLevel, "Company", Company);
  constSet(TopLevel, "Firm", Firm);
  constSet(TopLevel, "Account", Account);
  constSet(TopLevel, "Member", Member);
  constSet(TopLevel, "Club", Club);
  Membership.inheritanceColumn = "type";
  constSet(TopLevel, "Membership", Membership);
  constSet(TopLevel, "CurrentMembership", CurrentMembership);

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
