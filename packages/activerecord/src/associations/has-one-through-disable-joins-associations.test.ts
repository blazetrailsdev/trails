/**
 * Mirrors Rails activerecord/test/cases/associations/has_one_through_disable_joins_associations_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { registerModel, enableSti, registerSubclass } from "../index.js";
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
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";

registerModel(Member);
registerModel(Organization);
registerModel(MemberDetail);
registerModel(Club);
enableSti(Membership);
registerModel(Membership);
registerModel(CurrentMembership);
registerModel(SuperMembership);
registerModel(SelectedMembership);
registerModel(TenantMembership);
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
enableSti(Company);
registerSubclass(Firm);
registerSubclass(DependentFirm);
registerSubclass(ExclusivelyDependentFirm);
registerSubclass(RestrictedWithExceptionFirm);
registerSubclass(RestrictedWithErrorFirm);
registerSubclass(Client);

/**
 * Capture the non-SCHEMA `sql.active_record` statements emitted while running
 * `block`. Mirrors Rails' `capture_sql`/`SQLCounter`, which never records
 * adapter-internal SCHEMA introspection.
 */
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
  const { members, organizations } = useHandlerFixtures([
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
    (member.association("organization") as any).writer(organization);
    await member.save();
    await member.reload();
  });

  it("counting on disable joins through", async () => {
    let withoutJoins: unknown;
    let withJoins: unknown;
    const noJoins = await captureSql(async () => {
      withoutJoins = await member.loadHasOne("organizationWithoutJoins");
    });
    const joins = await captureSql(async () => {
      withJoins = await member.loadHasOne("organization");
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
    const blarpy = members("blarpy_winkup");
    let org: unknown;
    let orgNoJoins: unknown;
    const joins = await captureSql(async () => {
      org = await blarpy.loadHasOne("organization");
    });
    const noJoins = await captureSql(async () => {
      orgNoJoins = await blarpy.loadHasOne("organizationWithoutJoins");
    });
    expect(org).toBeNull();
    expect(orgNoJoins).toBeNull();
    expect(joins.length).toBe(1);
    expect(noJoins.length).toBe(1);
  });

  it("preload on disable joins through", async () => {
    const loaded = await Member.preload("organization", "organizationWithoutJoins").toArray();
    const first = loaded[0];
    // preload must have populated both holders — assert they read as loaded so the
    // zero-query checks below actually exercise the preload path (a sync `.target`
    // read never queries regardless of whether preload ran).
    expect(first.association("organization").isLoaded()).toBe(true);
    expect(first.association("organizationWithoutJoins").isLoaded()).toBe(true);
    const queriedOrg = await captureSql(async () => {
      void first.association("organization").target;
    });
    const queriedNoJoins = await captureSql(async () => {
      void first.association("organizationWithoutJoins").target;
    });
    expect(queriedOrg).toEqual([]);
    expect(queriedNoJoins).toEqual([]);
  });

  it("has one through with belongs to on disable joins", async () => {
    const firm = await Firm.create({ name: "Adequate Holdings" });
    const project = await Project.create({ name: "Project 1", firm });
    await Developer.create({ name: "Gorbypuff", firm });

    let leadDeveloper: unknown;
    let leadDeveloperDisableJoins: unknown;
    const joins = await captureSql(async () => {
      leadDeveloper = await project.loadHasOne("leadDeveloper");
    });
    const noJoins = await captureSql(async () => {
      leadDeveloperDisableJoins = await project.loadHasOne("leadDeveloperDisableJoins");
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
    let withJoins: unknown;
    let withoutJoins: unknown;
    const joins = await captureSql(async () => {
      withJoins = await member.loadHasOne("club");
    });
    const noJoins = await captureSql(async () => {
      withoutJoins = await member.loadHasOne("clubWithoutJoins");
    });

    expect((withoutJoins as { id?: number })?.id).toBe((withJoins as { id?: number })?.id);
    expect(joins.length).toBe(1);
    expect(noJoins.length).toBe(2);
    expect(joins[0]).toMatch(/INNER JOIN/i);
    for (const nj of noJoins) {
      expect(nj).not.toMatch(/INNER JOIN/i);
    }
    expect(noJoins[0]).toMatch(/memberships.+type/i);
  });
});
