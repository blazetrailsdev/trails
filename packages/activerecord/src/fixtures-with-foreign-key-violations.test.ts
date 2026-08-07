// vendor/rails/activerecord/test/cases/fixtures_test.rb (FixturesWithForeignKeyViolationsTest,
// fixtures_test.rb:887-952), which flips ActiveRecord.verify_foreign_keys_for_fixtures on and
// loads fk_pointing_to_non_existent_objects — the table schema.rb:1402-1404 gives the
// fk_that_will_be_broken constraint precisely so a dangling label can be caught.
import { describe, it, expect } from "vitest";
import { defineJoinTableFixtures } from "./fixtures.js";
import { ActiveRecord } from "./ar-config.js";
import { Base } from "./base.js";
import "./relation.js";

// Rails' `with_verify_foreign_keys_for_fixtures` (fixtures_test.rb:945-951).
async function withVerifyForeignKeysForFixtures(block: () => Promise<void>): Promise<void> {
  const settingWas = ActiveRecord.verifyForeignKeysForFixtures;
  ActiveRecord.verifyForeignKeysForFixtures = true;
  try {
    await block();
  } finally {
    ActiveRecord.verifyForeignKeysForFixtures = settingWas;
  }
}

describe("FixturesWithForeignKeyViolationsTest", () => {
  describe("test_raises_fk_violations", () => {
    it("raises with the fixture-data message the gem raises", async () => {
      await withVerifyForeignKeysForFixtures(async () => {
        await expect(
          defineJoinTableFixtures(Base.connection, "fk_pointing_to_non_existent_objects", {
            first: { fk_object_to_point_to_id: 4242 },
          }),
        ).rejects.toThrow(
          "Foreign key violations found in your fixture data. Ensure you aren't referring to labels that don't exist on associations.",
        );
      });
    });
  });

  describe("test_does_not_raise_if_no_fk_violations", () => {
    it("loads a fixture pointing at a row that exists", async () => {
      await defineJoinTableFixtures(Base.connection, "fk_object_to_point_tos", {
        first: { id: 1 },
      });
      await withVerifyForeignKeysForFixtures(async () => {
        await expect(
          defineJoinTableFixtures(Base.connection, "fk_pointing_to_non_existent_objects", {
            first: { fk_object_to_point_to_id: 1 },
          }),
        ).resolves.toBeDefined();
      });
    });
  });

  // Trails-only: the flag is off by default (ar-config.ts:270), and fixtures.rb:697 returns
  // before it ever reaches the adapter — so the dangling row above loads without a check.
  it("does not check foreign keys when the flag is off", async () => {
    await expect(
      defineJoinTableFixtures(Base.connection, "fk_pointing_to_non_existent_objects", {
        first: { fk_object_to_point_to_id: 4242 },
      }),
    ).resolves.toBeDefined();
  });
});
