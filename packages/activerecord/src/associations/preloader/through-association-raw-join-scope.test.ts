/**
 * Preloader::ThroughAssociation#through_scope — raw string / Arel join carry.
 *
 * Rails' `through_scope` nests the reflection scope's full `joins_values` under
 * the source reflection onto the through query
 * (vendor/rails/activerecord/lib/active_record/associations/preloader/through_association.rb:132-134).
 * `joins_values` may hold raw SQL strings or Arel join nodes, not just
 * symbol-association joins. Trails can't nest a raw join under an
 * association-name hash (the join builder resolves that hash through
 * reflections, not SQL), but a raw join names its own tables in fully-qualified
 * SQL, so it is appended to the through query's own join buckets — emitting the
 * same JOIN — and its table widens the resolvable set so a predicate qualifying
 * it rides the through query.
 *
 * No canonical has_one-through model scope uses a raw join (the `general` scope
 * on Club uses `left_joins(:category)`, exercised by eager_test), so this pins
 * the raw-join equivalent by declaring a has_one-through with a raw-join scope
 * on the canonical Member model, mirroring `general_club`.
 */
import { describe, it, expect } from "vitest";
import { registerModel, enableSti } from "../../index.js";
import { fixtures } from "../../test-helpers/fixtures.js";
import { Preloader } from "../preloader.js";
import { ThroughAssociation } from "./through-association.js";
import { Member } from "../../test-helpers/models/member.js";
import { Club } from "../../test-helpers/models/club.js";
import { Membership, CurrentMembership } from "../../test-helpers/models/membership.js";
import { Category } from "../../test-helpers/models/category.js";

registerModel(Member);
registerModel(Club);
enableSti(Membership);
registerModel(Membership);
registerModel(CurrentMembership);
enableSti(Category);
registerModel(Category);

type JoinWhere = {
  joins: (sql: string) => JoinWhere;
  where: (sql: string) => JoinWhere;
};
type HasOneHost = {
  hasOne: (name: string, options: Record<string, unknown>) => void;
};

// A has_one-through mirroring `general_club` (Member → current_membership →
// club) but whose scope reaches `categories` via a RAW string join instead of
// `left_joins(:category)`, exercising the raw-string-join carry.
(Member as unknown as HasOneHost).hasOne("rawGeneralClub", {
  through: "currentMembership",
  source: "club",
  scope: (rel: JoinWhere) =>
    rel
      .joins("INNER JOIN categories ON categories.id = clubs.category_id")
      .where("categories.name = 'General'"),
});

describe("Preloader::ThroughAssociation#through_scope raw-join carry", () => {
  const { members, clubs } = fixtures([
    "memberTypes",
    "members",
    "clubs",
    "memberships",
    "categories",
  ]);

  function throughLoader(owners: Member[], name: string): ThroughAssociation {
    const loaders = new Preloader({
      records: owners,
      associations: [name],
      associateByDefault: false,
    }).loaders;
    const loader = loaders.find((l) => l instanceof ThroughAssociation);
    if (!loader) throw new Error("expected a ThroughAssociation loader");
    return loader;
  }

  it("carries the reflection scope's raw string join onto the through query", () => {
    const groucho = members("groucho");
    const loader = throughLoader([groucho], "rawGeneralClub");
    const sql = (loader as unknown as { _buildThroughScope: () => { toSql: () => string } })
      ._buildThroughScope()
      .toSql();
    // The raw join and its predicate ride the through (memberships) query.
    expect(sql).toContain("INNER JOIN categories ON categories.id = clubs.category_id");
    expect(sql).toContain("categories.name = 'General'");
  });

  it("preloads the has_one through the raw-join-scoped condition", async () => {
    const groucho = members("groucho");
    const [row] = await Member.where({ id: groucho.id }).preload("rawGeneralClub");
    const club = row.association("rawGeneralClub").target as Club | null;
    expect(club?.id).toBe(clubs("boring_club").id);
  });
});
