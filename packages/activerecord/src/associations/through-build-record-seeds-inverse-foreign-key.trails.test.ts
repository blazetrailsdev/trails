/**
 * Trails-only: `ThroughAssociation#build_record` (through_association.rb:116-124)
 * seeds the attributes hash via
 * `Array(target.id).zip(Array(inverse.foreign_key)).map { ... }`. Ruby's
 * `Array(nil)` is `[]`, so an unpersisted through target zips to nothing and
 * the hash is left alone; a literal `[target.id]` port would write `undefined`
 * under the foreign key. Rails needs no test for the empty case — `Array()`
 * gives it for free — and the difference is invisible from the built record
 * (trails normalizes the write to `null`, and the association's
 * `scope_for_create` supplies the same key anyway), so it is asserted here on
 * the hash the method actually mutates.
 */
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
