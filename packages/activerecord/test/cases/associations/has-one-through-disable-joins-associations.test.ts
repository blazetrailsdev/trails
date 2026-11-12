import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeEach } from "vitest";
import { SingularAssociation } from "../../../lib/associations/singular-association.js";
import { Member } from "../../models/member.js";
import { Organization } from "../../models/organization.js";
import { MemberDetail } from "../../models/member-detail.js";
import { Club } from "../../models/club.js";
import {
  Company,
  Firm,
  DependentFirm,
  ExclusivelyDependentFirm,
  RestrictedWithExceptionFirm,
  RestrictedWithErrorFirm,
  Client,
} from "../../models/company.js";
import { Account } from "../../models/account.js";
import { Project } from "../../models/project.js";
import { Developer, AuditLog } from "../../models/developer.js";
import {
  Membership,
  CurrentMembership,
  SuperMembership,
  SelectedMembership,
  TenantMembership,
} from "../../models/membership.js";
import "../../models/contract.js";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { assertNoQueries, assertQueriesCount } from "../../../lib/testing/query-assertions.js";

constSet(TopLevel, "Member", Member);
constSet(TopLevel, "Organization", Organization);
constSet(TopLevel, "MemberDetail", MemberDetail);
constSet(TopLevel, "Club", Club);
Membership.inheritanceColumn = "type";
constSet(TopLevel, "Membership", Membership);
constSet(TopLevel, "CurrentMembership", CurrentMembership);
constSet(TopLevel, "SuperMembership", SuperMembership);
constSet(TopLevel, "SelectedMembership", SelectedMembership);
constSet(TopLevel, "TenantMembership", TenantMembership);
constSet(TopLevel, "Company", Company);
constSet(TopLevel, "Firm", Firm);
constSet(TopLevel, "DependentFirm", DependentFirm);
constSet(TopLevel, "ExclusivelyDependentFirm", ExclusivelyDependentFirm);
constSet(TopLevel, "RestrictedWithExceptionFirm", RestrictedWithExceptionFirm);
constSet(TopLevel, "RestrictedWithErrorFirm", RestrictedWithErrorFirm);
constSet(TopLevel, "Client", Client);
constSet(TopLevel, "Account", Account);
constSet(TopLevel, "Project", Project);
constSet(TopLevel, "Developer", Developer);
constSet(TopLevel, "AuditLog", AuditLog);
Company.inheritanceColumn = "type";
constSet(TopLevel, "Firm", Firm);
constSet(TopLevel, "DependentFirm", DependentFirm);
constSet(TopLevel, "ExclusivelyDependentFirm", ExclusivelyDependentFirm);
constSet(TopLevel, "RestrictedWithExceptionFirm", RestrictedWithExceptionFirm);
constSet(TopLevel, "RestrictedWithErrorFirm", RestrictedWithErrorFirm);
constSet(TopLevel, "Client", Client);

describe("HasOneThroughDisableJoinsAssociationsTest", () => {
  const { self, members, organizations } = fixtures([
    "members",
    "organizations",
    "memberDetails",
    "memberTypes",
    "clubs",
    "memberships",
    "categories",
    "companies",
    "developers",
    "projects",
    "accounts",
  ]);

  let member: Member;

  beforeEach(async () => {
    member = members("groucho");
    const organization = organizations("discordians");
    await (member.association("organization") as SingularAssociation).writer(organization);
    await member.save();
    await member.reload();
  });

  it("counting on disable joins through", async () => {
    let withoutJoins: unknown;
    let withJoins: unknown;
    const noJoins = await self().captureSql({}, async () => {
      withoutJoins = await member.organizationWithoutJoins;
    });
    const joins = await self().captureSql({}, async () => {
      withJoins = await member.organization;
    });

    expect((withoutJoins as Organization)?.id).toBe((withJoins as Organization)?.id);
    expect(noJoins.length).toBe(2);
    expect(joins.length).toBe(1);
    expect(joins[0]).toMatch(/INNER JOIN/i);
    for (const nj of noJoins) {
      expect(nj).not.toMatch(/INNER JOIN/i);
    }
  });

  it("nil on disable joins through", async () => {
    const member = members("blarpy_winkup");
    let organization: unknown;
    await assertQueriesCount(1, false, async () => {
      organization = await member.organization;
    });
    expect(organization).toBeNull();
    let organizationWithoutJoins: unknown;
    await assertQueriesCount(1, false, async () => {
      organizationWithoutJoins = await member.organizationWithoutJoins;
    });
    expect(organizationWithoutJoins).toBeNull();
  });

  it("preload on disable joins through", async () => {
    const members = await Member.preload(":organization", ":organizationWithoutJoins");
    await assertNoQueries(false, async () => {
      await members[0].organization;
    });
    await assertNoQueries(false, async () => {
      await members[0].organizationWithoutJoins;
    });
  });

  it("has one through with belongs to on disable joins", async () => {
    const firm = await Firm.create({ name: "Adequate Holdings" });
    const project = await Project.create({ name: "Project 1", firm });
    await Developer.create({ name: "Gorbypuff", firm });

    let leadDeveloper: unknown;
    let leadDeveloperDisableJoins: unknown;
    const joins = await self().captureSql({}, async () => {
      leadDeveloper = await project.leadDeveloper;
    });
    const noJoins = await self().captureSql({}, async () => {
      leadDeveloperDisableJoins = await project.leadDeveloperDisableJoins;
    });

    expect((leadDeveloperDisableJoins as Developer)?.id).toBe((leadDeveloper as Developer)?.id);
    expect(noJoins.length).toBe(2);
    expect(joins.length).toBe(1);
    expect(joins[0]).toMatch(/INNER JOIN/i);
    for (const nj of noJoins) {
      expect(nj).not.toMatch(/INNER JOIN/i);
    }
  });

  it("disable joins through with enum type", async () => {
    const joins = await self().captureSql({}, async () => {
      await member.club;
    });
    const noJoins = await self().captureSql({}, async () => {
      await member.clubWithoutJoins;
    });

    expect(joins.length).toBe(1);
    expect(noJoins.length).toBe(2);
    expect(joins[0]).toMatch(/INNER JOIN/i);
    for (const nj of noJoins) {
      expect(nj).not.toMatch(/INNER JOIN/i);
    }
    expect(noJoins[0]).toMatch(/memberships.+type/i);
  });
});
