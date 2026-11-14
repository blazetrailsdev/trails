import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "../../../lib/index.js";
import { Associations } from "../../../lib/associations.js";
import { fixtures } from "../../support/use-fixtures.js";

fixtures({});

describe("Relation#unscope — full Rails key coverage", () => {
  class UscAuthor extends Base {
    static {
      this.attribute("name", "string");
    }
  }
  class UscPost extends Base {
    static {
      this.attribute("usc_author_id", "integer");
      this.attribute("title", "string");
    }
  }

  beforeEach(() => {
    constSet(TopLevel, "UscAuthor", UscAuthor);
    DescendantsTracker.registerSubclass(Base, UscAuthor);
    constSet(TopLevel, "UscPost", UscPost);
    DescendantsTracker.registerSubclass(Base, UscPost);
    (UscAuthor as any)._reflections = {};
    (UscPost as any)._reflections = {};
    Associations.hasMany.call(UscAuthor, "uscPosts", {
      className: "UscPost",
      foreignKey: "usc_author_id",
    });
  });

  it("unscope('createWith') raises: create_with is not a valid unscoping value", () => {
    const rel = (UscAuthor as any).all().createWith({ name: "default" });
    expect(() => rel.unscope(":createWith")).toThrow(
      "Called unscope() with invalid unscoping argument ':createWith'.",
    );
  });

  it("unscope('preload') clears preload only — leaves includes / eagerLoad alone", () => {
    const rel = (UscAuthor as any)
      .all()
      .preload(":uscPosts")
      .includes(":uscPosts")
      .eagerLoad(":uscPosts");
    expect(rel.preloadValues).toEqual([":uscPosts"]);
    const cleared = rel.unscope(":preload");
    expect(cleared.preloadValues).toEqual([]);
    expect(cleared.includesValues).toEqual([":uscPosts"]);
    expect(cleared.eagerLoadValues).toEqual([":uscPosts"]);
  });

  it("unscope('eagerLoad') clears eagerLoad only — leaves includes / preload alone", () => {
    const rel = (UscAuthor as any)
      .all()
      .preload(":uscPosts")
      .includes(":uscPosts")
      .eagerLoad(":uscPosts");
    const cleared = rel.unscope(":eagerLoad");
    expect(cleared.eagerLoadValues).toEqual([]);
    expect(cleared.includesValues).toEqual([":uscPosts"]);
    expect(cleared.preloadValues).toEqual([":uscPosts"]);
  });

  it("unscope('includes') clears includes only — leaves preload / eagerLoad alone (Rails-faithful)", () => {
    const rel = (UscAuthor as any)
      .all()
      .preload(":uscPosts")
      .includes(":uscPosts")
      .eagerLoad(":uscPosts");
    const cleared = rel.unscope(":includes");
    expect(cleared.includesValues).toEqual([]);
    expect(cleared.preloadValues).toEqual([":uscPosts"]);
    expect(cleared.eagerLoadValues).toEqual([":uscPosts"]);
  });
});
