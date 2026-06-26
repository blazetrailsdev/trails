import { describe, expect, test } from "vitest";
import { resolveThroughTarget, type ModelAssociationLookup } from "./resolve-target.js";
import type { AssociationCall, AssociationKind, RecordLiteral } from "./walker.js";

function assoc(kind: AssociationKind, name: string, options: RecordLiteral = {}): AssociationCall {
  return { kind, name, options };
}

function lookupFrom(models: Record<string, AssociationCall[]>): ModelAssociationLookup {
  return (name) => models[name];
}

describe("resolveThroughTarget", () => {
  test("follows through→source into another model (explicit source)", () => {
    // Author has_many :commentsWithOrder, through: :posts, source: :comments → Comment
    const author = [
      assoc("hasMany", "posts"),
      assoc("hasMany", "commentsWithOrder", { through: '"posts"', source: '"comments"' }),
    ];
    const lookup = lookupFrom({ Post: [assoc("hasMany", "comments")] });
    expect(resolveThroughTarget(author, author[1], lookup)).toBe("Comment");
  });

  test("defaults the source to the singularized then plural association name", () => {
    // Author has_many :comments, through: :posts  (source defaults to :comment / :comments)
    const author = [
      assoc("hasMany", "posts"),
      assoc("hasMany", "comments", { through: '"posts"' }),
    ];
    const lookup = lookupFrom({ Post: [assoc("hasMany", "comments")] });
    expect(resolveThroughTarget(author, author[1], lookup)).toBe("Comment");
  });

  test("resolves a nested through (a through whose through is itself a through)", () => {
    // Author has_many :members, through: :commentsWithOrder (itself through :posts → Comment)
    const author = [
      assoc("hasMany", "posts"),
      assoc("hasMany", "commentsWithOrder", { through: '"posts"', source: '"comments"' }),
      assoc("hasMany", "members", { through: '"commentsWithOrder"', source: '"member"' }),
    ];
    const lookup = lookupFrom({
      Post: [assoc("hasMany", "comments")],
      Comment: [assoc("hasMany", "member", { className: '"Member"' })],
    });
    expect(resolveThroughTarget(author, author[2], lookup)).toBe("Member");
  });

  test("falls back to Base when the source reflection is polymorphic", () => {
    const author = [
      assoc("hasMany", "posts"),
      assoc("hasMany", "recentResponses", { through: '"posts"', source: '"origin"' }),
    ];
    const lookup = lookupFrom({ Post: [assoc("belongsTo", "origin", { polymorphic: "true" })] });
    expect(resolveThroughTarget(author, author[1], lookup)).toBe("Base");
  });

  test("uses source_type to type a polymorphic-source through (Rails derive_class_name)", () => {
    const author = [
      assoc("hasMany", "comments"),
      assoc("hasMany", "members", {
        through: '"comments"',
        source: '"origin"',
        sourceType: '"Member"',
      }),
    ];
    const lookup = lookupFrom({ Comment: [assoc("belongsTo", "origin", { polymorphic: "true" })] });
    expect(resolveThroughTarget(author, author[1], lookup)).toBe("Member");
  });

  test("returns undefined for a non-through, or an unresolvable through, association", () => {
    const plain = assoc("hasMany", "comments");
    expect(resolveThroughTarget([plain], plain, () => undefined)).toBeUndefined();
    const orphan = assoc("hasMany", "comments", { through: '"posts"' });
    expect(resolveThroughTarget([orphan], orphan, () => undefined)).toBeUndefined();
  });
});
