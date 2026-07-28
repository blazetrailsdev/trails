/**
 * Preloader::ThroughAssociation#through_scope — multi-level nested join carry.
 *
 * Rails' `through_scope` nests the whole reflection-scope structural spec under
 * the source reflection name — `joins!/left_outer_joins!/includes!(source => …)`
 * (vendor/rails/activerecord/lib/active_record/associations/preloader/through_association.rb:120-142)
 * — so a scope whose `.left_joins(category: :categorizations)` reaches a
 * TWO-levels-deep table (`categorizations`, via club → category →
 * categorizations) realizes that deeper join on the through query, and a
 * predicate qualifying it (`categorizations.author_id = …`) constrains which
 * through row wins on the through query itself rather than deferring to the
 * source-preloader stage.
 *
 * trails widens the has_one-through query's resolvable-table set with the tables
 * the scope's joins/includes reach; `_resolveNestedTableNames` now walks nested
 * hash specs recursively, resolving each level against the correct klass, so the
 * two-level `categorizations` table enters the set. No canonical has_one-through
 * model scope reaches two levels, so this pins the behavior by declaring one on
 * the canonical Member model (mirroring `general_club`).
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../../index.js";
import { fixtures } from "../../test-fixtures.js";
import { Preloader } from "../preloader.js";
import { ThroughAssociation } from "./through-association.js";
import { Member } from "../../test-helpers/models/member.js";
import { Club } from "../../test-helpers/models/club.js";
import { Membership, CurrentMembership } from "../../test-helpers/models/membership.js";
import { Category } from "../../test-helpers/models/category.js";
import { Categorization } from "../../test-helpers/models/categorization.js";
import { quoteTableName, escapeRegExp } from "../../support/quote-regex.js";

registerModel(Member);
registerModel(Club);
Membership.inheritanceColumn = "type";
registerModel(Membership);
registerModel(CurrentMembership);
Category.inheritanceColumn = "type";
registerModel(Category);
registerModel(Categorization);

type NestedRel = {
  leftJoins: (spec: Record<string, unknown>) => NestedRel;
  where: (spec: Record<string, unknown>) => NestedRel;
};
type HasOneHost = {
  hasOne: (name: string, options: Record<string, unknown>) => void;
};
type HasManyHost = {
  hasMany: (name: string, options: Record<string, unknown>) => void;
};

// A has_one-through mirroring `general_club` (Member → current_membership →
// club) but whose scope reaches `categorizations` — two levels deep from the
// source klass Club (club → category → categorizations) — and predicates on it.
// `categorizations.author_id = 1` (david) matches category `general`, so
// groucho's through row (boring_club, category general) survives.
(Member as unknown as HasOneHost).hasOne("davidCategorizedClub", {
  through: "currentMembership",
  source: "club",
  scope: (rel: NestedRel) =>
    rel.leftJoins({ category: "categorizations" }).where({ categorizations: { author_id: 1 } }),
});

// Same shape but reaching the deeper table via `.includes` instead of
// `.leftJoins`. Rails' through_scope nests the scope's `values[:includes]` under
// the source reflection (`includes!(source => includes)`), so `.includes` and
// `.leftJoins` both realize the deeper join on the through query. Pins that a
// has_one-through honors an explicit `.includes` in its scope.
(Member as unknown as HasOneHost).hasOne("davidIncludedCategorizedClub", {
  through: "currentMembership",
  source: "club",
  scope: (rel: NestedRel) =>
    (rel as unknown as { includes: (s: Record<string, unknown>) => NestedRel })
      .includes({ category: "categorizations" })
      .where({ categorizations: { author_id: 1 } }),
});

// A has_MANY-through whose scope carries a `.includes` reaching a belongs_to
// association (`category` on Club) plus a predicate on it. A belongs_to join is
// 1:1, so it does NOT fan the through rows out and IS nested onto the through
// query even for a collection target — the predicate must resolve there, not
// leak onto the source query where `categories` is unjoined.
(Member as unknown as HasManyHost).hasMany("generalClubs", {
  through: "favoriteMemberships",
  source: "club",
  scope: (rel: NestedRel) =>
    (rel as unknown as { includes: (s: string) => NestedRel })
      .includes("category")
      .where({ categories: { name: "General" } }),
});

// A has_MANY-through whose scope includes a two-level nested path
// (`categorizations`, a has_many via club → category → categorizations) AND
// predicates on it. Rails' `through_scope` nests `values[:includes]` under the
// source reflection and eager-loads it, whose JoinDependency instantiates
// distinct parents by primary key — so the deeper join no longer fans the
// middle records out. The join and its `categorizations.author_id` predicate
// are realized on the through query, resolving there instead of leaking onto
// the source stage.
(Member as unknown as HasManyHost).hasMany("categorizedClubs", {
  through: "favoriteMemberships",
  source: "club",
  scope: (rel: NestedRel) =>
    (rel as unknown as { includes: (s: Record<string, unknown>) => NestedRel })
      .includes({ category: "categorizations" })
      .where({ categorizations: { author_id: 1 } }),
});

describe("Preloader::ThroughAssociation#through_scope multi-level nested join carry", () => {
  const { members, clubs } = fixtures([
    "memberTypes",
    "members",
    "clubs",
    "memberships",
    "categories",
    "categorizations",
    "authors",
  ]);

  function throughScopeSql(owners: Member[], name: string): string {
    const loader = new Preloader({
      records: owners,
      associations: [name],
      associateByDefault: false,
    }).loaders.find((l) => l instanceof ThroughAssociation);
    if (!loader) throw new Error("expected a ThroughAssociation loader");
    return (loader as unknown as { _buildThroughScope: () => { toSql: () => string } })
      ._buildThroughScope()
      .toSql();
  }

  it("nests the two-level scope join under the source reflection on the through query", () => {
    const groucho = members("groucho");
    const sql = throughScopeSql([groucho], "davidCategorizedClub");
    // The deeper `categorizations` join is realized on the through query by
    // nesting the scope's `.leftJoins({ category: "categorizations" })` under the
    // source reflection, and the copied full where_clause qualifies it, so the
    // predicate rides the through query's WHERE too.
    // Quote identifiers via the active adapter (Rails' `quote_table_name`
    // pattern) so the assertions run on SQLite/PG (`"x"`) and MariaDB (`` `x` ``).
    expect(sql).toMatch(new RegExp(`JOIN ${escapeRegExp(quoteTableName("categories"))}`));
    expect(sql).toMatch(new RegExp(`JOIN ${escapeRegExp(quoteTableName("categorizations"))}`));
    expect(sql).toMatch(
      new RegExp(`WHERE.*${escapeRegExp(quoteTableName("categorizations.author_id"))}`),
    );
  });

  it("nests an explicit scope includes under the source reflection on the through query", () => {
    const groucho = members("groucho");
    const sql = throughScopeSql([groucho], "davidIncludedCategorizedClub");
    // Rails nests `values[:includes]` under the source reflection, joining the
    // deeper tables so the copied `categorizations.author_id` predicate resolves
    // on the through query (rather than being left on the source query where the
    // table is not joined).
    expect(sql).toMatch(new RegExp(`JOIN ${escapeRegExp(quoteTableName("categories"))}`));
    expect(sql).toMatch(new RegExp(`JOIN ${escapeRegExp(quoteTableName("categorizations"))}`));
    expect(sql).toMatch(
      new RegExp(`WHERE.*${escapeRegExp(quoteTableName("categorizations.author_id"))}`),
    );
  });

  it("nests a belongs_to scope includes onto the through query for a has_many-through", () => {
    const groucho = members("groucho");
    const sql = throughScopeSql([groucho], "generalClubs");
    // `category` (belongs_to on Club) is a 1:1 join, so even for this collection
    // target it is nested onto the through query and the `categories.name`
    // predicate resolves there — not left on the source query where `categories`
    // is unjoined (an invalid predicate).
    expect(sql).toMatch(new RegExp(`JOIN ${escapeRegExp(quoteTableName("categories"))}`));
    expect(sql).toMatch(new RegExp(`WHERE.*${escapeRegExp(quoteTableName("categories.name"))}`));
  });

  it("nests a has_many-through fan-out include+predicate onto the through query via eager-load", () => {
    const groucho = members("groucho");
    const sql = throughScopeSql([groucho], "categorizedClubs");
    // Rails nests the scope's `values[:includes]` under the source reflection
    // and eager-loads it; the JoinDependency dedups the middle records by PK, so
    // the two-level `categorizations` join is realized on the through query and
    // the copied `categorizations.author_id` predicate resolves there rather than
    // being deferred to (and orphaned on) the source stage.
    expect(sql).toMatch(new RegExp(`JOIN ${escapeRegExp(quoteTableName("categorizations"))}`));
    expect(sql).toMatch(
      new RegExp(`WHERE.*${escapeRegExp(quoteTableName("categorizations.author_id"))}`),
    );
  });

  type AssocHost = {
    id: number;
    association: (name: string) => {
      loadTarget: () => Promise<{ id: number } | null>;
      target: { id: number } | null;
    };
  };
  const assoc = (m: unknown) => (m as AssocHost).association("davidCategorizedClub");

  it("loading with scope including a two-level nested join", async () => {
    let member = (await Member.first()) as unknown as AssocHost;
    expect(member?.id).toBe(members("groucho").id);
    expect((await assoc(member).loadTarget())?.id).toBe(clubs("boring_club").id);

    member = (await Member.preload("davidCategorizedClub").first()) as unknown as AssocHost;
    expect(member?.id).toBe(members("groucho").id);
    expect(assoc(member).target?.id).toBe(clubs("boring_club").id);

    member = (await Member.eagerLoad("davidCategorizedClub").first()) as unknown as AssocHost;
    expect(member?.id).toBe(members("groucho").id);
    expect(assoc(member).target?.id).toBe(clubs("boring_club").id);
  });
});
