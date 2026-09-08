import { describe, expect, it } from "vitest";

import { Digestor } from "../digestor.js";
import { LookupContext } from "../lookup-context.js";
import { DetailsKey } from "../lookup-context.js";
import { FixtureResolver } from "../testing/resolvers.js";

describe("Digestor.digest nested dependencies", () => {
  function digest(dependencies: ReadonlyArray<string | ReadonlyArray<string>>): string {
    DetailsKey.clear();
    const finder = new LookupContext();
    finder.addResolver(new FixtureResolver({ "posts/show.html.tse": "hello" }));
    return Digestor.digest({ name: "posts/show", format: "html", finder, dependencies });
  }

  it("joins a nested dependency with the outer separator, as Ruby's Array#join does", () => {
    expect(digest([["a", "b"]])).toBe(digest(["a", "b"]));
  });

  it("still distinguishes a nested dependency from an unrelated one", () => {
    expect(digest([["a", "b"]])).not.toBe(digest([["a", "c"]]));
  });
});
