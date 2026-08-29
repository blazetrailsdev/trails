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
  hasMany: (
    name: string,
    scope: (rel: JoinWhere) => JoinWhere,
    options: Record<string, unknown>,
  ) => void;
};
type HasOneHost = {
  hasOne: (
    name: string,
    scope: (rel: JoinWhere) => JoinWhere,
    options: Record<string, unknown>,
  ) => void;
};

(Member as unknown as HasManyHost).hasMany(
  "rawMembersOfClub",
  (rel: JoinWhere) =>
    rel
      .joins("INNER JOIN categories ON categories.id = memberships.club_id")
      .where("categories.name = 'General'"),
  {
    through: "club",
    source: "members",
  },
);

(Club as unknown as HasManyHost).hasMany(
  "rawMembers",
  (rel: JoinWhere) =>
    rel
      .joins("INNER JOIN categories ON categories.id = members.id")
      .where("categories.name = 'General'"),
  {
    through: "memberships",
    source: "member",
  },
);
(Member as unknown as HasManyHost).hasMany(
  "membersViaRawClub",
  (rel: JoinWhere) => rel.where("clubs.name IS NOT NULL"),
  {
    through: "club",
    source: "rawMembers",
  },
);

(Member as unknown as HasManyHost).hasMany(
  "noWhereRawMembersOfClub",
  (rel: JoinWhere) => rel.joins("INNER JOIN categories ON categories.id = memberships.club_id"),
  {
    through: "club",
    source: "members",
  },
);

(Member as unknown as HasOneHost).hasOne(
  "rawCategoryOfClub",
  (rel: JoinWhere) =>
    rel
      .joins("INNER JOIN categorizations ON categorizations.category_id = categories.id")
      .where("categorizations.author_id = 1"),
  {
    through: "club",
    source: "category",
  },
);

describe("Preloader::ThroughAssociation#through_scope nested raw-join handling", () => {
  const { members } = fixtures(["memberTypes", "members", "clubs", "memberships", "categories"]);

  async function throughLoader(owners: Member[], name: string): Promise<ThroughAssociation> {
    const loader = (
      await new Preloader({
        records: owners,
        associations: [name],
        associateByDefault: false,
      }).loaders()
    ).find((l) => l instanceof ThroughAssociation);
    if (!loader) throw new Error("expected a ThroughAssociation loader");
    return loader;
  }

  function buildSql(loader: ThroughAssociation): string {
    return (loader as unknown as { throughScope: () => { toSql: () => string } })
      .throughScope()
      .toSql();
  }

  it("raises when the outer reflection's own scope carries a raw join", async () => {
    const groucho = members("groucho");
    const loader = await throughLoader([groucho], "rawMembersOfClub");
    expect(() => buildSql(loader)).toThrow(ConfigurationError);
  });

  it("raises when only the source sub-chain carries a raw join, matching Rails", async () => {
    const groucho = members("groucho");
    const loader = await throughLoader([groucho], "membersViaRawClub");
    expect(() => buildSql(loader)).toThrow(ConfigurationError);
  });

  it("raises for a has_one nested through whose scope carries a raw join", async () => {
    const groucho = members("groucho");
    const loader = await throughLoader([groucho], "rawCategoryOfClub");
    expect(() => buildSql(loader)).toThrow(ConfigurationError);
  });

  it("does NOT raise when the chain carries a raw join but an empty where_clause", async () => {
    const groucho = members("groucho");
    const loader = await throughLoader([groucho], "noWhereRawMembersOfClub");
    expect(() => buildSql(loader)).not.toThrow();
  });

  it("raises ConfigurationError on preload, matching Rails", async () => {
    const groucho = members("groucho");
    await expect(Member.where({ id: groucho.id }).preload(":membersViaRawClub")).rejects.toThrow(
      ConfigurationError,
    );
  });
});
