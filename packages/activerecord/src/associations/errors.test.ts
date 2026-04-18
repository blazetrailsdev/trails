import { describe, it, expect } from "vitest";
import {
  HasManyThroughAssociationNotFoundError,
  InverseOfAssociationNotFoundError,
} from "./errors.js";

describe("AssociationErrors", () => {
  it("HasManyThroughAssociationNotFoundError exposes ownerClass and reflection", () => {
    // Rails parity: activerecord/lib/active_record/associations/errors.rb
    // HasManyThroughAssociationNotFoundError has `attr_reader :owner_class,
    // :reflection`. The reflection attr identifies the failing has_many
    // :through association itself (not its :through target).
    const err = new HasManyThroughAssociationNotFoundError("Author", "memberships", "posts");
    expect(err).toBeInstanceOf(Error);
    expect(err.ownerClass).toBe("Author");
    expect(err.reflection).toBe("posts");
    expect(err.message).toMatch(/memberships/);
    expect(err.message).toMatch(/Author/);
  });

  it("HasManyThroughAssociationNotFoundError reflection defaults to through when unspecified", () => {
    // Back-compat: callers that don't pass a reflection get the through
    // name (matches the pre-reader behavior of the error).
    const err = new HasManyThroughAssociationNotFoundError("Author", "memberships");
    expect(err.reflection).toBe("memberships");
  });

  it("InverseOfAssociationNotFoundError exposes associatedClass when provided", () => {
    // Rails parity: errors.rb InverseOfAssociationNotFoundError has
    // `attr_reader :reflection, :associated_class`.
    const err = new InverseOfAssociationNotFoundError("posts", "author", [], "User");
    expect(err.associatedClass).toBe("User");
  });

  it("InverseOfAssociationNotFoundError.associatedClass defaults to null", () => {
    const err = new InverseOfAssociationNotFoundError("posts", "author");
    expect(err.associatedClass).toBeNull();
  });
});
