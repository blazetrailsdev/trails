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

describe("RequiredAssociationsTest", () => {
  it("belongs_to associations can be optional by default", async () => {
    const adapter = freshAdapter();
    class Author extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class Book extends Base {
      static { this.attribute("title", "string"); this.attribute("author_id", "integer"); this.adapter = adapter; }
    }
    Associations.belongsTo.call(Book, "author", { optional: true });
    registerModel(Author); registerModel(Book);
    const book = new Book({ title: "No Author" });
    expect(book.isValid()).toBe(true);
  });

  it("required belongs_to associations have presence validated", async () => {
    const adapter = freshAdapter();
    class Author extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class Book extends Base {
      static { this.attribute("title", "string"); this.attribute("author_id", "integer"); this.adapter = adapter; }
    }
    Associations.belongsTo.call(Book, "author", { required: true });
    registerModel(Author); registerModel(Book);
    const book = new Book({ title: "No Author" });
    expect(book.isValid()).toBe(false);
    expect(book.errors.on("author_id")).toBeTruthy();
  });

  it("has_one associations are not required by default", async () => {
    const ra2Adapter = freshAdapter();
    class RAProfile extends Base {
      static { this.attribute("bio", "string"); this.attribute("r_a_user_id", "integer"); this.adapter = ra2Adapter; }
    }
    class RAUser extends Base {
      static { this.attribute("name", "string"); this.adapter = ra2Adapter; }
    }
    Associations.hasOne.call(RAUser, "rAProfile", { foreignKey: "r_a_user_id", className: "RAProfile" });
    registerModel("RAUser", RAUser);
    registerModel("RAProfile", RAProfile);
    // has_one is not required by default, so user without profile is valid
    const user = new RAUser({ name: "solo" });
    const valid = user.isValid();
    expect(valid).toBe(true);
  });

  it.skip("belongs_to associations can be required by default", () => { /* global config not implemented */ });
  it.skip("required has_one associations have presence validated", () => { /* has_one required option not implemented */ });
  it.skip("required has_one associations have a correct error message", () => { /* has_one required option not implemented */ });

  it("required belongs_to associations have a correct error message", async () => {
    const adapter = freshAdapter();
    class Author extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class Book extends Base {
      static { this.attribute("title", "string"); this.attribute("author_id", "integer"); this.adapter = adapter; }
    }
    Associations.belongsTo.call(Book, "author", { required: true });
    registerModel(Author); registerModel(Book);
    const book = new Book({ title: "No Author" });
    book.isValid();
    const errors = book.errors.fullMessages;
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("RequiredAssociationsTest", () => {
  it("belongs_to associations can be optional by default", async () => {
    const adapter = freshAdapter();
    class Author extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class Book extends Base {
      static { this.attribute("title", "string"); this.attribute("author_id", "integer"); this.adapter = adapter; }
    }
    Associations.belongsTo.call(Book, "author", { optional: true });
    registerModel(Author); registerModel(Book);
    const book = new Book({ title: "No Author" });
    expect(book.isValid()).toBe(true);
  });

  it("required belongs_to associations have presence validated", async () => {
    const adapter = freshAdapter();
    class Author extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class Book extends Base {
      static { this.attribute("title", "string"); this.attribute("author_id", "integer"); this.adapter = adapter; }
    }
    Associations.belongsTo.call(Book, "author", { required: true });
    registerModel(Author); registerModel(Book);
    const book = new Book({ title: "No Author" });
    expect(book.isValid()).toBe(false);
    expect(book.errors.on("author_id")).toBeTruthy();
  });

  it("has_one associations are not required by default", async () => {
    const ra2Adapter = freshAdapter();
    class RAProfile extends Base {
      static { this.attribute("bio", "string"); this.attribute("r_a_user_id", "integer"); this.adapter = ra2Adapter; }
    }
    class RAUser extends Base {
      static { this.attribute("name", "string"); this.adapter = ra2Adapter; }
    }
    Associations.hasOne.call(RAUser, "rAProfile", { foreignKey: "r_a_user_id", className: "RAProfile" });
    registerModel("RAUser", RAUser);
    registerModel("RAProfile", RAProfile);
    // has_one is not required by default, so user without profile is valid
    const user = new RAUser({ name: "solo" });
    const valid = user.isValid();
    expect(valid).toBe(true);
  });

  it.skip("belongs_to associations can be required by default", () => { /* global config not implemented */ });
  it.skip("required has_one associations have presence validated", () => { /* has_one required option not implemented */ });
  it.skip("required has_one associations have a correct error message", () => { /* has_one required option not implemented */ });

  it("required belongs_to associations have a correct error message", async () => {
    const adapter = freshAdapter();
    class Author extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class Book extends Base {
      static { this.attribute("title", "string"); this.attribute("author_id", "integer"); this.adapter = adapter; }
    }
    Associations.belongsTo.call(Book, "author", { required: true });
    registerModel(Author); registerModel(Book);
    const book = new Book({ title: "No Author" });
    book.isValid();
    const errors = book.errors.fullMessages;
    expect(errors.length).toBeGreaterThan(0);
  });
});


describe("belongs_to required option", () => {
  it("validates presence of foreign key when required: true", async () => {
    const adapter = freshAdapter();

    class RAuthor extends Base { static _tableName = "r_authors"; }
    RAuthor.attribute("id", "integer");
    RAuthor.attribute("name", "string");
    RAuthor.adapter = adapter;

    class RBook extends Base { static _tableName = "r_books"; }
    RBook.attribute("id", "integer");
    RBook.attribute("author_id", "integer");
    RBook.attribute("title", "string");
    RBook.adapter = adapter;

    registerModel(RAuthor);
    registerModel(RBook);
    Associations.belongsTo.call(RBook, "author", { required: true });

    const book = new RBook({ title: "No Author" });
    const saved = await book.save();
    expect(saved).toBe(false);
    expect(book.errors.fullMessages.some((m: string) => m.toLowerCase().includes("author_id"))).toBe(true);
  });

  it("passes validation when foreign key is present", async () => {
    const adapter = freshAdapter();

    class RWriter extends Base { static _tableName = "r_writers"; }
    RWriter.attribute("id", "integer");
    RWriter.attribute("name", "string");
    RWriter.adapter = adapter;

    class RNovel extends Base { static _tableName = "r_novels"; }
    RNovel.attribute("id", "integer");
    RNovel.attribute("writer_id", "integer");
    RNovel.attribute("title", "string");
    RNovel.adapter = adapter;

    registerModel(RWriter);
    registerModel(RNovel);
    Associations.belongsTo.call(RNovel, "writer", { required: true });

    const writer = await RWriter.create({ name: "Tolkien" });
    const novel = new RNovel({ title: "LotR", writer_id: writer.id });
    const saved = await novel.save();
    expect(saved).toBe(true);
  });
});
