import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import { ConfigurationError } from "../../../../lib/errors.js";
import { fixtures } from "../../../../lib/test-helpers/use-fixtures.js";
import { Preloader } from "../../../../lib/associations/preloader.js";
import { ThroughAssociation } from "../../../../lib/associations/preloader/through-association.js";
import { Member } from "../../../models/member.js";
import { Club } from "../../../models/club.js";
import { Membership, CurrentMembership } from "../../../models/membership.js";
import { Category } from "../../../models/category.js";

constSet(TopLevel, "Member", Member);
constSet(TopLevel, "Club", Club);
Membership.inheritanceColumn = "type";
constSet(TopLevel, "Membership", Membership);
constSet(TopLevel, "CurrentMembership", CurrentMembership);
Category.inheritanceColumn = "type";
constSet(TopLevel, "Category", Category);

type JoinWhere = {
  joins: (sql: string) => JoinWhere;
  where: (sql: string) => JoinWhere;
};
type HasOneHost = {
  hasOne: (
    name: string,
    scope: (rel: JoinWhere) => JoinWhere,
    options: Record<string, unknown>,
  ) => void;
};

(Member as unknown as HasOneHost).hasOne(
  "rawGeneralClub",
  function (this: JoinWhere) {
    return this.joins("INNER JOIN categories ON categories.id = clubs.category_id").where(
      "categories.name = 'General'",
    );
  },
  {
    through: "currentMembership",
    source: "club",
  },
);

describe("Preloader::ThroughAssociation#through_scope raw-join handling", () => {
  const { members } = fixtures(["memberTypes", "members", "clubs", "memberships", "categories"]);

  async function throughLoader(owners: Member[], name: string): Promise<ThroughAssociation> {
    const loaders = await new Preloader({
      records: owners,
      associations: [name],
      associateByDefault: false,
    }).loaders();
    const loader = loaders.find((l) => l instanceof ThroughAssociation);
    if (!loader) throw new Error("expected a ThroughAssociation loader");
    return loader;
  }

  it("nests the reflection scope's raw join under the source reflection, as Rails does", async () => {
    const groucho = members("groucho");
    const loader = await throughLoader([groucho], "rawGeneralClub");
    expect(() =>
      (loader as unknown as { throughScope: () => { toSql: () => string } }).throughScope().toSql(),
    ).toThrow(ConfigurationError);
  });

  it("raises ConfigurationError on preload, matching Rails", async () => {
    const groucho = members("groucho");
    await expect(Member.where({ id: groucho.id }).preload(":rawGeneralClub")).rejects.toThrow(
      ConfigurationError,
    );
  });
});
