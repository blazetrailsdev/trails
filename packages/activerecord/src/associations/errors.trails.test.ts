import { describe, it, expect } from "vitest";
import {
  AssociationNotFoundError,
  CompositePrimaryKeyMismatchError,
  HasManyThroughAssociationNotFoundError,
  InverseOfAssociationNotFoundError,
} from "./errors.js";
import { _associationNotFound } from "../associations.js";

describe("AssociationErrors", () => {
  it("AssociationNotFoundError keeps the suggestion out of message but in detailedMessage", () => {
    const err = new AssociationNotFoundError({ constructor: { name: "Post" } }, "taggingz", [
      "tagging",
    ]);
    expect(err.message).toMatch(
      /Association named 'taggingz' was not found on Post; perhaps you misspelled it\?/,
    );
    expect(err.message).not.toMatch(/Did you mean/);
    expect(err.corrections).toEqual(["tagging"]);
    expect(err.detailedMessage()).toContain("Did you mean?  tagging");
  });

  it("AssociationNotFoundError.detailedMessage equals message when there are no corrections", () => {
    const err = new AssociationNotFoundError({ constructor: { name: "Post" } }, "taggingz");
    expect(err.corrections).toEqual([]);
    expect(err.detailedMessage()).toBe(err.message);
  });

  it("_associationNotFound spell-checks the name against declared association names", () => {
    const record = {
      constructor: {
        _reflections: { tagging: { name: "tagging" }, comments: { name: "comments" } },
      },
    } as any;
    const err = _associationNotFound(record, "taggingz");
    expect(err).toBeInstanceOf(AssociationNotFoundError);
    expect(err.corrections).toContain("tagging");
    expect(err.detailedMessage()).toContain("Did you mean?  tagging");
  });

  it("HasManyThroughAssociationNotFoundError exposes ownerClass and reflection", () => {
    const err = new HasManyThroughAssociationNotFoundError("Author", "memberships", "posts");
    expect(err).toBeInstanceOf(Error);
    expect(err.ownerClass).toBe("Author");
    expect(err.reflection).toBe("posts");
    expect(err.message).toMatch(/memberships/);
    expect(err.message).toMatch(/Author/);
  });

  it("HasManyThroughAssociationNotFoundError reflection defaults to through when unspecified", () => {
    const err = new HasManyThroughAssociationNotFoundError("Author", "memberships");
    expect(err.reflection).toBe("memberships");
  });

  it("InverseOfAssociationNotFoundError exposes associatedClass when provided", () => {
    const user = { name: "User", reflections: () => ({}) };
    const err = new InverseOfAssociationNotFoundError(
      { name: "posts", options: { inverseOf: "author" }, className: "Post", klass: user },
      user,
    );
    expect(err.associatedClass).toBe(user);
  });

  it("InverseOfAssociationNotFoundError.associatedClass defaults to null", () => {
    const err = new InverseOfAssociationNotFoundError();
    expect(err.associatedClass).toBeNull();
  });

  it("CompositePrimaryKeyMismatchError derives its message from the reflection but leaves reflection nil", () => {
    const reflection = {
      activeRecord: { name: "CpkBrokenBook" },
      name: "order",
      belongsTo: () => true,
      associationPrimaryKey: () => ["shop_id", "status"],
      activeRecordPrimaryKey: "id",
      foreignKey: "order_id",
    };
    const err = new CompositePrimaryKeyMismatchError(reflection);
    expect(err.reflection).toBeNull();
    expect(err.message).toBe(
      `Association CpkBrokenBook#order primary key ["shop_id", "status"] doesn't match with foreign key order_id. Please specify query_constraints, or primary_key and foreign_key values.`,
    );
  });

  it("CompositePrimaryKeyMismatchError uses active_record_primary_key for collection/has_one reflections", () => {
    const reflection = {
      activeRecord: { name: "CpkBrokenOrder" },
      name: "books",
      isCollection: () => true,
      activeRecordPrimaryKey: ["shop_id", "status"],
      associationPrimaryKey: () => "id",
      foreignKey: "cpk_broken_order_id",
    };
    const err = new CompositePrimaryKeyMismatchError(reflection);
    expect(err.message).toBe(
      `Association CpkBrokenOrder#books primary key ["shop_id", "status"] doesn't match with foreign key cpk_broken_order_id. Please specify query_constraints, or primary_key and foreign_key values.`,
    );
  });

  it("CompositePrimaryKeyMismatchError accepts a pre-resolved primaryKey for reflection-less guards", () => {
    const reflection = {
      activeRecord: "CpkBrokenBook",
      name: "order",
      primaryKey: ["id"],
      foreignKey: ["shop_id", "order_id"],
    };
    const err = new CompositePrimaryKeyMismatchError(reflection);
    expect(err.message).toBe(
      `Association CpkBrokenBook#order primary key ["id"] doesn't match with foreign key ["shop_id", "order_id"]. Please specify query_constraints, or primary_key and foreign_key values.`,
    );
  });

  it("CompositePrimaryKeyMismatchError falls back to the generic message and null reflection", () => {
    const err = new CompositePrimaryKeyMismatchError();
    expect(err.reflection).toBeNull();
    expect(err.message).toBe("Association primary key doesn't match with foreign key.");
  });
});
