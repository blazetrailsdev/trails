/**
 * Convergence guard: `ForeignAssociation#set_owner_attributes`
 * (foreign_association.rb:22-23) opens with `return if options[:through]`, and
 * the module is `include`d by both `HasManyAssociation` (has_many_association
 * .rb:12) and `HasOneAssociation` (has_one_association.rb:7) — one method, one
 * guard, both macros. trails keeps a private copy per association class, and
 * the has_one copy was missing the guard, so a `has_one :through` wrote the
 * owner's foreign key straight onto the far-side record that Rails leaves
 * untouched (the join model carries the key instead).
 *
 * Rails has no dedicated test for the guard — it is exercised implicitly by the
 * has_one :through suites — so this pins it directly, on the canonical
 * `Member has_one :club, through: :current_membership`.
 */
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
