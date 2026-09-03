import { describe, it, expect } from "vitest";
import {
  AssociationNotFoundError,
  CompositePrimaryKeyMismatchError,
  HasManyThroughAssociationNotFoundError,
  InverseOfAssociationNotFoundError,
} from "./errors.js";

describe("AssociationErrors", () => {
  it("AssociationNotFoundError keeps the suggestion out of message but in detailedMessage", () => {
    const err = new AssociationNotFoundError(
      { constructor: { name: "Post", reflections: () => ({ tagging: {}, comments: {} }) } },
      "taggingz",
    );
    expect(err.message).toMatch(
      /Association named 'taggingz' was not found on Post; perhaps you misspelled it\?/,
    );
    expect(err.message).not.toMatch(/Did you mean/);
    expect(err.corrections).toEqual(["tagging"]);
    expect(err.detailedMessage()).toContain("Did you mean?  tagging");
  });

  it("AssociationNotFoundError.detailedMessage equals message when there are no corrections", () => {
    const err = new AssociationNotFoundError(
      { constructor: { name: "Post", reflections: () => ({}) } },
      "taggingz",
    );
    expect(err.corrections).toEqual([]);
    expect(err.detailedMessage()).toBe(err.message);
  });

  it("HasManyThroughAssociationNotFoundError exposes ownerClass and reflection", () => {
    const ownerClass = { name: "Author", reflections: () => ({ memberships: {}, posts: {} }) };
    const reflection = { name: "posts", options: { through: "membershipz" } };
    const err = new HasManyThroughAssociationNotFoundError(ownerClass, reflection);
    expect(err).toBeInstanceOf(Error);
    expect(err.ownerClass).toBe(ownerClass);
    expect(err.reflection).toBe(reflection);
    expect(err.message).toMatch(/membershipz/);
    expect(err.message).toMatch(/Author/);
    expect(err.corrections).toContain("memberships");
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

  it("CompositePrimaryKeyMismatchError uses association_primary_key for non-collection reflections", () => {
    const reflection = {
      activeRecord: "CpkBrokenBook",
      name: "order",
      associationPrimaryKey: () => ["id"],
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
