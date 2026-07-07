/**
 * Preloader::ThroughAssociation#through_scope — has_many-through raw string /
 * Arel join handling.
 *
 * Rails' `through_scope` passes the reflection scope's FULL `joins_values` to
 * `joins!(source_reflection.name => joins)`
 * (vendor/rails/activerecord/lib/active_record/associations/preloader/through_association.rb:132-134)
 * whenever the reflection where_clause is non-empty — this branch is NOT gated on
 * collection, so a **has_many**-through raises the same error a has_one-through does
 * (companion to through-association-raw-join-scope.test.ts, PR #4526).
 * `joins_values` may hold raw SQL strings / Arel join nodes; `JoinDependency.walk_tree`
 * symbolizes a raw string hash-value into a bogus association name and
 * `find_reflection` raises `ActiveRecord::ConfigurationError`
 * (join_dependency.rb:224-226). Verified against a live Rails console:
 *
 *   has_many :raw_clubs, -> { joins("INNER JOIN categories …").where("…") },
 *            through: :membership, source: :club
 *   Member.preload(:raw_clubs).to_a
 *   # => ActiveRecord::ConfigurationError: Can't join 'Club' to association
 *   #    named 'INNER JOIN categories …'; perhaps you misspelled it?
 *
 * So the fidelity behavior is to raise, not to silently defer the raw join to the
 * source-preloader stage (where it is valid SQL against the source base table) — a
 * lenient deviation Rails itself rejects. We mirror Rails by nesting the scope's raw
 * `_joinValues` under the source reflection name; trails' join builder rejects
 * `{source => [<raw string>]}` with the identical `ConfigurationError`.
 *
 * No canonical has_many-through model scope uses a raw join, so this pins the
 * raw-join equivalent by declaring one on the canonical Member model.
 */
import { describe, it, expect } from "vitest";
import { registerModel, enableSti } from "../../index.js";
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
enableSti(Membership);
registerModel(Membership);
registerModel(CurrentMembership);
enableSti(Category);
registerModel(Category);

type JoinWhere = {
  joins: (sql: string) => JoinWhere;
  where: (sql: string) => JoinWhere;
};
type HasManyHost = {
  hasMany: (name: string, options: Record<string, unknown>) => void;
};

// A has_many-through mirroring `clubs` (Member → favoriteMemberships → club) but
// whose scope reaches `categories` via a RAW string join instead of a symbol
// association — the case real Rails raises on for has_many-through too.
(Member as unknown as HasManyHost).hasMany("rawClubs", {
  through: "favoriteMemberships",
  source: "club",
  scope: (rel: JoinWhere) =>
    rel
      .joins("INNER JOIN categories ON categories.id = clubs.category_id")
      .where("categories.name = 'General'"),
});

describe("Preloader::ThroughAssociation#through_scope has_many raw-join handling", () => {
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
    const loader = throughLoader([groucho], "rawClubs");
    expect(() =>
      (loader as unknown as { _buildThroughScope: () => { toSql: () => string } })
        ._buildThroughScope()
        .toSql(),
    ).toThrow(ConfigurationError);
  });

  it("raises ConfigurationError on preload, matching Rails", async () => {
    const groucho = members("groucho");
    await expect(Member.where({ id: groucho.id }).preload("rawClubs")).rejects.toThrow(
      ConfigurationError,
    );
  });
});
