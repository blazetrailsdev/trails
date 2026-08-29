import { describe, it, expect } from "vitest";

import { Club } from "../test-helpers/models/club.js";
import { Member } from "../test-helpers/models/member.js";
import { fixtures } from "../test-fixtures.js";

interface ForeignAssociationLike {
  setOwnerAttributes(record: unknown): void;
}

describe("ForeignAssociation#set_owner_attributes", () => {
  const { members, clubs } = fixtures(["members", "memberships", "clubs"]);

  it("is a no-op for a has_one :through association", async () => {
    const member = await Member.find(members("groucho").id);
    const club = await Club.find(clubs("boring_club").id);
    const before = { ...(club as unknown as { attributes: Record<string, unknown> }).attributes };

    const association = (
      member as unknown as { association(name: string): ForeignAssociationLike }
    ).association("club");
    association.setOwnerAttributes(club);

    expect((club as unknown as { attributes: Record<string, unknown> }).attributes).toEqual(before);
  });
});
