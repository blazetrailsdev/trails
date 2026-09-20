import { describe, it, expect, beforeEach } from "vitest";
import { SingularAssociation } from "./singular-association.js";
import { Notifications } from "@blazetrails/activesupport";
import { registerModel, registerSubclass } from "../index.js";
import { Member } from "../test-helpers/models/member.js";
import { Organization } from "../test-helpers/models/organization.js";
import { MemberDetail } from "../test-helpers/models/member-detail.js";
import { Club } from "../test-helpers/models/club.js";
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
import { Project } from "../test-helpers/models/project.js";
import { Developer, AuditLog } from "../test-helpers/models/developer.js";
import {
  Membership,
  CurrentMembership,
  SuperMembership,
  SelectedMembership,
  TenantMembership,
} from "../test-helpers/models/membership.js";
import { Contract } from "../test-helpers/models/contract.js";
import { fixtures } from "../test-fixtures.js";
import { assertNoQueries, assertQueriesCount } from "../testing/query-assertions.js";

registerModel(Member);
registerModel(Organization);
registerModel(MemberDetail);
registerModel(Club);
Membership.inheritanceColumn = "type";
registerModel(Membership);
registerModel(CurrentMembership);
registerModel(SuperMembership);
registerModel(SelectedMembership);
registerModel(TenantMembership);
registerModel(Contract);
registerModel(Company);
registerModel(Firm);
registerModel(DependentFirm);
registerModel(ExclusivelyDependentFirm);
registerModel(RestrictedWithExceptionFirm);
registerModel(RestrictedWithErrorFirm);
registerModel(Client);
registerModel(Account);
registerModel(Project);
registerModel(Developer);
registerModel(AuditLog);
Company.inheritanceColumn = "type";
registerSubclass(Firm);
registerSubclass(DependentFirm);
registerSubclass(ExclusivelyDependentFirm);
registerSubclass(RestrictedWithExceptionFirm);
registerSubclass(RestrictedWithErrorFirm);
registerSubclass(Client);

async function captureSql(block: () => Promise<unknown>): Promise<string[]> {
  const observed: string[] = [];
  const sub = Notifications.subscribe("sql.active_record", (event: any) => {
    if (event?.payload?.name === "SCHEMA") return;
    if (event?.payload?.cached) return;
    const sql = event?.payload?.sql;
    if (typeof sql === "string") observed.push(sql);
  });
  try {
    await block();
  } finally {
    Notifications.unsubscribe(sub);
  }
  return observed;
}

describe("HasOneThroughDisableJoinsAssociationsTest", () => {
  const { members, organizations } = fixtures([
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
    const noJoins = await captureSql(async () => {
      withoutJoins = await member.organizationWithoutJoins;
    });
    const joins = await captureSql(async () => {
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
    const joins = await captureSql(async () => {
      leadDeveloper = await project.leadDeveloper;
    });
    const noJoins = await captureSql(async () => {
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
    const joins = await captureSql(async () => {
      await member.club;
    });
    const noJoins = await captureSql(async () => {
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
