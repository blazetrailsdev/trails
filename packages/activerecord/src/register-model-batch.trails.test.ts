import { describe, it, expect } from "vitest";
import { registerModel, modelRegistry } from "./associations.js";
import { constantize } from "@blazetrails/activesupport";
import { Base } from "./base.js";
import { Author } from "./test-helpers/models/author.js";
import { Comment, SpecialComment, SubSpecialComment } from "./test-helpers/models/comment.js";

describe("registerModel array form", () => {
  it("registers every class in the array, resolvable by name", () => {
    registerModel([Author, Comment, SpecialComment, SubSpecialComment]);

    expect(constantize("Author")).toBe(Author);
    expect(modelRegistry.get("Comment")).toBe(Comment);
    expect(modelRegistry.get("SpecialComment")).toBe(SpecialComment);
    expect(modelRegistry.get("SubSpecialComment")).toBe(SubSpecialComment);
  });

  it("auto-routes STI subclasses into the parent's _subclasses", () => {
    registerModel([Comment, SpecialComment, SubSpecialComment]);

    expect((Comment as any)._subclasses).toContain(SpecialComment);
    expect((SpecialComment as any)._subclasses).toContain(SubSpecialComment);
  });

  it("registers each subclass at most once (idempotent, like Rails)", () => {
    registerModel([Comment, SpecialComment, SubSpecialComment]);
    registerModel([Comment, SpecialComment, SubSpecialComment]);

    const commentSubs = ((Comment as any)._subclasses ?? []) as unknown[];
    expect(commentSubs.filter((s) => s === SpecialComment)).toHaveLength(1);
  });

  it("does not treat a base model as a subclass", () => {
    registerModel([Author]);

    expect((Author as any)._subclasses ?? []).not.toContain(Author);
  });

  it("routes a freshly-defined subclass via the array form only", () => {
    class BatchBase extends Base {}
    class BatchChild extends BatchBase {}
    class BatchGrandchild extends BatchChild {}

    registerModel([BatchBase, BatchChild, BatchGrandchild]);

    expect((BatchBase as any)._subclasses ?? []).not.toContain(BatchBase);
    expect((BatchBase as any)._subclasses).toContain(BatchChild);
    expect((BatchChild as any)._subclasses).toContain(BatchGrandchild);
    expect(constantize("BatchGrandchild")).toBe(BatchGrandchild);
  });

  it("keeps the single-class and (name, model) forms working", () => {
    registerModel(Author);
    expect(constantize("Author")).toBe(Author);

    registerModel("AuthorAlias", Author);
    expect(constantize("AuthorAlias")).toBe(Author);
  });
});
