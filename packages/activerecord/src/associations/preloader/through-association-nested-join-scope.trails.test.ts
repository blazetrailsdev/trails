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
import { quoteTableName } from "../../support/quote-regex.js";
import { regexpEscape } from "@blazetrails/ruby-compat";

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
  hasOne: (
    name: string,
    scope: (rel: NestedRel) => NestedRel,
    options: Record<string, unknown>,
  ) => void;
};
type HasManyHost = {
  hasMany: (
    name: string,
    scope: (rel: NestedRel) => NestedRel,
    options: Record<string, unknown>,
  ) => void;
};

(Member as unknown as HasOneHost).hasOne(
  "davidCategorizedClub",
  (rel: NestedRel) =>
    rel.leftJoins({ ":category": ":categorizations" }).where({ categorizations: { author_id: 1 } }),
  {
    through: "currentMembership",
    source: "club",
  },
);

(Member as unknown as HasOneHost).hasOne(
  "davidIncludedCategorizedClub",
  (rel: NestedRel) =>
    (rel as unknown as { includes: (s: Record<string, unknown>) => NestedRel })
      .includes({ ":category": ":categorizations" })
      .where({ categorizations: { author_id: 1 } }),
  {
    through: "currentMembership",
    source: "club",
  },
);

(Member as unknown as HasManyHost).hasMany(
  "generalClubs",
  (rel: NestedRel) =>
    (rel as unknown as { includes: (s: string) => NestedRel })
      .includes(":category")
      .where({ categories: { name: "General" } }),
  {
    through: "favoriteMemberships",
    source: "club",
  },
);

(Member as unknown as HasManyHost).hasMany(
  "categorizedClubs",
  (rel: NestedRel) =>
    (rel as unknown as { includes: (s: Record<string, unknown>) => NestedRel })
      .includes({ ":category": ":categorizations" })
      .where({ categorizations: { author_id: 1 } }),
  {
    through: "favoriteMemberships",
    source: "club",
  },
);

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

  async function throughScopeSql(owners: Member[], name: string): Promise<string> {
    const loader = (
      await new Preloader({
        records: owners,
        associations: [name],
        associateByDefault: false,
      }).loaders()
    ).find((l) => l instanceof ThroughAssociation);
    if (!loader) throw new Error("expected a ThroughAssociation loader");
    return (loader as unknown as { throughScope: () => { toSql: () => string } })
      .throughScope()
      .toSql();
  }

  it("nests the two-level scope join under the source reflection on the through query", async () => {
    const groucho = members("groucho");
    const sql = await throughScopeSql([groucho], "davidCategorizedClub");
    expect(sql).toMatch(new RegExp(`JOIN ${regexpEscape(quoteTableName("categories"))}`));
    expect(sql).toMatch(new RegExp(`JOIN ${regexpEscape(quoteTableName("categorizations"))}`));
    expect(sql).toMatch(
      new RegExp(`WHERE.*${regexpEscape(quoteTableName("categorizations.author_id"))}`),
    );
  });

  it("nests an explicit scope includes under the source reflection on the through query", async () => {
    const groucho = members("groucho");
    const sql = await throughScopeSql([groucho], "davidIncludedCategorizedClub");
    expect(sql).toMatch(new RegExp(`JOIN ${regexpEscape(quoteTableName("categories"))}`));
    expect(sql).toMatch(new RegExp(`JOIN ${regexpEscape(quoteTableName("categorizations"))}`));
    expect(sql).toMatch(
      new RegExp(`WHERE.*${regexpEscape(quoteTableName("categorizations.author_id"))}`),
    );
  });

  it("nests a belongs_to scope includes onto the through query for a has_many-through", async () => {
    const groucho = members("groucho");
    const sql = await throughScopeSql([groucho], "generalClubs");
    expect(sql).toMatch(new RegExp(`JOIN ${regexpEscape(quoteTableName("categories"))}`));
    expect(sql).toMatch(new RegExp(`WHERE.*${regexpEscape(quoteTableName("categories.name"))}`));
  });

  it("nests a has_many-through fan-out include+predicate onto the through query via eager-load", async () => {
    const groucho = members("groucho");
    const sql = await throughScopeSql([groucho], "categorizedClubs");
    expect(sql).toMatch(new RegExp(`JOIN ${regexpEscape(quoteTableName("categorizations"))}`));
    expect(sql).toMatch(
      new RegExp(`WHERE.*${regexpEscape(quoteTableName("categorizations.author_id"))}`),
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

    member = (await Member.preload(":davidCategorizedClub").first()) as unknown as AssocHost;
    expect(member?.id).toBe(members("groucho").id);
    expect(assoc(member).target?.id).toBe(clubs("boring_club").id);

    member = (await Member.eagerLoad(":davidCategorizedClub").first()) as unknown as AssocHost;
    expect(member?.id).toBe(members("groucho").id);
    expect(assoc(member).target?.id).toBe(clubs("boring_club").id);
  });
});
