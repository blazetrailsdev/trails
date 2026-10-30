import { types } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Relation } from "../relation.js";

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

  it("sits in the prototype chain, so the relation itself is not a Proxy and still reaches its misses", async () => {
    const relation = Post.where({ id: 1 });
    expect(types.isProxy(relation)).toBe(false);
    expect(types.isProxy(relation.limit(1))).toBe(false);
    const first = await (relation as unknown as Record<number, Promise<Post>>)[0];
    expect(first.id).toBe(1);
  });

  it("leaves a plain Relation's miss undefined, with no delegation to the model", () => {
    const spy = vi.spyOn(Post, "generateRelationMethod");
    try {
      const plain = new Relation(Post) as unknown as Record<string, unknown>;
      expect(plain.containingTheLetterA).toBeUndefined();
      expect(plain.noSuchThingAtAll).toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
      plain._plainProbe = 1;
      expect(plain._plainProbe).toBe(1);
      expect(Object.hasOwn(plain, "_plainProbe")).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("seats a non-configurable undefined placeholder for a field a relation first writes", () => {
    const relation = Post.all() as unknown as Record<string, unknown>;
    relation._seatProbe = 1;
    expect(Object.getOwnPropertyDescriptor(Relation.prototype, "_seatProbe")).toEqual({
      value: undefined,
      writable: true,
      enumerable: false,
      configurable: false,
    });
    const other = Post.all() as unknown as Record<string, unknown>;
    expect(other._seatProbe).toBeUndefined();
    other._seatProbe = 2;
    expect(Object.hasOwn(other, "_seatProbe")).toBe(true);
    expect(relation._seatProbe).toBe(1);
  });

  it("answers Symbol.iterator only once the records are loaded", async () => {
    const relation = Post.where({ id: [1, 2] });
    expect(Symbol.iterator in relation).toBe(false);
    expect((relation as unknown as Iterable<Post>)[Symbol.iterator]).toBeUndefined();
    await relation.load();
    expect(Symbol.iterator in relation).toBe(false);
    expect(Array.from(relation as unknown as Iterable<Post>).map((post) => post.id)).toEqual([
      1, 2,
    ]);
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

  it("copies a field without a leading underscore without running a prototype setter", () => {
    const relation = Post.where({ id: 1 }) as unknown as Record<string, unknown>;
    relation.annotation = "kept";
    const proto = Object.getPrototypeOf(relation) as object;
    const calls: unknown[] = [];
    Object.defineProperty(proto, "annotation", {
      configurable: true,
      get() {
        return "proto";
      },
      set(value: unknown) {
        calls.push(value);
      },
    });
    try {
      const copy = (relation as unknown as Relation<Post>).clone() as unknown as Record<
        string,
        unknown
      >;
      expect(calls).toEqual([]);
      expect(Object.getOwnPropertyDescriptor(copy, "annotation")?.value).toBe("kept");
    } finally {
      Reflect.deleteProperty(proto, "annotation");
    }
  });
});
