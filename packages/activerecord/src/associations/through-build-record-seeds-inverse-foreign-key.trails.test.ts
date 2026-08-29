import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { MemberDetail } from "../test-helpers/models/member-detail.js";
import { Member } from "../test-helpers/models/member.js";
import { Organization } from "../test-helpers/models/organization.js";
import { fixtures } from "../test-fixtures.js";
import { throughBuildRecord } from "./through-association.js";

describe("ThroughAssociation#build_record seeds the source inverse foreign key", () => {
  const { memberDetails, organizations } = fixtures(["members", "memberDetails", "organizations"]);

  beforeAll(() => {
    registerModel(Member);
    registerModel(MemberDetail);
    registerModel(Organization);
  });

  it("assigns the through target's id under the source inverse foreign key", async () => {
    const memberDetail = await MemberDetail.find(memberDetails("groucho").id);
    await memberDetail.loadBelongsTo("organization");

    const attributes: Record<string, unknown> = {};
    throughBuildRecord(memberDetail.association("organizationMemberDetails") as never, attributes);

    expect(attributes).toEqual({ organization_id: organizations("nsa").id });
  });

  it("assigns nothing when the through target has no id yet", async () => {
    const memberDetail = MemberDetail.new({});
    memberDetail.organization = Organization.new({ name: "Discordians" });

    const attributes: Record<string, unknown> = {};
    throughBuildRecord(memberDetail.association("organizationMemberDetails") as never, attributes);

    expect(attributes).toEqual({});
  });
});
