import { describe, it, expect } from "vitest";
import { defineJoinTableFixtures } from "./fixtures.js";
import { fixtures } from "./test-fixtures.js";
import { Tree } from "./test-helpers/models/tree.js";
import { Base } from "./base.js";
import "./relation.js";
import { nakedYmlAccountsFixtureData } from "./test-helpers/fixtures/naked/yml/accounts.js";
import { nakedYmlCompaniesFixtureData } from "./test-helpers/fixtures/naked/yml/companies.js";
import { nakedYmlParrotsFixtureData } from "./test-helpers/fixtures/naked/yml/parrots.js";
import { nakedYmlTreesFixtureData } from "./test-helpers/fixtures/naked/yml/trees.js";

describe("tableless useFixtures (naked/yml)", () => {
  describe("test_empty_yaml_fixture", () => {
    const { accounts } = fixtures([{ table: "accounts", data: nakedYmlAccountsFixtureData }]);

    it("loads an empty fixture set without error", () => {
      expect(accounts.all()).toHaveLength(0);
    });
  });

  describe("test_empty_yaml_fixture_with_a_comment_in_it", () => {
    const { companies } = fixtures([{ table: "companies", data: nakedYmlCompaniesFixtureData }]);

    it("loads a comment-only fixture set without error", () => {
      expect(companies.all()).toHaveLength(0);
    });
  });

  describe("test_yaml_file_with_invalid_column", () => {
    it("raises with Rails-mirrored message listing all unknown columns", async () => {
      await expect(
        defineJoinTableFixtures(Base.connection, "parrots", nakedYmlParrotsFixtureData),
      ).rejects.toThrow('table "parrots" has no columns named "arrr", "foobar".');
    });
  });

  describe("test_yaml_file_with_symbol_columns", () => {
    const { trees } = fixtures([{ table: "trees", data: nakedYmlTreesFixtureData }]);

    it("inserts the row and it can be found by primary key", async () => {
      const root = await Tree.findBy({ id: 1 });
      expect(root).not.toBeNull();
      expect(root!.name).toBe("The Root");
    });

    it("accessor returns the row as a plain object", () => {
      const row = trees("root");
      expect(row).toMatchObject({ id: 1, name: "The Root" });
    });

    it(".all() returns all rows", () => {
      expect(trees.all()).toHaveLength(1);
    });
  });
});
