/**
 * Preloader::ThroughAssociation#through_scope — raw string / Arel join handling.
 *
 * Rails' `through_scope` passes the reflection scope's FULL `joins_values` to
 * `joins!(source_reflection.name => joins)`
 * (vendor/rails/activerecord/lib/active_record/associations/preloader/through_association.rb:132-134).
 * `joins_values` may hold raw SQL strings or Arel join nodes, not just
 * symbol-association joins. `JoinDependency.walk_tree` symbolizes a raw string
 * hash-value into a bogus association name and `find_reflection` raises
 * `ActiveRecord::ConfigurationError` — i.e. real Rails does NOT gracefully carry
 * a raw string / Arel join here; it raises on preload. Verified against a live
 * Rails console:
 *
 *   has_one :raw_club, -> { joins("INNER JOIN categories …").where("…") },
 *           through: :membership, source: :club
 *   Member.preload(:raw_club).to_a
 *   # => ActiveRecord::ConfigurationError: Can't join 'Club' to association
 *   #    named 'INNER JOIN categories …'; perhaps you misspelled it?
 *
 * So the fidelity behavior is to raise the same `ConfigurationError`, not to
 * silently carry the join (which would be a deviation Rails itself rejects). We
 * mirror Rails by nesting the scope's raw `_joinValues` under the source
 * reflection name; trails' join builder rejects `{source => [<raw string>]}`
 * with the identical `ConfigurationError`. Symbol-association joins (the `general`
 * scope's `left_joins(:category)`) are the only `joins` case Rails supports in
 * this branch and are carried without error — exercised by eager_test.
 *
 * No canonical has_one-through model scope uses a raw join, so this pins the
 * raw-join equivalent by declaring one on the canonical Member model.
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../../index.js";
import { ConfigurationError } from "../../errors.js";
import { fixtures } from "../../test-helpers/fixtures.js";
import { Preloader } from "../preloader.js";
import { ThroughAssociation } from "./through-association.js";
import { Member } from "../../test-helpers/models/member.js";
import { Club } from "../../test-helpers/models/club.js";
import { Membership, CurrentMembership } from "../../test-helpers/models/membership.js";
import { Category } from "../../test-helpers/models/category.js";

registerModel(Member);
registerModel(Club);
Membership.inheritanceColumn = "type";
registerModel(Membership);
registerModel(CurrentMembership);
Category.inheritanceColumn = "type";
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
// `left_joins(:category)` — the case real Rails raises on.
(Member as unknown as HasOneHost).hasOne("rawGeneralClub", {
  through: "currentMembership",
  source: "club",
  scope: (rel: JoinWhere) =>
    rel
      .joins("INNER JOIN categories ON categories.id = clubs.category_id")
      .where("categories.name = 'General'"),
});

describe("Preloader::ThroughAssociation#through_scope raw-join handling", () => {
  const { members } = fixtures(["memberTypes", "members", "clubs", "memberships", "categories"]);

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

  it("nests the reflection scope's raw join under the source reflection, as Rails does", () => {
    const groucho = members("groucho");
    const loader = throughLoader([groucho], "rawGeneralClub");
    // Rails: `joins!(source_reflection.name => values[:joins])`. Building the
    // through query then raises ConfigurationError because the raw string is
    // treated as an association name that Club has no reflection for.
    expect(() =>
      (loader as unknown as { _buildThroughScope: () => { toSql: () => string } })
        ._buildThroughScope()
        .toSql(),
    ).toThrow(ConfigurationError);
  });

  it("raises ConfigurationError on preload, matching Rails", async () => {
    const groucho = members("groucho");
    await expect(Member.where({ id: groucho.id }).preload("rawGeneralClub")).rejects.toThrow(
      ConfigurationError,
    );
  });
});
