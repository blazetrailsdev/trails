// Tests for the tableless fixture loader — mirrors Rails' naked/yml fixture test cases.
// vendor/rails/activerecord/test/cases/fixtures_test.rb (FixturesTest)
import { describe, it, expect, beforeAll } from "vitest";
import { useFixtures } from "./use-fixtures.js";
import { defineJoinTableFixtures } from "./define-fixtures.js";
import { defineSchema } from "./define-schema.js";
import { setupHandlerSuite } from "./setup-handler-suite.js";
import { TEST_SCHEMA } from "./test-schema.js";
import { Tree } from "./models/tree.js";
import { Base } from "../base.js";
import "../relation.js";
import { nakedYmlAccountsFixtureData } from "./fixtures/naked/yml/accounts.js";
import { nakedYmlCompaniesFixtureData } from "./fixtures/naked/yml/companies.js";
import { nakedYmlParrotsFixtureData } from "./fixtures/naked/yml/parrots.js";
import { nakedYmlTreesFixtureData } from "./fixtures/naked/yml/trees.js";

// Subset of TEST_SCHEMA for tables touched by tableless tests.
const NAKED_SCHEMA = {
  accounts: TEST_SCHEMA.accounts,
  companies: TEST_SCHEMA.companies,
  parrots: TEST_SCHEMA.parrots,
  trees: TEST_SCHEMA.trees,
} as const;

describe("tableless useFixtures (naked/yml)", () => {
  setupHandlerSuite();

  beforeAll(async () => {
    await defineSchema(Base.connection, NAKED_SCHEMA);
  });

  // test_empty_yaml_fixture — accounts.yml is an empty file; seeding 0 rows succeeds.
  describe("test_empty_yaml_fixture", () => {
    const { accounts } = useFixtures(
      [{ table: "accounts", data: nakedYmlAccountsFixtureData }],
      () => Base.connection,
    );

    it("loads an empty fixture set without error", () => {
      expect(accounts.all()).toHaveLength(0);
    });
  });

  // test_empty_yaml_fixture_with_a_comment_in_it — companies.yml has only a comment.
  describe("test_empty_yaml_fixture_with_a_comment_in_it", () => {
    const { companies } = useFixtures(
      [{ table: "companies", data: nakedYmlCompaniesFixtureData }],
      () => Base.connection,
    );

    it("loads a comment-only fixture set without error", () => {
      expect(companies.all()).toHaveLength(0);
    });
  });

  // test_yaml_file_with_invalid_column — parrots.yml has columns "arrr" and "foobar"
  // that do not exist on the parrots table.
  // Rails: table "parrots" has no columns named "arrr", "foobar".
  // Trails: mirrors the same error format, reporting all invalid columns at once.
  //
  // The test calls defineJoinTableFixtures directly rather than routing through
  // useFixtures because the error surfaces in beforeEach: Vitest marks the enclosing
  // test as failed with the hook error, which cannot be intercepted with
  // expect().rejects inside the same test body. Testing the underlying function is
  // equivalent — useFixtures delegates to defineJoinTableFixtures in its beforeEach
  // without wrapping the error.
  describe("test_yaml_file_with_invalid_column", () => {
    it("raises with Rails-mirrored message listing all unknown columns", async () => {
      await expect(
        defineJoinTableFixtures(Base.connection, "parrots", nakedYmlParrotsFixtureData),
      ).rejects.toThrow('table "parrots" has no columns named "arrr", "foobar".');
    });
  });

  // test_yaml_file_with_symbol_columns — trees.yml uses Ruby symbol keys (:id, :name).
  // Rails strips the leading colon and inserts id=1, name="The Root".
  // Trails: the TS fixture data already uses plain keys; insertion works correctly.
  describe("test_yaml_file_with_symbol_columns", () => {
    const { trees } = useFixtures(
      [{ table: "trees", data: nakedYmlTreesFixtureData }],
      () => Base.connection,
    );

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
