import { describe, it, expect } from "vitest";
import "../index.js";
import { assertRaises } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { fixtures } from "../test-fixtures.js";
import { Author } from "../test-helpers/models/author.js";

describe("AndTest", () => {
  const { authors } = fixtures(["authors", "authorAddresses"]);

  it("and", async () => {
    const david = authors("david");
    const mary = authors("mary");
    const bob = authors("bob");

    const davidAndMary = Author.where({ id: [david, mary] }).order("id");
    const maryAndBob = Author.where({ id: [mary, bob] }).order("id");

    expect((await davidAndMary.and(maryAndBob)).map((a: any) => a.id)).toEqual([mary.id]);
  });

  it("and with non relation attribute", async () => {
    const hash = { id: 123 };
    const error = await assertRaises([ArgumentError], {}, () => {
      Author.and(hash as any);
    });

    expect(error.message).toBe(
      "You have passed Hash object to #and. Pass an ActiveRecord::Relation object instead.",
    );
  });

  it("and with structurally incompatible scope", async () => {
    const postsScope = Author.unscope(":order").limit(10).offset(10).select("id").order("id");
    const error = await assertRaises([ArgumentError], {}, () => {
      Author.limit(10).select("id").order("name").and(postsScope);
    });

    expect(error.message).toBe(
      "Relation passed to #and must be structurally compatible. Incompatible values: [:order, :offset]",
    );
  });
});
