import { describe, it, expect } from "vitest";
import { registerModel } from "../../index.js";
import { groupBy } from "@blazetrails/ruby-compat";
import { fixtures } from "../../test-fixtures.js";
import { Preloader } from "../preloader.js";
import { Author } from "../../test-helpers/models/author.js";
import { LoaderQuery } from "./association.js";

registerModel(Author);

const scopeWith = (where: unknown[]) => ({
  tableName: "posts",
  model: { tableName: "posts", connectionSpecificationName: "ActiveRecord::Base" },
  valuesForQueries: () => ({ where }),
});

describe("Preloader::Association::LoaderQuery", () => {
  it("keys a bigint as the Integer it is, not as a String", () => {
    const big = new LoaderQuery(scopeWith([9223372036854775808n]), "author_id");
    const same = new LoaderQuery(scopeWith([9223372036854775808n]), "author_id");
    const str = new LoaderQuery(scopeWith(["9223372036854775808"]), "author_id");
    expect(big.eql(same)).toBe(true);
    expect(big.hash()).toBe(same.hash());
    expect(big.eql(str)).toBe(false);
    expect(big.hash()).not.toBe(str.hash());
    const float = new LoaderQuery(scopeWith([Number(9223372036854775808n)]), "author_id");
    expect(big.eql(float)).toBe(true);
    expect(big.hash()).not.toBe(float.hash());
    expect(new LoaderQuery(scopeWith([1n]), "author_id").hash()).toBe(
      new LoaderQuery(scopeWith([1]), "author_id").hash(),
    );
  });

  describe("with a real scope", () => {
    const { authors } = fixtures(["authors", "posts"]);

    it("compares two separately built equal scopes as equal", async () => {
      const loaderFor = async () =>
        (
          await new Preloader({
            records: [authors("david")],
            associations: ["posts"],
            associateByDefault: false,
          }).loaders()
        )[0];
      const [a, b] = [await loaderFor(), await loaderFor()];
      expect(a.loaderQuery().eql(b.loaderQuery())).toBe(true);
      expect(a.loaderQuery().hash()).toBe(b.loaderQuery().hash());
    });

    it("groups loaders whose scopes carry equal where clauses, and separates unequal ones", async () => {
      const loaders = await new Preloader({
        records: [authors("david")],
        associations: ["thinkingPosts", "thinkingPosts", "welcomePosts"],
        associateByDefault: false,
      }).loaders();
      const grouped = groupBy(loaders, (loader) => loader.loaderQuery());
      expect([...grouped.values()].map((similar) => similar.length)).toEqual([2, 1]);
    });
  });
});
