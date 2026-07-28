/**
 * TS-only autosave tests with no counterpart in
 * `vendor/rails/activerecord/test/cases/autosave_association_test.rb`. They live
 * here rather than in `autosave-association.test.ts` so they don't inflate the
 * apparent test count of the Rails-named describes `test:compare` matches
 * against Rails test classes. Describe names still mirror the Rails class the
 * behavior belongs to, so a reader knows where each test's subject lives.
 */
import type { AssociationProxy } from "./associations/collection-proxy.js";
import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel, assignNestedAttributes } from "./index.js";
import { Associations } from "./associations.js";
import { Company as CanonicalCompany, Firm, Client } from "./test-helpers/models/company.js";
import { Pirate as CanonicalPirate } from "./test-helpers/models/pirate.js";
import { Bird as CanonicalBird } from "./test-helpers/models/bird.js";
import { Eye, Iris, IrisWithReadOnlyForeignKey } from "./test-helpers/models/eye.js";
import { fixtures } from "./test-fixtures.js";

function cacheAssoc(record: Base, name: string, value: unknown) {
  record.association(name).setTarget(value as any);
}

describe("TestDefaultAutosaveAssociationOnAHasOneAssociation", () => {
  fixtures([]);
  beforeAll(() => {
    registerModel(Eye);
    registerModel(Iris);
    registerModel(IrisWithReadOnlyForeignKey);
  });

  it("callbacks read a cold has_one cache", async () => {
    const created = await Eye.create({ irisAttributes: { color: "honey" } });
    const eye = await Eye.find(created.id);
    expect(eye.association("iris").isLoaded()).toBe(false);

    await eye.save();

    expect(eye.association("iris").isLoaded()).toBe(true);
    expect(eye.afterSaveCallbacksStack).toEqual([false, false]);
  });
});

describe("TestDefaultAutosaveAssociationOnAHasManyAssociation", () => {
  fixtures(["companies"]);
  beforeAll(() => {
    registerModel(CanonicalCompany);
    registerModel(Firm);
    registerModel(Client);
  });

  it("collection-proxy build without load autosaves built children (Slot B)", async () => {
    // Regression test for the proxy-build-without-load gap: building
    // through `record.<collection>.build(...)` (CollectionProxy.build,
    // no preload, no explicit load) must still surface the built record
    // to the autosave loop. Mirrors Rails: `pirate.birds.build(name:)`
    // followed by `pirate.save` persists the child. `_loadedAssociation`
    // treats non-empty `proxy.target` as cached data without flipping
    // proxy `loaded` (matches Rails' @_was_loaded ephemeral semantics).
    const firm = new Firm({ name: "Acme" });
    const built = firm.clientsOfFirm.build({ name: "ProxyBuilt" });
    expect(built.isNewRecord()).toBe(true);
    await firm.save();
    expect(firm.isNewRecord()).toBe(false);
    expect(built.isNewRecord()).toBe(false);
  });
});

describe("TestAutosaveAssociationsInGeneral", () => {
  fixtures([]);

  it("custom validation context is applied to unchanged persisted children", async () => {
    // Rails association_valid? always validates; the `|| context` guard in error
    // propagation (autosave_association.rb:384) means custom contexts fire even
    // on unchanged persisted children, unlike the default :create/:update skip.
    class Widget extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.validates("name", { presence: true, on: "publish" } as any);
      }
    }
    class WidgetOwner extends Base {
      declare name: string | null;
      declare widgets: AssociationProxy<Widget>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("widgets", { autosave: true, foreignKey: "author_id" });
      }
    }
    registerModel("Widget", Widget);
    registerModel("WidgetOwner", WidgetOwner);

    const owner = await WidgetOwner.create({ name: "Alice" });
    // Create a persisted, unchanged widget with a blank status
    const widget = await Widget.create({ name: "", author_id: owner.id });
    cacheAssoc(owner, "widgets", [widget]);

    // Default context: widget is unchanged → skipped → owner is valid
    const defaultValid = await owner.isValid();
    expect(defaultValid).toBe(true);

    // Custom context "publish": unchanged widget must be validated too, and its
    // presence validator fires → owner is invalid
    const publishValid = await owner.isValid("publish" as any);
    expect(publishValid).toBe(false);
  });

  it("default belongs_to saves new associated record and propagates the FK", async () => {
    // Rails autosave_association.rb:548-572 — `elsif autosave != false`
    // branch fires even when `autosave` is unset, so default belongs_to
    // saves a new target during owner save and writes the parent PK back
    // onto the owner's foreign key.
    class Author extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    class Post extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
      }
    }
    registerModel("DefaultBelongsToAuthor", Author);
    registerModel("DefaultBelongsToPost", Post);
    // No `autosave:` option — exercises the default-on registration path.
    Associations.belongsTo.call(Post, "author", {
      foreignKey: "author_id",
      className: "DefaultBelongsToAuthor",
    });

    const author = new Author({ name: "New Author" });
    const post = new Post({ name: "Default autosave" });
    cacheAssoc(post, "author", author);
    await post.save();
    expect(author.isNewRecord()).toBe(false);
    expect(post.author_id).toBe(author.id);
  });

  it("belongs_to autosave with mismatched composite FK/PK uses zip semantics", async () => {
    // Rails autosave_association.rb:563 — `primary_key.zip(foreign_key)`.
    // When the FK array is longer than the PK array, Ruby Array#zip
    // drops the extra FK entries; the loop only writes the positions
    // where both sides exist. No CompositePrimaryKeyMismatchError.
    class Parent extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    class Child extends Base {
      declare parent_id: number | null;
      declare group: string | null;
      declare title: string | null;

      static {
        this._tableName = "topics";
        this.attribute("parent_id", "integer");
        this.attribute("group", "string");
        this.attribute("title", "string");
      }
    }
    registerModel("ZipParent", Parent);
    registerModel("ZipChild", Child);
    // PK ["id"] (scalar) zipped against FK ["parent_id", "group"] →
    // pairs [("id", "parent_id")]; the trailing "group" FK is dropped.
    Associations.belongsTo.call(Child, "parent", {
      primaryKey: "id",
      foreignKey: ["parent_id", "group"],
      className: "ZipParent",
      autosave: true,
    });

    const parent = new Parent({ name: "P" });
    const child = new Child({ title: "c", group: "us-west" });
    cacheAssoc(child, "parent", parent);
    await child.save();
    expect(parent.isNewRecord()).toBe(false);
    expect(child.parent_id).toBe(parent.id);
    // Trailing FK "group" was dropped from the zip; the existing
    // owner value must survive untouched (no overwrite to undefined/null).
    expect(child.group).toBe("us-west");
  });

  it("default belongs_to runs validations on the new target via validate: !autosave", async () => {
    // Rails autosave_association.rb:553 — `record.save(validate: !autosave)`.
    // With autosave unset, `!autosave` is truthy → the target's validations
    // run during owner save. A failing validation makes record.save return
    // false; Rails' `saved if autosave` clamps the return to nil for the
    // default branch, so the lambda doesn't `throw(:abort)` and the owner
    // save still succeeds — the child simply remains unpersisted.
    class Author extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    class Post extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
      }
    }
    registerModel("DefaultAutosaveAuthor", Author);
    registerModel("DefaultAutosavePost", Post);
    Associations.belongsTo.call(Post, "author", {
      foreignKey: "author_id",
      className: "DefaultAutosaveAuthor",
    });

    const author = new Author({}); // name missing — validation fails
    const post = new Post({ name: "ok" });
    cacheAssoc(post, "author", author);
    const saved = await post.save();
    // Owner save succeeds — default branch swallows child failure.
    expect(saved).toBe(true);
    expect(post.isNewRecord()).toBe(false);
    // Child remained unsaved because record.save(validate: true) failed.
    expect(author.isNewRecord()).toBe(true);
    // Owner.errors stays clean — propagateErrors is gated on autosave.
    expect(post.errors.size).toBe(0);
  });

  it("belongs_to autosave with PK longer than FK skips trailing PK positions", async () => {
    // Rails autosave_association.rb:563 — `primary_key.zip(foreign_key)`.
    // When PK is longer, the trailing pairs have `foreign_key = nil`;
    // Ruby's `self[nil] = id` would raise — our impl skips the nil-FK
    // partner so a misconfigured pair doesn't blow up the owner save.
    class Parent extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    class Child extends Base {
      declare author_id: number | null;
      declare name: string | null;

      static {
        this._tableName = "books";
        this.attribute("author_id", "integer");
        this.attribute("name", "string");
      }
    }
    registerModel("LongPkParent", Parent);
    registerModel("LongPkChild", Child);
    // Explicit composite PK ["id", "name"] zipped against scalar FK
    // ["author_id"] → only ("id", "author_id") pairs; ("name", nil) drops.
    Associations.belongsTo.call(Child, "parent", {
      primaryKey: ["id", "name"],
      foreignKey: "author_id",
      className: "LongPkParent",
      autosave: true,
    });

    const parent = new Parent({ name: "P" });
    const child = new Child({ name: "c" });
    cacheAssoc(child, "parent", parent);
    await child.save();
    expect(parent.isNewRecord()).toBe(false);
    expect(child.author_id).toBe(parent.id);
    // The dropped ("name", nil) pair didn't attempt to write — no throw,
    // no spurious column write.
  });
});

describe("TestDefaultAutosaveAssociationOnAHasManyAssociationWithAcceptsNestedAttributes", () => {
  fixtures([]);

  function makeModels() {
    registerModel(CanonicalPirate);
    registerModel(CanonicalBird);
    return { Pirate: CanonicalPirate, Bird: CanonicalBird };
  }

  it("errors details should be set for invalid nested", async () => {
    const { Pirate, Bird } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const invalidBird = new Bird({ name: "" });
    pirate.association("birds").setTarget([invalidBird] as any);
    const saved = await pirate.save();
    expect(saved).toBe(false);
  });

  it("valid nested attributes create children", async () => {
    const { Pirate, Bird } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    assignNestedAttributes(pirate, "birds", [{ name: "Polly" }]);
    await pirate.save();
    const birds = await Bird.where({ pirate_id: pirate.id });
    expect(birds.length).toBe(1);
  });
});
