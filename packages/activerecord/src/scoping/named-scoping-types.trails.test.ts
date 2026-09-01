import { describe, it, expect } from "vitest";
import "../index.js";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";
import type { Base } from "../base.js";
import type { Relation } from "../relation.js";
import type { ScopeMethod, ScopeOn } from "./named.js";

declare module "../relation.js" {
  interface RelationScopes<T extends Base> {
    approved: ScopeOn<T, Topic>;
    replied: ScopeOn<T, Topic>;
  }
}

class TypedTopic extends Topic {
  declare static approved: ScopeMethod<TypedTopic>;
}

registerModel(Topic);

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
