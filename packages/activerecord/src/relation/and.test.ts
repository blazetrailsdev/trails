/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/relation/and_test.rb
 */
import { describe, it, expect } from "vitest";
import "../index.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Author } from "../test-helpers/models/author.js";

describe("AndTest", () => {
  const { authors } = useHandlerFixtures(["authors", "authorAddresses"], {
    schema: canonicalSchema,
  });

  it("and", async () => {
    const david = authors("david");
    const mary = authors("mary");
    const bob = authors("bob");

    const davidAndMary = Author.where({ id: [david, mary] }).order("id");
    const maryAndBob = Author.where({ id: [mary, bob] }).order("id");

    expect((await davidAndMary.and(maryAndBob).toArray()).map((a: any) => a.id)).toEqual([mary.id]);
  });

  it("and with non relation attribute", async () => {
    const hash = { id: 123 };
    expect(() => Author.and(hash as any)).toThrow(
      "You have passed Hash object to #and. Pass an ActiveRecord::Relation object instead.",
    );
  });

  it("and with structurally incompatible scope", async () => {
    const postsScope = Author.unscope("order").limit(10).offset(10).select("id").order("id");
    expect(() => Author.limit(10).select("id").order("name").and(postsScope)).toThrow(
      "Relation passed to #and must be structurally compatible. Incompatible values: [:order, :offset]",
    );
  });
});
