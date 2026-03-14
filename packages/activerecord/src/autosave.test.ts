/**
 * Autosave association tests.
 * Mirrors: activerecord/test/cases/autosave_association_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "./autosave.js";

function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ==========================================================================
// TestAutosaveAssociationsInGeneral
// ==========================================================================

describe("TestAutosaveAssociationsInGeneral", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("markForDestruction and isMarkedForDestruction", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    Post.adapter = adapter;
    const post = new Post({ title: "Hello" });
    expect(isMarkedForDestruction(post)).toBe(false);
    markForDestruction(post);
    expect(isMarkedForDestruction(post)).toBe(true);
  });

  it("isDestroyable returns false for new records", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    Post.adapter = adapter;
    const post = new Post({ title: "Hello" });
    markForDestruction(post);
    expect(isDestroyable(post)).toBe(false);
  });

  it("isDestroyable returns true for persisted records marked for destruction", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    Post.adapter = adapter;
    const post = await Post.create({ title: "Hello" });
    markForDestruction(post);
    expect(isDestroyable(post)).toBe(true);
  });

  it("no validation when autosave is not enabled (associated record not saved)", async () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class Book extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
      }
    }
    Author.adapter = adapter;
    Book.adapter = adapter;
    registerModel(Author);
    registerModel(Book);

    // Without autosave, saving parent does NOT auto-save child
    const author = await Author.create({ name: "Dean" });
    const book = new Book({ title: "My Book", author_id: author.id });

    // book is NOT saved - there's no autosave
    const saved = await author.save();
    expect(saved).toBe(true);
    // book stays unsaved
    expect(book.isNewRecord()).toBe(true);
  });

  it("autosave_association_on_a_has_many_association saves children", async () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class Book extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
      }
    }
    Author.adapter = adapter;
    Book.adapter = adapter;
    registerModel("Author", Author);
    registerModel("Book", Book);

    // Set up autosave
    Object.defineProperty(Author, "_associations", {
      value: [],
      writable: true,
      configurable: true,
    });
    (Author as any)._associations = [
      { type: "hasMany", name: "books", options: { autosave: true } },
    ];

    const author = await Author.create({ name: "Dean" });
    const book = new Book({ title: "My Book" });

    // Cache the association
    (author as any)._cachedAssociations = new Map();
    (author as any)._cachedAssociations.set("books", [book]);

    const saved = await author.save();
    expect(saved).toBe(true);
    expect(book.isNewRecord()).toBe(false);
    expect(book.readAttribute("author_id")).toBe(author.id);
  });
});

// ==========================================================================
// TestDefaultAutosaveAssociationOnAHasOneAssociation
// ==========================================================================

describe("TestDefaultAutosaveAssociationOnAHasOneAssociation", () => {
  let adapter: DatabaseAdapter;

  class Company extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  class Account extends Base {
    static {
      this.attribute("credit_limit", "integer");
      this.attribute("company_id", "integer");
    }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Company.adapter = adapter;
    Account.adapter = adapter;
    registerModel("Company", Company);
    registerModel("Account", Account);

    (Company as any)._associations = [
      { type: "hasOne", name: "account", options: { autosave: true } },
    ];
  });

  it("test_should_save_parent_but_not_invalid_child", async () => {
    const company = new Company({ name: "Acme" });
    const account = new Account({ credit_limit: 100 });

    // Cache the account association
    (company as any)._cachedAssociations = new Map();
    (company as any)._cachedAssociations.set("account", account);

    // Save company — should save and propagate FK
    const saved = await company.save();
    expect(saved).toBe(true);
    expect(account.isNewRecord()).toBe(false);
    expect(account.readAttribute("company_id")).toBe(company.id);
  });

  it("test_save_fails_for_invalid_has_one when child has validation errors", async () => {
    // Add a validation to Account
    class StrictAccount extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.attribute("company_id", "integer");
        this.validates("credit_limit", { presence: true });
      }
    }
    StrictAccount.adapter = adapter;
    registerModel("StrictAccount", StrictAccount);

    const company2 = new Company({ name: "Corp" });
    (Company as any)._associations = [
      {
        type: "hasOne",
        name: "strictAccount",
        options: { autosave: true, className: "StrictAccount" },
      },
    ];

    const badAccount = new StrictAccount({});
    (company2 as any)._cachedAssociations = new Map();
    (company2 as any)._cachedAssociations.set("strictAccount", badAccount);

    const saved = await company2.save();
    expect(saved).toBe(false);
  });

  it("save succeeds when has_one child is not loaded", async () => {
    const company = await Company.create({ name: "Acme" });
    // No association cached — no autosave triggered
    const saved = await company.save();
    expect(saved).toBe(true);
  });

  it("destroy child marked for destruction when parent saves", async () => {
    const company = await Company.create({ name: "Acme" });
    const account = await Account.create({ credit_limit: 100, company_id: company.id });

    markForDestruction(account);

    (company as any)._cachedAssociations = new Map();
    (company as any)._cachedAssociations.set("account", account);

    const saved = await company.save();
    expect(saved).toBe(true);
    expect(account.isDestroyed()).toBe(true);
  });
});

// ==========================================================================
// TestDefaultAutosaveAssociationOnABelongsToAssociation
// ==========================================================================

describe("TestDefaultAutosaveAssociationOnABelongsToAssociation", () => {
  let adapter: DatabaseAdapter;

  class Post extends Base {
    static {
      this.attribute("title", "string");
      this.attribute("author_id", "integer");
    }
  }

  class Author extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Post.adapter = adapter;
    Author.adapter = adapter;
    registerModel("Post", Post);
    registerModel("Author", Author);

    (Post as any)._associations = [
      { type: "belongsTo", name: "author", options: { autosave: true } },
    ];
  });

  it("test_should_save_parent_but_not_invalid_child", async () => {
    const author = new Author({ name: "Dean" });
    const post = new Post({ title: "Hello" });

    (post as any)._cachedAssociations = new Map();
    (post as any)._cachedAssociations.set("author", author);

    const saved = await post.save();
    expect(saved).toBe(true);
    // author should have been saved and FK set
    expect(author.isNewRecord()).toBe(false);
    expect(post.readAttribute("author_id")).toBe(author.id);
  });

  it("test_assignment_before_parent_saved", async () => {
    const author = new Author({ name: "New Author" });
    const post = new Post({ title: "Title" });

    (post as any)._cachedAssociations = new Map();
    (post as any)._cachedAssociations.set("author", author);

    await post.save();

    expect(author.isNewRecord()).toBe(false);
    expect(post.readAttribute("author_id")).toBe(author.id);
  });

  it("test_store_two_association_with_one_save", async () => {
    const author = new Author({ name: "Author 1" });
    const post = new Post({ title: "Post 1" });

    (post as any)._cachedAssociations = new Map();
    (post as any)._cachedAssociations.set("author", author);

    await post.save();

    expect(post.isNewRecord()).toBe(false);
    expect(author.isNewRecord()).toBe(false);
    expect(post.readAttribute("author_id")).toBe(author.id);
  });
});

// ==========================================================================
// TestDefaultAutosaveAssociationOnAHasManyAssociation
// ==========================================================================

describe("TestDefaultAutosaveAssociationOnAHasManyAssociation", () => {
  let adapter: DatabaseAdapter;

  class Company extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  class Employee extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("company_id", "integer");
      this.validates("name", { presence: true });
    }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Company.adapter = adapter;
    Employee.adapter = adapter;
    registerModel("Company", Company);
    registerModel("Employee", Employee);

    (Company as any)._associations = [
      { type: "hasMany", name: "employees", options: { autosave: true } },
    ];
  });

  it("test_invalid_adding — parent fails to save when child is invalid", async () => {
    const company = new Company({ name: "Acme" });
    const badEmployee = new Employee({ name: "" }); // fails validates presence

    (company as any)._cachedAssociations = new Map();
    (company as any)._cachedAssociations.set("employees", [badEmployee]);

    const saved = await company.save();
    expect(saved).toBe(false);
  });

  it("valid children are saved when parent saves", async () => {
    const company = new Company({ name: "Acme" });
    const employee = new Employee({ name: "Alice" });

    (company as any)._cachedAssociations = new Map();
    (company as any)._cachedAssociations.set("employees", [employee]);

    const saved = await company.save();
    expect(saved).toBe(true);
    expect(employee.isNewRecord()).toBe(false);
    expect(employee.readAttribute("company_id")).toBe(company.id);
  });

  it("children marked for destruction are destroyed when parent saves", async () => {
    const company = await Company.create({ name: "Acme" });
    const employee = await Employee.create({ name: "Alice", company_id: company.id });

    markForDestruction(employee);

    (company as any)._cachedAssociations = new Map();
    (company as any)._cachedAssociations.set("employees", [employee]);

    const saved = await company.save();
    expect(saved).toBe(true);
    expect(employee.isDestroyed()).toBe(true);
  });

  it("unchanged children are not re-saved", async () => {
    const company = await Company.create({ name: "Acme" });
    const employee = await Employee.create({ name: "Bob", company_id: company.id });

    // employee is persisted and unchanged
    (company as any)._cachedAssociations = new Map();
    (company as any)._cachedAssociations.set("employees", [employee]);

    const saved = await company.save();
    expect(saved).toBe(true);
    // employee was not destroyed or re-saved unnecessarily
    expect(employee.isDestroyed()).toBe(false);
  });
});

// ==========================================================================
// TestDestroyAsPartOfAutosaveAssociation
// ==========================================================================

describe("TestDestroyAsPartOfAutosaveAssociation", () => {
  let adapter: DatabaseAdapter;

  class Ship extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  class Part extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("ship_id", "integer");
    }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Ship.adapter = adapter;
    Part.adapter = adapter;
    registerModel("Ship", Ship);
    registerModel("Part", Part);

    (Ship as any)._associations = [{ type: "hasMany", name: "parts", options: { autosave: true } }];
  });

  it("should destroy the associated models when marked for destruction", async () => {
    const ship = await Ship.create({ name: "HMS Victory" });
    const part1 = await Part.create({ name: "Cannon", ship_id: ship.id });
    const part2 = await Part.create({ name: "Sail", ship_id: ship.id });

    markForDestruction(part1);

    (ship as any)._cachedAssociations = new Map();
    (ship as any)._cachedAssociations.set("parts", [part1, part2]);

    await ship.save();

    expect(part1.isDestroyed()).toBe(true);
    expect(part2.isDestroyed()).toBe(false);
  });

  it("should not destroy the associated models when not marked for destruction", async () => {
    const ship = await Ship.create({ name: "HMS Victory" });
    const part = await Part.create({ name: "Cannon", ship_id: ship.id });

    (ship as any)._cachedAssociations = new Map();
    (ship as any)._cachedAssociations.set("parts", [part]);

    await ship.save();

    expect(part.isDestroyed()).toBe(false);
  });

  it("destroy has_one marked for destruction", async () => {
    class Pirate extends Base {
      static {
        this.attribute("catchphrase", "string");
      }
    }
    class PirateShip extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("pirate_id", "integer");
      }
    }
    Pirate.adapter = adapter;
    PirateShip.adapter = adapter;
    registerModel("Pirate", Pirate);
    registerModel("PirateShip", PirateShip);

    (Pirate as any)._associations = [
      { type: "hasOne", name: "pirateShip", options: { autosave: true } },
    ];

    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await PirateShip.create({ name: "Black Pearl", pirate_id: pirate.id });

    markForDestruction(ship);

    (pirate as any)._cachedAssociations = new Map();
    (pirate as any)._cachedAssociations.set("pirateShip", ship);

    await pirate.save();

    expect(ship.isDestroyed()).toBe(true);
  });
});
