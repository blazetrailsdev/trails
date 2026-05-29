import { describe, it, expect } from "vitest";
import {
  AssociationNotFoundError,
  HasManyThroughAssociationNotFoundError,
  InverseOfAssociationNotFoundError,
} from "./errors.js";
import { _associationNotFound } from "../associations.js";

describe("AssociationErrors", () => {
  it("AssociationNotFoundError keeps the suggestion out of message but in detailedMessage", () => {
    // Rails parity: errors.rb AssociationNotFoundError includes
    // DidYouMean::Correctable, so corrections surface only via
    // `detailed_message`, not the bare `message`.
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
    // Mirrors Rails AssociationNotFoundError#corrections, which feeds
    // `record.class.reflections.keys` into DidYouMean::SpellChecker.
    const record = {
      constructor: { _associations: [{ name: "tagging" }, { name: "comments" }] },
    } as any;
    const err = _associationNotFound(record, "taggingz");
    expect(err).toBeInstanceOf(AssociationNotFoundError);
    expect(err.corrections).toContain("tagging");
    expect(err.detailedMessage()).toContain("Did you mean?  tagging");
  });

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
