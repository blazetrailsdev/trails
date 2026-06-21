import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { _inlinePolymorphicKeys } from "../associations.js";
import type { Base } from "../base.js";
import type { AssociationOptions } from "../associations.js";

describe("_inlinePolymorphicKeys", () => {
  // The "couldn't correctly interpret the query constraints" raise mirrors
  // Rails' deriveFkQueryConstraints (reflection.rb): the query_constraints
  // list is rendered with Ruby's Array#inspect — `["blog_id", "id"]`, with
  // brackets and quoted elements — not the bare `blog_id,id` a JS array
  // coerces to. This shape is unreachable through a real 2-attribute list
  // (the owner PK always sits at one end), so we force the defensive branch
  // by having `includes` report the PK present while neither end matches.
  it("renders the query constraints list as a Ruby array inspect in the ArgumentError", () => {
    const pk = "post_id";
    const qc: string[] = ["blog_id", "id"];
    qc.includes = (value: string) => value === pk;

    const ctor = { name: "ShardedBlogPost", primaryKey: pk } as unknown as typeof Base;
    const options = { queryConstraints: qc } as unknown as AssociationOptions;

    expect(() => _inlinePolymorphicKeys(ctor, options, pk, "author_id")).toThrow(ArgumentError);

    expect(() => _inlinePolymorphicKeys(ctor, options, pk, "author_id")).toThrow(
      "Active Record couldn't correctly interpret the query constraints " +
        "for the `ShardedBlogPost` model. The query constraints on `ShardedBlogPost` are " +
        '`["blog_id", "id"]` and the foreign key is `author_id`. ' +
        "You need to explicitly set the query constraints for this association.",
    );
  });
});
