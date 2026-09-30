import { describe, it, expect } from "vitest";
import { LoaderQuery } from "./association.js";

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
    expect(new LoaderQuery(scopeWith([1n]), "author_id").hash()).toBe(
      new LoaderQuery(scopeWith([1]), "author_id").hash(),
    );
  });
});
