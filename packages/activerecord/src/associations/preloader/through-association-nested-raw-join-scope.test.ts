/**
 * Preloader::ThroughAssociation#through_scope — raw join handling for a NESTED
 * through (through/source reflection is itself a through).
 *
 * `through_scope` reads `values = reflection_scope.values`, where
 * `reflection_scope` is the FLATTENED chain scope
 * (`reflection.join_scopes(...).inject(klass.unscoped, &:merge!)`,
 * vendor/rails/activerecord/lib/active_record/associations/preloader/association.rb:290)
 * — source sub-chain + own, merged. Whenever the flattened `where_clause` is
 * non-empty it nests the whole flattened `values[:joins]` under
 * `source_reflection.name` via `joins!(source_reflection.name => joins)`
 * (through_association.rb:117,132-134). A raw SQL string / Arel join symbolizes
 * into a bogus association name and `JoinDependency` raises
 * `ActiveRecord::ConfigurationError` (join_dependency.rb:224-226).
 *
 * There is NO "outer-own vs. sub-chain" attribution: a raw join declared on ANY
 * link of the chain raises at the outer through-scope build, so long as the
 * flattened `where_clause` is non-empty. Verified against a live vendored-Rails
 * nested-through repro (raw join on the sub-chain only + a `.where` → raises;
 * same chain with no `.where` anywhere → the `elsif` is skipped and nothing
 * raises). No canonical nested-through model scope carries a raw join, so this
 * pins the behavior by declaring the chain on the canonical Member/Club models.
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../../index.js";
import { ConfigurationError } from "../../errors.js";
import { fixtures } from "../../test-fixtures.js";
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
type HasManyHost = {
  hasMany: (name: string, options: Record<string, unknown>) => void;
};
type HasOneHost = {
  hasOne: (name: string, options: Record<string, unknown>) => void;
};

// Nested through (source `members` on Club is itself a has_many-through, so this
// takes the "twoStep"/nested branch) whose OUTER scope reaches `categories` via
// a RAW string join + a `.where`. The flattened where_clause is non-empty, so
// Rails raises ConfigurationError at the through-scope build.
(Member as unknown as HasManyHost).hasMany("rawMembersOfClub", {
  through: "club",
  source: "members",
  scope: (rel: JoinWhere) =>
    rel
      .joins("INNER JOIN categories ON categories.id = memberships.club_id")
      .where("categories.name = 'General'"),
});

// Same nested branch, but the raw join is declared on the SUB-CHAIN only: Club's
// own has_many-through `rawMembers` carries `.joins(...).where(...)`, and the
// outer `membersViaRawClub` sources through it with a raw-join-free `.where`.
// Rails still raises at the OUTER build because the flattened `values[:joins]`
// includes the sub-chain's raw join and the flattened where_clause is non-empty.
(Club as unknown as HasManyHost).hasMany("rawMembers", {
  through: "memberships",
  source: "member",
  scope: (rel: JoinWhere) =>
    rel
      .joins("INNER JOIN categories ON categories.id = members.id")
      .where("categories.name = 'General'"),
});
(Member as unknown as HasManyHost).hasMany("membersViaRawClub", {
  through: "club",
  source: "rawMembers",
  scope: (rel: JoinWhere) => rel.where("clubs.name IS NOT NULL"),
});

// Nested through whose OWN scope carries a raw join but NO `.where` anywhere in
// the chain. The flattened where_clause is empty, so Rails skips the whole
// `elsif` branch (through_association.rb:117) and NOTHING raises — the raw join
// is never nested. Pins that the raise is gated on the where_clause, not on the
// mere presence of a raw join.
(Member as unknown as HasManyHost).hasMany("noWhereRawMembersOfClub", {
  through: "club",
  source: "members",
  scope: (rel: JoinWhere) =>
    rel.joins("INNER JOIN categories ON categories.id = memberships.club_id"),
});

// Nested through (through reflection `club` is itself a has_one-through, so
// `_reflectionScope` is the flattened chain scope) whose has_ONE target's own
// scope reaches `categorizations` via a RAW join + `.where`. Exercises the
// "join" branch's flattened raw-join handling for a has_one nested through.
(Member as unknown as HasOneHost).hasOne("rawCategoryOfClub", {
  through: "club",
  source: "category",
  scope: (rel: JoinWhere) =>
    rel
      .joins("INNER JOIN categorizations ON categorizations.category_id = categories.id")
      .where("categorizations.author_id = 1"),
});

describe("Preloader::ThroughAssociation#through_scope nested raw-join handling", () => {
  const { members } = fixtures(["memberTypes", "members", "clubs", "memberships", "categories"]);

  function throughLoader(owners: Member[], name: string): ThroughAssociation {
    const loader = new Preloader({
      records: owners,
      associations: [name],
      associateByDefault: false,
    }).loaders.find((l) => l instanceof ThroughAssociation);
    if (!loader) throw new Error("expected a ThroughAssociation loader");
    return loader;
  }

  function buildSql(loader: ThroughAssociation): string {
    return (loader as unknown as { _buildThroughScope: () => { toSql: () => string } })
      ._buildThroughScope()
      .toSql();
  }

  it("raises when the outer reflection's own scope carries a raw join", () => {
    const groucho = members("groucho");
    expect(() => buildSql(throughLoader([groucho], "rawMembersOfClub"))).toThrow(
      ConfigurationError,
    );
  });

  it("raises when only the source sub-chain carries a raw join, matching Rails", () => {
    const groucho = members("groucho");
    // The sub-chain's raw join is flattened into `reflection_scope`; the
    // flattened where_clause is non-empty, so Rails nests it under the source
    // reflection at the outer build and raises — it is NOT deferred.
    expect(() => buildSql(throughLoader([groucho], "membersViaRawClub"))).toThrow(
      ConfigurationError,
    );
  });

  it("raises for a has_one nested through whose scope carries a raw join", () => {
    const groucho = members("groucho");
    expect(() => buildSql(throughLoader([groucho], "rawCategoryOfClub"))).toThrow(
      ConfigurationError,
    );
  });

  it("does NOT raise when the chain carries a raw join but an empty where_clause", () => {
    const groucho = members("groucho");
    // Empty flattened where_clause → Rails skips the `elsif` branch entirely, so
    // the raw join is never nested and nothing raises.
    expect(() => buildSql(throughLoader([groucho], "noWhereRawMembersOfClub"))).not.toThrow();
  });

  it("raises ConfigurationError on preload, matching Rails", async () => {
    const groucho = members("groucho");
    await expect(Member.where({ id: groucho.id }).preload("membersViaRawClub")).rejects.toThrow(
      ConfigurationError,
    );
  });
});
