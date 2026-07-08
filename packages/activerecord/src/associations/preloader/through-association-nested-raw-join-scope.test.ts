/**
 * Preloader::ThroughAssociation#through_scope — raw join attribution for a
 * NESTED through (source reflection is itself a through).
 *
 * Rails' `through_scope` passes the reflection scope's `joins_values` to
 * `joins!(source_reflection.name => joins)`; a raw SQL string / Arel join node
 * symbolizes into a bogus association name and `JoinDependency` raises
 * `ActiveRecord::ConfigurationError`
 * (vendor/rails/activerecord/lib/active_record/associations/preloader/through_association.rb:132-134,
 * join_dependency.rb:224-226).
 *
 * For a nested through, `ThroughReflection#join_scopes` FLATTENS the whole chain
 * (`source_reflection.join_scopes + super`), so `_reflectionScope` carries the
 * source SUB-CHAIN's scope too — not just the outer reflection's own. Attributing
 * that flattened `_joinValues` to the outer through-scope build would raise
 * `ConfigurationError` for a raw join that belongs to a DEEPER reflection (which
 * Rails re-derives at its own recursive source-preloader stage, where it raises
 * there instead — or is valid SQL). So the outer build must read only the outer
 * reflection's OWN scope (`_ownReflectionScope`, the `super.join_scopes` term):
 *
 *   - a raw join in the OUTER reflection's own scope still raises here, and
 *   - a raw join carried only by the SUB-CHAIN does NOT raise at the outer build.
 *
 * No canonical nested-through model scope carries a raw join, so this pins the
 * behavior by declaring the chain on the canonical Member/Club models.
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

// Nested through (source `members` on Club is itself a has_many-through) whose
// OUTER scope reaches `categories` via a RAW string join. The raw join belongs
// to the outer reflection's own scope, so — like a non-nested through — Rails
// raises ConfigurationError at the through-scope build.
(Member as unknown as HasManyHost).hasMany("rawMembersOfClub", {
  through: "club",
  source: "members",
  scope: (rel: JoinWhere) =>
    rel
      .joins("INNER JOIN categories ON categories.id = memberships.club_id")
      .where("categories.name = 'General'"),
});

// The SUB-CHAIN building block: Club's own has_many-through whose scope carries
// a RAW join. Referenced as the `source` of the outer nested through below so
// its raw join lands in the flattened `_reflectionScope` — but NOT in the outer
// reflection's own scope.
(Club as unknown as HasManyHost).hasMany("rawMembers", {
  through: "memberships",
  source: "member",
  scope: (rel: JoinWhere) =>
    rel
      .joins("INNER JOIN categories ON categories.id = members.id")
      .where("categories.name = 'General'"),
});

// Nested through whose SOURCE (`rawMembers`, a through) carries the raw join, but
// whose OWN scope is a plain (raw-join-free) predicate. The raw join is the
// sub-chain's, re-derived at its own recursive stage — so the outer build must
// NOT raise on it.
(Member as unknown as HasManyHost).hasMany("membersViaRawClub", {
  through: "club",
  source: "rawMembers",
  scope: (rel: JoinWhere) => rel.where("clubs.name IS NOT NULL"),
});

describe("Preloader::ThroughAssociation#through_scope nested raw-join attribution", () => {
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

  it("raises when the outer reflection's OWN scope carries a raw join", () => {
    const groucho = members("groucho");
    const loader = throughLoader([groucho], "rawMembersOfClub");
    expect(() => buildSql(loader)).toThrow(ConfigurationError);
  });

  it("does NOT raise when only the source sub-chain carries a raw join", () => {
    const groucho = members("groucho");
    const loader = throughLoader([groucho], "membersViaRawClub");
    // The sub-chain's raw join is flattened into `_reflectionScope`, but reading
    // the outer reflection's OWN scope keeps it off this build — Rails defers it
    // to the sub-chain's own recursive source-preloader stage.
    expect(() => buildSql(loader)).not.toThrow();
  });

  it("raises on preload when the outer own scope carries a raw join, matching Rails", async () => {
    const groucho = members("groucho");
    await expect(Member.where({ id: groucho.id }).preload("rawMembersOfClub")).rejects.toThrow(
      ConfigurationError,
    );
  });
});
