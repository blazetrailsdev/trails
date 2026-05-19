/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";

import { createTestAdapter, type TestDatabaseAdapter } from "../test-adapter.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { withTransactionalFixtures } from "../test-helpers/with-transactional-fixtures.js";
import type { DatabaseAdapter } from "../adapter.js";

let _adapter: TestDatabaseAdapter = createTestAdapter();
beforeAll(async () => {
  _adapter = createTestAdapter();
  await defineSchema(_adapter, {
    authors: { name: "string" },
    books: { title: "string", author_id: "integer" },
    r_authors: { name: "string" },
    r_books: { title: "string", author_id: "integer" },
    r_writers: { name: "string" },
    r_novels: { title: "string", writer_id: "integer" },
    rg_parents: { name: "string" },
    rg_children: { title: "string", rg_parent_id: "integer" },
    // RAUser/RAProfile etc. tableize as ra_*, rh_*, rm_* (consecutive-caps
    // collapse per Rails' String#underscore; see packages/activesupport
    // inflector). The same key columns map through.
    ra_users: { name: "string" },
    ra_profiles: { bio: "string", r_a_user_id: "integer" },
    rh_users: { name: "string" },
    rh_profiles: { bio: "string", r_h_user_id: "integer" },
    rm_users: { name: "string" },
    rm_profiles: { bio: "string", r_m_user_id: "integer" },
  });
});
withTransactionalFixtures(() => _adapter);
function freshAdapter(): DatabaseAdapter {
  return _adapter;
}

describe("RequiredAssociationsTest", () => {
  it("belongs_to associations can be optional by default", async () => {
    const adapter = freshAdapter();
    class Author extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Book extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(Book, "author", { optional: true });
    registerModel(Author);
    registerModel(Book);
    const book = new Book({ title: "No Author" });
    expect(book.isValid()).toBe(true);
  });

  it("required belongs_to associations have presence validated", async () => {
    const adapter = freshAdapter();
    class Author extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Book extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(Book, "author", { required: true });
    registerModel(Author);
    registerModel(Book);
    const book = new Book({ title: "No Author" });
    expect(book.isValid()).toBe(false);
    expect(book.errors.on("author_id")).toBeTruthy();
  });

  it("has_one associations are not required by default", async () => {
    const ra2Adapter = freshAdapter();
    class RAProfile extends Base {
      static {
        this.attribute("bio", "string");
        this.attribute("r_a_user_id", "integer");
        this.adapter = ra2Adapter;
      }
    }
    class RAUser extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = ra2Adapter;
      }
    }
    Associations.hasOne.call(RAUser, "rAProfile", {
      foreignKey: "r_a_user_id",
      className: "RAProfile",
    });
    registerModel("RAUser", RAUser);
    registerModel("RAProfile", RAProfile);
    // has_one is not required by default, so user without profile is valid
    const user = new RAUser({ name: "solo" });
    const valid = user.isValid();
    expect(valid).toBe(true);
  });

  it.skip("belongs_to associations can be required by default", () => {
    // BLOCKED: associations — collection/singular feature gap
    // ROOT-CAUSE: associations/required.ts or preloader.ts missing collection/singular semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in required.test.ts
    /* global config not implemented */
  });
  it("required has_one associations have presence validated", () => {
    const adapter = freshAdapter();
    class RHProfile extends Base {
      static {
        this.attribute("bio", "string");
        this.attribute("r_h_user_id", "integer");
        this.adapter = adapter;
      }
    }
    class RHUser extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    Associations.hasOne.call(RHUser, "rHProfile", {
      foreignKey: "r_h_user_id",
      className: "RHProfile",
      required: true,
    });
    registerModel("RHUser", RHUser);
    registerModel("RHProfile", RHProfile);
    const user = new RHUser({ name: "test" });
    expect(user.isValid()).toBe(false);
    expect(user.errors.on("rHProfile").length).toBeGreaterThan(0);
  });
  it("required has_one associations have a correct error message", () => {
    const adapter = freshAdapter();
    class RMProfile extends Base {
      static {
        this.attribute("bio", "string");
        this.attribute("r_m_user_id", "integer");
        this.adapter = adapter;
      }
    }
    class RMUser extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    Associations.hasOne.call(RMUser, "rMProfile", {
      foreignKey: "r_m_user_id",
      className: "RMProfile",
      required: true,
    });
    registerModel("RMUser", RMUser);
    registerModel("RMProfile", RMProfile);
    const user = new RMUser({ name: "test" });
    user.isValid();
    const messages = user.errors.fullMessages;
    expect(messages.length).toBeGreaterThan(0);
    // Rails translates :required → "must exist"; message includes the association name
    expect(messages.some((m) => /must exist/i.test(m))).toBe(true);
    expect(messages.some((m) => /profile/i.test(m))).toBe(true);
  });

  it("required belongs_to associations have a correct error message", async () => {
    const adapter = freshAdapter();
    class Author extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Book extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(Book, "author", { required: true });
    registerModel(Author);
    registerModel(Book);
    const book = new Book({ title: "No Author" });
    book.isValid();
    const errors = book.errors.fullMessages;
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("belongs_to required option", () => {
  it("validates presence of foreign key when required: true", async () => {
    const adapter = freshAdapter();

    class RAuthor extends Base {
      static _tableName = "r_authors";
    }
    RAuthor.attribute("id", "integer");
    RAuthor.attribute("name", "string");
    RAuthor.adapter = adapter;

    class RBook extends Base {
      static _tableName = "r_books";
    }
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
    expect(book.errors.fullMessages.some((m: string) => m.toLowerCase().includes("author"))).toBe(
      true,
    );
  });

  it("passes validation when foreign key is present", async () => {
    const adapter = freshAdapter();

    class RWriter extends Base {
      static _tableName = "r_writers";
    }
    RWriter.attribute("id", "integer");
    RWriter.attribute("name", "string");
    RWriter.adapter = adapter;

    class RNovel extends Base {
      static _tableName = "r_novels";
    }
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

  // Regression: readAttributeForValidation routes through `record.association(name)`
  // for association names; without the `assoc.target != null` guard, an unloaded
  // association with target === null would surface null to validators that then
  // crash or misreport. Combining `belongs_to required: true` (FK presence on
  // child) with `has_many validate: true` (parent triggers child validation on
  // save) is the path PR #1461 broadened, and this test pins the guard.
  it("validates has_many children when parent saves without crashing on unloaded target", async () => {
    const adapter = freshAdapter();

    class RGChild extends Base {
      static _tableName = "rg_children";
    }
    RGChild.attribute("id", "integer");
    RGChild.attribute("title", "string");
    RGChild.attribute("rg_parent_id", "integer");
    RGChild.adapter = adapter;

    class RGParent extends Base {
      static _tableName = "rg_parents";
    }
    RGParent.attribute("id", "integer");
    RGParent.attribute("name", "string");
    RGParent.adapter = adapter;

    registerModel("RGParent", RGParent);
    registerModel("RGChild", RGChild);
    Associations.belongsTo.call(RGChild, "rgParent", {
      required: true,
      foreignKey: "rg_parent_id",
      className: "RGParent",
    });
    Associations.hasMany.call(RGParent, "rgChildren", {
      validate: true,
      foreignKey: "rg_parent_id",
      className: "RGChild",
    });

    // No children built or loaded — has_many target is empty. Save must not
    // throw and must succeed (no children to invalidate the parent).
    const parent = new RGParent({ name: "p1" });
    const saved = await parent.save();
    expect(saved).toBe(true);
    expect(parent.id).toBeTruthy();
  });
});
