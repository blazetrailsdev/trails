import { describe, expect, it } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { Post } from "../test-helpers/models/post.js";

registerModel([Post]);

describe("Relation#clone on a class-specific relation", () => {
  fixtures(["posts"]);

  it("dispatches initializeClone before initializeCopy, as Object#clone does", () => {
    const relation = Post.where({ id: 1 });
    const proto = Object.getPrototypeOf(relation) as { initializeClone?: unknown };
    const seen: unknown[] = [];
    proto.initializeClone = function (
      this: { initializeCopy(o: unknown): unknown },
      orig: unknown,
    ) {
      seen.push(orig);
      return this.initializeCopy(orig);
    };
    try {
      const copy = relation.limit(1);
      expect(seen).toHaveLength(1);
      expect(copy).not.toBe(relation);
    } finally {
      delete proto.initializeClone;
    }
  });
});

describe("a class-specific relation's Proxy", () => {
  fixtures(["posts"]);

  it("runs a setter supplied through extending with the relation as its receiver", () => {
    const receivers: unknown[] = [];
    const relation = Post.all().extending({
      set seenBy(_value: unknown) {
        receivers.push(this);
      },
    });
    (relation as unknown as { seenBy: unknown }).seenBy = 1;
    expect(receivers).toHaveLength(1);
    expect(receivers[0]).toBe(relation);
  });
});

describe("Relation#clone copying fields", () => {
  fixtures(["posts"]);

  it("copies a field a prototype accessor shadows after an earlier clone, without running it", () => {
    const relation = Post.where({ id: 1 });
    relation.limit(1);
    const proto = Object.getPrototypeOf(relation) as object;
    const calls: unknown[] = [];
    Object.defineProperty(proto, "_delegateToModel", {
      configurable: true,
      get() {
        return false;
      },
      set(value: unknown) {
        calls.push(value);
      },
    });
    try {
      const copy = relation.limit(2);
      expect(calls).toEqual([]);
      expect(Object.hasOwn(copy, "_delegateToModel")).toBe(true);
    } finally {
      Reflect.deleteProperty(proto, "_delegateToModel");
    }
  });
});
