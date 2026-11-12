import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import "../../../lib/index.js";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { Topic } from "../../models/topic.js";
import type { Base } from "../../../lib/base.js";
import type { Relation } from "../../../lib/relation.js";
import type { ScopeMethod, ScopeOn } from "../../../lib/scoping/named.js";

declare module "../../../lib/relation.js" {
  interface RelationScopes<T extends Base> {
    replied: ScopeOn<T, Topic>;
  }
}

class TypedTopic extends Topic {
  declare static approved: ScopeMethod<TypedTopic>;
}

constSet(TopLevel, "Topic", Topic);

describe("NamedScopingTypesTest", () => {
  fixtures(["topics"]);

  it("a scope chains off a relation, not only off the model class", async () => {
    const chained: Relation<Topic> = Topic.where({ approved: true }).approved().replied();
    expect((await chained).length).toBeGreaterThanOrEqual(0);
  });

  it("a scope declared on the model class keeps the model's relation type", () => {
    const fromClass: ScopeMethod<TypedTopic> = TypedTopic.approved;
    expect(typeof fromClass).toBe("function");
  });
});
