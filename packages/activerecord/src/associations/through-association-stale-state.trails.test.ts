import { describe, it, expect } from "vitest";

import { MemberDetail } from "../test-helpers/models/member-detail.js";
import { fixtures } from "../test-fixtures.js";

interface ThroughAssociationLike {
  staleState(): unknown;
  isStaleTarget(): boolean;
  loadTarget(): Promise<unknown>;
}

describe("ThroughAssociation#stale_state", () => {
  const { memberDetails } = fixtures(["members", "memberDetails", "memberTypes"]);

  const association = (detail: MemberDetail): ThroughAssociationLike =>
    (detail as unknown as { association(name: string): ThroughAssociationLike }).association(
      "memberType",
    );

  it("is the array of the through belongs_to's foreign key values", async () => {
    const detail = await MemberDetail.find(memberDetails("groucho").id);

    expect(association(detail).staleState()).toEqual([detail.member_id]);
  });

  it("is nil when the through foreign key is unset", () => {
    expect(association(new MemberDetail()).staleState()).toBeNull();
  });

  it("does not read a loaded target as stale while the foreign key is unchanged", async () => {
    const detail = await MemberDetail.find(memberDetails("groucho").id);
    const through = association(detail);
    await through.loadTarget();

    expect(through.isStaleTarget()).toBe(false);

    detail.member_id = detail.member_id + 1;
    expect(through.isStaleTarget()).toBe(true);
  });
});
