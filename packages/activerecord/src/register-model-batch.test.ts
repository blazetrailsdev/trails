import { describe, it, expect } from "vitest";
import { registerModel, modelRegistry, resolveModel } from "./associations.js";
import { Base } from "./base.js";
import { Author } from "./test-helpers/models/author.js";
import { Comment, SpecialComment, SubSpecialComment } from "./test-helpers/models/comment.js";

describe("registerModel array form", () => {
  it("registers every class in the array, resolvable by name", () => {
    registerModel([Author, Comment, SpecialComment, SubSpecialComment]);

    expect(resolveModel("Author")).toBe(Author);
    expect(modelRegistry.get("Comment")).toBe(Comment);
    expect(modelRegistry.get("SpecialComment")).toBe(SpecialComment);
    expect(modelRegistry.get("SubSpecialComment")).toBe(SubSpecialComment);
  });

  it("auto-routes STI subclasses into the parent's _subclasses", () => {
    registerModel([Comment, SpecialComment, SubSpecialComment]);

    // SpecialComment's prototype is Comment (an AR model) → it's a subclass.
    expect((Comment as any)._subclasses).toContain(SpecialComment);
    // SubSpecialComment's prototype is SpecialComment → subclass of it.
    expect((SpecialComment as any)._subclasses).toContain(SubSpecialComment);
  });

  it("registers each subclass at most once (idempotent, like Rails)", () => {
    // Canonical model files self-register their subclasses at import, so the
    // array form routes already-registered subclasses again — that must not
    // produce duplicates in the parent's _subclasses.
    registerModel([Comment, SpecialComment, SubSpecialComment]);
    registerModel([Comment, SpecialComment, SubSpecialComment]);

    const commentSubs = ((Comment as any)._subclasses ?? []) as unknown[];
    expect(commentSubs.filter((s) => s === SpecialComment)).toHaveLength(1);
  });

  it("does not treat a base model as a subclass", () => {
    registerModel([Author]);

    // Author extends Base directly, so it must never be pushed onto a
    // parent's _subclasses list.
    expect((Author as any)._subclasses ?? []).not.toContain(Author);
  });

  it("routes a freshly-defined subclass via the array form only", () => {
    // Fresh classes that nothing has pre-registered, so _subclasses growth
    // can only come from the array form's auto-routing.
    class BatchBase extends Base {}
    class BatchChild extends BatchBase {}
    class BatchGrandchild extends BatchChild {}

    registerModel([BatchBase, BatchChild, BatchGrandchild]);

    expect((BatchBase as any)._subclasses ?? []).not.toContain(BatchBase);
    expect((BatchBase as any)._subclasses).toContain(BatchChild);
    expect((BatchChild as any)._subclasses).toContain(BatchGrandchild);
    expect(resolveModel("BatchGrandchild")).toBe(BatchGrandchild);
  });

  it("keeps the single-class and (name, model) forms working", () => {
    registerModel(Author);
    expect(resolveModel("Author")).toBe(Author);

    registerModel("AuthorAlias", Author);
    expect(resolveModel("AuthorAlias")).toBe(Author);
  });
});
