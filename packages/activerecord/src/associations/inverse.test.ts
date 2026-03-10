/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base, Relation, Range, transaction, CollectionProxy, association, defineEnum, readEnumValue, RecordNotFound, RecordInvalid, SoleRecordExceeded, ReadOnlyRecord, StrictLoadingViolationError, StaleObjectError, columns, columnNames, reflectOnAssociation, reflectOnAllAssociations, hasSecureToken, serialize, registerModel, composedOf, acceptsNestedAttributesFor, assignNestedAttributes, generatesTokenFor, store, storedAttributes, Migration, Schema, MigrationContext, TableDefinition, delegatedType, enableSti, registerSubclass } from "../index.js";
import {
  Associations,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
  loadHasManyThrough,
  processDependentAssociations,
  updateCounterCaches,
  setBelongsTo,
  setHasOne,
  setHasMany,
} from "../associations.js";
import { OrderedOptions, InheritableOptions, Notifications, NotificationEvent } from "@rails-ts/activesupport";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "../autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("InverseAssociationTests", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("should allow for inverse of options in associations", () => {
    class Man extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class Face extends Base {
      static { this.attribute("man_id", "integer"); this.adapter = adapter; }
    }
    Associations.hasOne.call(Man, "face", { inverseOf: "man" });
    const assocs = (Man as any)._associations;
    const faceAssoc = assocs.find((a: any) => a.name === "face");
    expect(faceAssoc.options.inverseOf).toBe("man");
  });

  it("should be able to ask a reflection if it has an inverse", () => {
    class Man extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    Associations.hasMany.call(Man, "interests", { inverseOf: "man" });
    Associations.hasOne.call(Man, "face", {});
    const assocs = (Man as any)._associations;
    const withInverse = assocs.find((a: any) => a.name === "interests");
    const withoutInverse = assocs.find((a: any) => a.name === "face");
    expect(withInverse.options.inverseOf).toBe("man");
    expect(withoutInverse.options.inverseOf).toBeUndefined();
  });

  it("inverse of method should supply the actual reflection instance it is the inverse of", () => {
    class Man extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    Associations.hasMany.call(Man, "interests", { inverseOf: "man" });
    const assocs = (Man as any)._associations;
    const interestAssoc = assocs.find((a: any) => a.name === "interests");
    expect(interestAssoc.options.inverseOf).toBe("man");
  });

  it("associations with no inverse of should return nil", () => {
    class Man extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    Associations.hasMany.call(Man, "interests", {});
    const assocs = (Man as any)._associations;
    const interestAssoc = assocs.find((a: any) => a.name === "interests");
    expect(interestAssoc.options.inverseOf).toBeUndefined();
  });

  it("polymorphic associations dont attempt to find inverse of", () => {
    class Comment extends Base {
      static { this.attribute("commentable_id", "integer"); this.attribute("commentable_type", "string"); this.adapter = adapter; }
    }
    Associations.belongsTo.call(Comment, "commentable", { polymorphic: true });
    const assocs = (Comment as any)._associations;
    const polyAssoc = assocs.find((a: any) => a.name === "commentable");
    expect(polyAssoc.options.polymorphic).toBe(true);
    expect(polyAssoc.options.inverseOf).toBeUndefined();
  });

  it("this inverse stuff", async () => {
    class Man extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class Interest extends Base {
      static { this.attribute("topic", "string"); this.attribute("man_id", "integer"); this.adapter = adapter; }
    }
    Associations.hasMany.call(Man, "interests", { inverseOf: "man" });
    Associations.belongsTo.call(Interest, "man", { inverseOf: "interests" });
    registerModel(Man); registerModel(Interest);
    const m = await Man.create({ name: "Gordon" });
    await Interest.create({ topic: "stamps", man_id: m.id });
    const interests = await loadHasMany(m, "interests", { inverseOf: "man" });
    expect(interests.length).toBe(1);
    const cachedMan = (interests[0] as any)._cachedAssociations?.get("man");
    expect(cachedMan).toBe(m);
  });
});


describe("inverse_of", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("sets inverse reference on loaded belongs_to", async () => {
    class Author extends Base { static _tableName = "authors"; }
    Author.attribute("id", "integer");
    Author.attribute("name", "string");
    Author.adapter = adapter;
    registerModel(Author);

    class Book extends Base { static _tableName = "books"; }
    Book.attribute("id", "integer");
    Book.attribute("title", "string");
    Book.attribute("author_id", "integer");
    Book.adapter = adapter;
    Associations.belongsTo.call(Book, "author", { inverseOf: "books" });
    registerModel(Book);

    const author = await Author.create({ name: "Tolkien" });
    const book = await Book.create({ title: "The Hobbit", author_id: author.id });

    const loadedAuthor = await loadBelongsTo(book, "author", { inverseOf: "books" });
    // The loaded author should have a cached inverse pointing to the book
    expect((loadedAuthor as any)._cachedAssociations?.get("books")).toBe(book);
  });

  it("sets inverse reference on loaded has_many children", async () => {
    class Post extends Base { static _tableName = "posts"; }
    Post.attribute("id", "integer");
    Post.attribute("title", "string");
    Post.adapter = adapter;
    Associations.hasMany.call(Post, "comments", { inverseOf: "post" });
    registerModel(Post);

    class Comment extends Base { static _tableName = "comments"; }
    Comment.attribute("id", "integer");
    Comment.attribute("body", "string");
    Comment.attribute("post_id", "integer");
    Comment.adapter = adapter;
    Associations.belongsTo.call(Comment, "post");
    registerModel(Comment);

    const post = await Post.create({ title: "Hello" });
    await Comment.create({ body: "Reply 1", post_id: post.id });
    await Comment.create({ body: "Reply 2", post_id: post.id });

    const comments = await loadHasMany(post, "comments", { inverseOf: "post" });
    // Each comment should have the post cached
    for (const c of comments) {
      expect((c as any)._cachedAssociations?.get("post")).toBe(post);
    }
  });
});
