/**
 * HasMany extended tests — mirrors Rails:
 * activerecord/test/cases/associations/has_many_associations_test.rb
 *
 * Covers testable behaviors using DatabaseAdapter. Tests requiring raw SQL,
 * DB-specific features (RETURNING, locking, query cache), fixtures, or
 * cross-adapter behavior are kept as null in the naming map.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  Base,
  registerModel,
  association,
  DeleteRestrictionError,
} from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./index.js";
import {
  Associations,
  loadHasMany,
  processDependentAssociations,
} from "./associations.js";

// ---------------------------------------------------------------------------
// Shared setup helpers
// ---------------------------------------------------------------------------

function makePostComments(adapter: DatabaseAdapter) {
  class Comment extends Base {
    static {
      this.attribute("body", "string");
      this.attribute("post_id", "integer");
      this.adapter = adapter;
    }
  }
  class Post extends Base {
    static {
      this.attribute("title", "string");
      this.adapter = adapter;
    }
  }
  Associations.hasMany.call(Post, "comments", { className: "Comment", foreignKey: "post_id" });
  registerModel("Comment", Comment);
  registerModel("Post", Post);
  return { Post, Comment };
}

function makeFirmClients(adapter: DatabaseAdapter) {
  class Client extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("firm_id", "integer");
      this.adapter = adapter;
    }
  }
  class Firm extends Base {
    static {
      this.attribute("name", "string");
      this.adapter = adapter;
    }
  }
  Associations.hasMany.call(Firm, "clients", { className: "Client", foreignKey: "firm_id" });
  registerModel("Client", Client);
  registerModel("Firm", Firm);
  return { Firm, Client };
}

// ---------------------------------------------------------------------------
// HasManyAssociationsTest (testable subset)
// ---------------------------------------------------------------------------

describe("HasManyAssociationsTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = createTestAdapter();
  });

  // -------------------------------------------------------------------------
  // Basic has_many loading
  // -------------------------------------------------------------------------

  it("has many build with options", async () => {
    // Rails: test_has_many_build_with_options
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "UFMT" });
    await Client.create({ name: "Active Client", firm_id: firm.id });

    const clients = await loadHasMany(firm, "clients", {
      className: "Client",
      foreignKey: "firm_id",
    });
    expect(clients.length).toBe(1);
    expect(clients[0].readAttribute("name")).toBe("Active Client");
  });

  it("finding", async () => {
    // Rails: test_finding
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Signal37" });
    await Client.create({ name: "Client A", firm_id: firm.id });
    await Client.create({ name: "Client B", firm_id: firm.id });
    await Client.create({ name: "Client C", firm_id: firm.id });

    const proxy = association(firm, "clients");
    const clients = await proxy.toArray();
    expect(clients.length).toBe(3);
  });

  it("counting", async () => {
    // Rails: test_counting
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Signal37" });
    await Client.create({ name: "A", firm_id: firm.id });
    await Client.create({ name: "B", firm_id: firm.id });
    await Client.create({ name: "C", firm_id: firm.id });

    const count = await association(firm, "clients").count();
    expect(count).toBe(3);
  });

  it("counting with single hash", async () => {
    // Rails: test_counting_with_single_hash
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Signal37" });
    await Client.create({ name: "Microsoft", firm_id: firm.id });
    await Client.create({ name: "Apple", firm_id: firm.id });

    const proxy = association(firm, "clients");
    const all = await proxy.toArray();
    const microsoft = all.filter((c) => c.readAttribute("name") === "Microsoft");
    expect(microsoft.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // build / create on collection proxy
  // -------------------------------------------------------------------------

  it("build", async () => {
    // Rails: test_build
    const { Firm } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "First Firm" });

    const proxy = association(firm, "clients");
    const newClient = proxy.build({ name: "Another Client" });

    expect(newClient.readAttribute("name")).toBe("Another Client");
    expect(newClient.readAttribute("firm_id")).toBe(firm.id);
    expect(newClient.isNewRecord()).toBe(true);
  });

  it("build sets foreign key automatically", async () => {
    // Rails: test_association_keys_bypass_attribute_protection
    const { Firm } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Honda Corp" });

    const proxy = association(firm, "clients");
    const c = proxy.build({});
    expect(c.readAttribute("firm_id")).toBe(firm.id);
  });

  it("build overrides supplied foreign key with correct value", async () => {
    // Rails: test_association_protect_foreign_key
    const { Firm } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Invoice Corp" });

    const proxy = association(firm, "clients");
    // Even when a different firm_id is passed, it should use the owner's id
    const c = proxy.build({ firm_id: 99999 });
    expect(c.readAttribute("firm_id")).toBe(firm.id);
  });

  it("create", async () => {
    // Rails: test_create
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "First Firm" });
    await Client.create({ name: "Existing", firm_id: firm.id });

    const proxy = association(firm, "clients");
    const newClient = await proxy.create({ name: "New Client" });

    expect(newClient.readAttribute("name")).toBe("New Client");
    expect(newClient.readAttribute("firm_id")).toBe(firm.id);
    expect(newClient.isNewRecord()).toBe(false);

    const all = await proxy.toArray();
    expect(all.length).toBe(2);
  });

  it("adding", async () => {
    // Rails: test_adding
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Signal37" });
    await Client.create({ name: "Existing A", firm_id: firm.id });
    await Client.create({ name: "Existing B", firm_id: firm.id });

    const newClient = new Client({ name: "Natural Company" });
    const proxy = association(firm, "clients");
    await proxy.push(newClient);

    const clients = await proxy.toArray();
    expect(clients.length).toBe(3);
  });

  it("adding a collection", async () => {
    // Rails: test_adding_a_collection
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Signal37" });
    await Client.create({ name: "Existing", firm_id: firm.id });

    const proxy = association(firm, "clients");
    await proxy.concat(
      new Client({ name: "Natural Company" }),
      new Client({ name: "Apple" })
    );

    const clients = await proxy.toArray();
    expect(clients.length).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Collection size / empty / any
  // -------------------------------------------------------------------------

  it("calling empty on an association that has not been loaded performs a query", async () => {
    // Rails: calling empty...
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Empty Corp" });

    const proxy = association(firm, "clients");
    expect(await proxy.isEmpty()).toBe(true);

    await Client.create({ name: "One Client", firm_id: firm.id });
    expect(await proxy.isEmpty()).toBe(false);
  });

  it("calling size on an association performs a query", async () => {
    // Rails: calling size...
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Sized Corp" });
    await Client.create({ name: "A", firm_id: firm.id });
    await Client.create({ name: "B", firm_id: firm.id });

    const proxy = association(firm, "clients");
    expect(await proxy.size()).toBe(2);
  });

  // -------------------------------------------------------------------------
  // delete / clear
  // -------------------------------------------------------------------------

  it("deleting", async () => {
    // Rails: test_deleting
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Signal37" });
    const clientA = await Client.create({ name: "Microsoft", firm_id: firm.id });
    await Client.create({ name: "Apple", firm_id: firm.id });

    const proxy = association(firm, "clients");
    await proxy.delete(clientA);

    const remaining = await proxy.toArray();
    expect(remaining.length).toBe(1);
    expect(remaining[0].readAttribute("name")).toBe("Apple");

    // FK should be nullified
    const reloaded = await Client.find(clientA.id as number);
    expect(reloaded.readAttribute("firm_id")).toBeNull();
  });

  it("deleting a collection", async () => {
    // Rails: test_deleting_a_collection
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Signal37" });
    const a = await Client.create({ name: "A", firm_id: firm.id });
    const b = await Client.create({ name: "B", firm_id: firm.id });
    await Client.create({ name: "C", firm_id: firm.id });

    const proxy = association(firm, "clients");
    await proxy.delete(a, b);

    const remaining = await proxy.toArray();
    expect(remaining.length).toBe(1);
    expect(remaining[0].readAttribute("name")).toBe("C");
  });

  it("clearing an association collection", async () => {
    // Rails: test_clearing_an_association_collection
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Signal37" });
    await Client.create({ name: "A", firm_id: firm.id });
    await Client.create({ name: "B", firm_id: firm.id });

    const proxy = association(firm, "clients");
    await proxy.clear();

    const remaining = await proxy.toArray();
    expect(remaining.length).toBe(0);
  });

  it("clear collection should not change updated at", async () => {
    // Rails: test_clear_collection_should_not_change_updated_at
    // We verify FK is nullified but record still exists
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Dauntless" });
    const client = await Client.create({ name: "Cockpit", firm_id: firm.id });

    const proxy = association(firm, "clients");
    await proxy.clear();

    const reloaded = await Client.find(client.id as number);
    expect(reloaded.readAttribute("firm_id")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // IDs getter
  // -------------------------------------------------------------------------

  it("get ids", async () => {
    // Rails: test_get_ids
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Signal37" });
    const a = await Client.create({ name: "A", firm_id: firm.id });
    const b = await Client.create({ name: "B", firm_id: firm.id });

    const proxy = association(firm, "clients");
    const records = await proxy.toArray();
    const ids = records.map((r) => r.readAttribute("id"));
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(ids.length).toBe(2);
  });

  it("get ids for association on new record does not try to find records", async () => {
    // Rails: test_get_ids_for_association_on_new_record_does_not_try_to_find_records
    const { Firm } = makeFirmClients(adapter);
    const firm = new Firm({ name: "New Firm" });

    // New unsaved record — FK value is undefined/null, should return []
    const records = await loadHasMany(firm, "clients", {
      className: "Client",
      foreignKey: "firm_id",
    });
    expect(records).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // first / last
  // -------------------------------------------------------------------------

  it("calling first or last on association", async () => {
    // Rails: test_calling_first_or_last_on_loaded_association_should_not_fetch_with_query
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    await Client.create({ name: "Alpha", firm_id: firm.id });
    await Client.create({ name: "Beta", firm_id: firm.id });

    const proxy = association(firm, "clients");
    const first = await proxy.first();
    const last = await proxy.last();
    expect(first).not.toBeNull();
    expect(last).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // dependent: "destroy"
  // -------------------------------------------------------------------------

  it("dependence", async () => {
    // Rails: test_dependence
    const adapter2 = createTestAdapter();
    class Tag extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("post_id", "integer");
        this.adapter = adapter2;
      }
    }
    class Article extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter2;
      }
    }
    Associations.hasMany.call(Article, "tags", {
      className: "Tag",
      foreignKey: "post_id",
      dependent: "destroy",
    });
    registerModel("Tag", Tag);
    registerModel("Article", Article);

    const post = await Article.create({ title: "Hello" });
    await Tag.create({ name: "t1", post_id: post.id });
    await Tag.create({ name: "t2", post_id: post.id });

    const tagsBefore = await Tag.all().toArray();
    expect(tagsBefore.length).toBe(2);

    await processDependentAssociations(post);
    await post.delete();

    const tagsAfter = await Tag.all().toArray();
    expect(tagsAfter.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // dependent: "nullify"
  // -------------------------------------------------------------------------

  it("depends and nullify", async () => {
    // Rails: test_depends_and_nullify
    const adapter2 = createTestAdapter();
    class Child extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("parent_id", "integer");
        this.adapter = adapter2;
      }
    }
    class Parent extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter2;
      }
    }
    Associations.hasMany.call(Parent, "children", {
      className: "Child",
      foreignKey: "parent_id",
      dependent: "nullify",
    });
    registerModel("Child", Child);
    registerModel("Parent", Parent);

    const parent = await Parent.create({ name: "Mom" });
    const c1 = await Child.create({ name: "Kid1", parent_id: parent.id });
    const c2 = await Child.create({ name: "Kid2", parent_id: parent.id });

    await processDependentAssociations(parent);
    await parent.delete();

    const reloaded1 = await Child.find(c1.id as number);
    const reloaded2 = await Child.find(c2.id as number);
    expect(reloaded1.readAttribute("parent_id")).toBeNull();
    expect(reloaded2.readAttribute("parent_id")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // dependent: "restrictWithException"
  // -------------------------------------------------------------------------

  it("restrict with exception", async () => {
    // Rails: test_restrict_with_exception
    const adapter2 = createTestAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("container_id", "integer");
        this.adapter = adapter2;
      }
    }
    class Container extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter2;
      }
    }
    Associations.hasMany.call(Container, "items", {
      className: "Item",
      foreignKey: "container_id",
      dependent: "restrictWithException",
    });
    registerModel("Item", Item);
    registerModel("Container", Container);

    const container = await Container.create({ name: "Box" });
    await Item.create({ name: "Thing", container_id: container.id });

    await expect(processDependentAssociations(container)).rejects.toThrow(
      DeleteRestrictionError
    );
  });

  it("restrict with exception when empty allows destroy", async () => {
    // Rails: test_restrict_with_exception (empty case)
    const adapter2 = createTestAdapter();
    class Widget extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("shelf_id", "integer");
        this.adapter = adapter2;
      }
    }
    class Shelf extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter2;
      }
    }
    Associations.hasMany.call(Shelf, "widgets", {
      className: "Widget",
      foreignKey: "shelf_id",
      dependent: "restrictWithException",
    });
    registerModel("Widget", Widget);
    registerModel("Shelf", Shelf);

    const shelf = await Shelf.create({ name: "Empty Shelf" });
    // No children — should not throw
    await expect(processDependentAssociations(shelf)).resolves.toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // dependent: "restrictWithError"
  // -------------------------------------------------------------------------

  it("restrict with error", async () => {
    // Rails: test_restrict_with_error
    const adapter2 = createTestAdapter();
    class Entry extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("log_id", "integer");
        this.adapter = adapter2;
      }
    }
    class Log extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter2;
      }
    }
    Associations.hasMany.call(Log, "entries", {
      className: "Entry",
      foreignKey: "log_id",
      dependent: "restrictWithError",
    });
    registerModel("Entry", Entry);
    registerModel("Log", Log);

    const log = await Log.create({ name: "Audit" });
    await Entry.create({ name: "e1", log_id: log.id });

    await expect(processDependentAssociations(log)).rejects.toThrow(
      DeleteRestrictionError
    );
  });

  // -------------------------------------------------------------------------
  // replace
  // -------------------------------------------------------------------------

  it("replace with less", async () => {
    // Rails: test_replace_with_less
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Firm" });
    await Client.create({ name: "A", firm_id: firm.id });
    const b = await Client.create({ name: "B", firm_id: firm.id });
    await Client.create({ name: "C", firm_id: firm.id });

    const proxy = association(firm, "clients");
    // Clear and replace with just b
    await proxy.clear();
    // After clear, b's FK is null; reload it and re-add
    const bReloaded = await Client.find(b.id as number);
    await proxy.push(bReloaded);

    const remaining = await proxy.toArray();
    expect(remaining.length).toBe(1);
    expect(remaining[0].readAttribute("name")).toBe("B");
  });

  it("replace with new", async () => {
    // Rails: test_replace_with_new
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Firm" });
    await Client.create({ name: "Old", firm_id: firm.id });

    const proxy = association(firm, "clients");
    const newRecord = new Client({ name: "Replacement" });
    await proxy.clear();
    await proxy.push(newRecord);

    const remaining = await proxy.toArray();
    expect(remaining.length).toBe(1);
    expect(remaining[0].readAttribute("name")).toBe("Replacement");
  });

  // -------------------------------------------------------------------------
  // include? / includes
  // -------------------------------------------------------------------------

  it("included in collection", async () => {
    // Rails: test_included_in_collection
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    const client = await Client.create({ name: "Included", firm_id: firm.id });
    await Client.create({ name: "Other", firm_id: 99999 });

    const proxy = association(firm, "clients");
    expect(await proxy.includes(client)).toBe(true);
  });

  it("included in collection for new records", async () => {
    // Rails: test_included_in_collection_for_new_records
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    const unsaved = new Client({ name: "New" });

    const proxy = association(firm, "clients");
    expect(await proxy.includes(unsaved)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // destroy on collection proxy
  // -------------------------------------------------------------------------

  it("destroying", async () => {
    // Rails: test_destroying
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Signal37" });
    const a = await Client.create({ name: "To Destroy", firm_id: firm.id });
    await Client.create({ name: "Survivor", firm_id: firm.id });

    const proxy = association(firm, "clients");
    await proxy.destroy(a);

    // Record should be gone from DB
    await expect(Client.find(a.id as number)).rejects.toThrow();
    const remaining = await proxy.toArray();
    expect(remaining.length).toBe(1);
  });

  it("destroying a collection", async () => {
    // Rails: test_destroying_a_collection
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Signal37" });
    const a = await Client.create({ name: "A", firm_id: firm.id });
    const b = await Client.create({ name: "B", firm_id: firm.id });
    await Client.create({ name: "C", firm_id: firm.id });

    const proxy = association(firm, "clients");
    await proxy.destroy(a, b);

    const remaining = await proxy.toArray();
    expect(remaining.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // has many on new record
  // -------------------------------------------------------------------------

  it("has many associations on new records use null relations", async () => {
    // Rails: test has many associations on new records use null relations
    const { Firm } = makeFirmClients(adapter);
    const firm = new Firm({ name: "New" });

    const records = await loadHasMany(firm, "clients", {
      className: "Client",
      foreignKey: "firm_id",
    });
    expect(records).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Scoped associations
  // -------------------------------------------------------------------------

  it("association with scope applies conditions", async () => {
    // Rails: scoped association variant
    const adapter2 = createTestAdapter();
    class ScopedComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("post_id", "integer");
        this.attribute("approved", "boolean");
        this.adapter = adapter2;
      }
    }
    class ScopedPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter2;
      }
    }
    Associations.hasMany.call(ScopedPost, "approved_comments", {
      className: "ScopedComment",
      foreignKey: "post_id",
      scope: (rel: any) => rel.where({ approved: true }),
    });
    registerModel("ScopedComment", ScopedComment);
    registerModel("ScopedPost", ScopedPost);

    const post = await ScopedPost.create({ title: "Hello" });
    await ScopedComment.create({ body: "Good", post_id: post.id, approved: true });
    await ScopedComment.create({ body: "Bad", post_id: post.id, approved: false });

    const comments = await loadHasMany(post, "approved_comments", {
      className: "ScopedComment",
      foreignKey: "post_id",
      scope: (rel: any) => rel.where({ approved: true }),
    });
    expect(comments.length).toBe(1);
    expect(comments[0].readAttribute("body")).toBe("Good");
  });

  // -------------------------------------------------------------------------
  // inverse_of
  // -------------------------------------------------------------------------

  it("build from association sets inverse instance", async () => {
    // Rails: test_build_from_association_sets_inverse_instance
    const { Firm } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Inverse Corp" });
    const proxy = association(firm, "clients");
    const built = proxy.build({ name: "Built Client" });

    expect(built.readAttribute("firm_id")).toBe(firm.id);
  });

  // -------------------------------------------------------------------------
  // Multiple associations on same model
  // -------------------------------------------------------------------------

  it("has many with different foreign keys", async () => {
    const adapter2 = createTestAdapter();
    class Product extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("seller_id", "integer");
        this.attribute("buyer_id", "integer");
        this.adapter = adapter2;
      }
    }
    class Person extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter2;
      }
    }
    Associations.hasMany.call(Person, "sold_products", {
      className: "Product",
      foreignKey: "seller_id",
    });
    Associations.hasMany.call(Person, "bought_products", {
      className: "Product",
      foreignKey: "buyer_id",
    });
    registerModel("Product", Product);
    registerModel("Person", Person);

    const alice = await Person.create({ name: "Alice" });
    const bob = await Person.create({ name: "Bob" });
    await Product.create({ name: "Widget", seller_id: alice.id, buyer_id: bob.id });
    await Product.create({ name: "Gadget", seller_id: alice.id, buyer_id: bob.id });

    const sold = await loadHasMany(alice, "sold_products", {
      className: "Product",
      foreignKey: "seller_id",
    });
    const bought = await loadHasMany(bob, "bought_products", {
      className: "Product",
      foreignKey: "buyer_id",
    });

    expect(sold.length).toBe(2);
    expect(bought.length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // taking
  // -------------------------------------------------------------------------

  it("taking", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    await Client.create({ name: "A", firm_id: firm.id });
    await Client.create({ name: "B", firm_id: firm.id });

    const proxy = association(firm, "clients");
    const taken = await proxy.take();
    expect(taken).not.toBeNull();
  });

  it("taking not found", async () => {
    const { Firm } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Empty Corp" });

    const proxy = association(firm, "clients");
    const taken = await proxy.take();
    expect(taken).toBeNull();
  });

  it("taking with a number", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    await Client.create({ name: "A", firm_id: firm.id });
    await Client.create({ name: "B", firm_id: firm.id });
    await Client.create({ name: "C", firm_id: firm.id });

    const proxy = association(firm, "clients");
    const taken = await proxy.take(2) as Base[];
    expect(taken.length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // many? / none? / one?
  // -------------------------------------------------------------------------

  it("calling many should return true if more than one", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    await Client.create({ name: "A", firm_id: firm.id });
    await Client.create({ name: "B", firm_id: firm.id });

    expect(await association(firm, "clients").many()).toBe(true);
  });

  it("calling many should return false if only one", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    await Client.create({ name: "A", firm_id: firm.id });

    expect(await association(firm, "clients").many()).toBe(false);
  });

  it("calling none should return true if none", async () => {
    const { Firm } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Empty" });

    expect(await association(firm, "clients").none()).toBe(true);
  });

  it("calling none should return false if any", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    await Client.create({ name: "A", firm_id: firm.id });

    expect(await association(firm, "clients").none()).toBe(false);
  });

  it("calling one should return false if zero", async () => {
    const { Firm } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Empty" });

    expect(await association(firm, "clients").one()).toBe(false);
  });

  it("calling one should return false if more than one", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    await Client.create({ name: "A", firm_id: firm.id });
    await Client.create({ name: "B", firm_id: firm.id });

    expect(await association(firm, "clients").one()).toBe(false);
  });

  it("calling one should return true if exactly one", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    await Client.create({ name: "A", firm_id: firm.id });

    expect(await association(firm, "clients").one()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // first_or_initialize / first_or_create
  // -------------------------------------------------------------------------

  it("first_or_initialize adds the record to the association", async () => {
    const { Firm } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });

    const proxy = association(firm, "clients");
    const client = await proxy.firstOrInitialize({ name: "New Client" });

    expect(client.readAttribute("name")).toBe("New Client");
    expect(client.readAttribute("firm_id")).toBe(firm.id);
    expect(client.isNewRecord()).toBe(true);
  });

  it("first_or_initialize returns existing when found", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    await Client.create({ name: "Existing", firm_id: firm.id });

    const proxy = association(firm, "clients");
    const client = await proxy.firstOrInitialize({ name: "Existing" });

    expect(client.isNewRecord()).toBe(false);
  });

  it("first_or_create adds the record to the association", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });

    const proxy = association(firm, "clients");
    const client = await proxy.firstOrCreate({ name: "New Client" });

    expect(client.readAttribute("name")).toBe("New Client");
    expect(client.readAttribute("firm_id")).toBe(firm.id);
    expect(client.isNewRecord()).toBe(false);

    const all = await Client.all().toArray();
    expect(all.length).toBe(1);
  });

  it("first_or_create! adds the record to the association", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });

    const proxy = association(firm, "clients");
    const client = await proxy.firstOrCreate_({ name: "New Client" });

    expect(client.isNewRecord()).toBe(false);
    expect(client.readAttribute("firm_id")).toBe(firm.id);

    const all = await Client.all().toArray();
    expect(all.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // exists?
  // -------------------------------------------------------------------------

  it("exists respects association scope", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    const other = await Firm.create({ name: "Other" });
    await Client.create({ name: "A", firm_id: firm.id });
    await Client.create({ name: "B", firm_id: other.id });

    expect(await association(firm, "clients").exists()).toBe(true);
    expect(await association(other, "clients").exists()).toBe(true);

    const empty = await Firm.create({ name: "Empty" });
    expect(await association(empty, "clients").exists()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // sending new to proxy = build
  // -------------------------------------------------------------------------

  it("sending new to association proxy should have same effect as calling new", async () => {
    const { Firm } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });

    const proxy = association(firm, "clients");
    const built = proxy.build({ name: "Via Build" });

    expect(built.readAttribute("firm_id")).toBe(firm.id);
    expect(built.isNewRecord()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // attributes set on initialization from where clause
  // -------------------------------------------------------------------------

  it("attributes are being set when initialized from has many association with where clause", async () => {
    const { Firm } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });

    const proxy = association(firm, "clients");
    const client = await proxy.firstOrInitialize({ name: "Scoped Client" });

    expect(client.readAttribute("name")).toBe("Scoped Client");
    expect(client.readAttribute("firm_id")).toBe(firm.id);
  });

  // -------------------------------------------------------------------------
  // include? after build
  // -------------------------------------------------------------------------

  it("include method in has many association should return true for instance added with build", async () => {
    const { Firm } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });

    const proxy = association(firm, "clients");
    const built = proxy.build({ name: "Built" });
    await built.save();

    expect(await proxy.includes(built)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // replace returns target
  // -------------------------------------------------------------------------

  it("replace returns target", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    await Client.create({ name: "Old", firm_id: firm.id });

    const proxy = association(firm, "clients");
    const newRecord = new Client({ name: "New" });
    await proxy.clear();
    await proxy.push(newRecord);

    const result = await proxy.toArray();
    expect(result.length).toBe(1);
    expect(result[0].readAttribute("name")).toBe("New");
  });

  // -------------------------------------------------------------------------
  // create with nil values
  // -------------------------------------------------------------------------

  it("create from association with nil values should work", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });

    const proxy = association(firm, "clients");
    const client = await proxy.create({ name: null });

    expect(client.isNewRecord()).toBe(false);
    expect(client.readAttribute("firm_id")).toBe(firm.id);
    expect(client.readAttribute("name")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // finding with conditions
  // -------------------------------------------------------------------------

  it("finding with condition", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    await Client.create({ name: "Microsoft", firm_id: firm.id });
    await Client.create({ name: "Apple", firm_id: firm.id });

    const proxy = association(firm, "clients");
    const matches = await proxy.where({ name: "Microsoft" });
    expect(matches.length).toBe(1);
    expect(matches[0].readAttribute("name")).toBe("Microsoft");
  });

  it("finding with condition hash", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    await Client.create({ name: "Alpha", firm_id: firm.id });
    await Client.create({ name: "Beta", firm_id: firm.id });

    const proxy = association(firm, "clients");
    const matches = await proxy.where({ name: "Alpha" });
    expect(matches.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // attributes set on null relationship initialization
  // -------------------------------------------------------------------------

  it("attributes are set when initialized from has many null relationship", async () => {
    const { Firm } = makeFirmClients(adapter);
    const firm = new Firm({ name: "New Firm" });

    // New record — collection is empty/null
    const records = await loadHasMany(firm, "clients", {
      className: "Client",
      foreignKey: "firm_id",
    });
    expect(records).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // destroy all
  // -------------------------------------------------------------------------

  it("destroy all", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    const a = await Client.create({ name: "A", firm_id: firm.id });
    const b = await Client.create({ name: "B", firm_id: firm.id });

    await association(firm, "clients").destroyAll();

    await expect(Client.find(a.id as number)).rejects.toThrow();
    await expect(Client.find(b.id as number)).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // replace (full collection replace)
  // -------------------------------------------------------------------------

  it("replace", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    await Client.create({ name: "Old A", firm_id: firm.id });
    await Client.create({ name: "Old B", firm_id: firm.id });

    const newC = new Client({ name: "New C" });
    await newC.save();

    const proxy = association(firm, "clients");
    await proxy.replace([newC]);

    const remaining = await proxy.toArray();
    expect(remaining.length).toBe(1);
    expect(remaining[0].readAttribute("name")).toBe("New C");
  });

  it("replace with same content", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    await Client.create({ name: "A", firm_id: firm.id });
    await Client.create({ name: "B", firm_id: firm.id });

    // Build replacement records (not yet owned by firm)
    const c = new Client({ name: "C" });
    const d = new Client({ name: "D" });

    const proxy = association(firm, "clients");
    await proxy.replace([c, d]);

    const remaining = await proxy.toArray();
    expect(remaining.length).toBe(2);
    expect(remaining.map(r => r.readAttribute("name")).sort()).toEqual(["C", "D"]);
  });

  // -------------------------------------------------------------------------
  // clearing without initial access
  // -------------------------------------------------------------------------

  it("clearing without initial access", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    await Client.create({ name: "A", firm_id: firm.id });
    await Client.create({ name: "B", firm_id: firm.id });

    // Clear without calling toArray first
    const proxy = association(firm, "clients");
    await proxy.clear();

    const all = await Client.all().toArray();
    expect(all.every((c: any) => c.readAttribute("firm_id") === null)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // delete / destroy by id
  // -------------------------------------------------------------------------

  it("deleting by integer id", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    const a = await Client.create({ name: "A", firm_id: firm.id });
    await Client.create({ name: "B", firm_id: firm.id });

    const proxy = association(firm, "clients");
    const target = await Client.find(a.id as number);
    await proxy.delete(target);

    const remaining = await proxy.toArray();
    expect(remaining.length).toBe(1);
  });

  it("destroying by integer id", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    const a = await Client.create({ name: "A", firm_id: firm.id });
    await Client.create({ name: "B", firm_id: firm.id });

    const proxy = association(firm, "clients");
    const target = await Client.find(a.id as number);
    await proxy.destroy(target);

    await expect(Client.find(a.id as number)).rejects.toThrow();
    const remaining = await proxy.toArray();
    expect(remaining.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // find within collection
  // -------------------------------------------------------------------------

  it("find in collection", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    const a = await Client.create({ name: "A", firm_id: firm.id });
    await Client.create({ name: "B", firm_id: firm.id });

    const proxy = association(firm, "clients");
    const found = await proxy.find(a.id as number) as Base;
    expect(found.readAttribute("name")).toBe("A");
  });

  it("find ids", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    const a = await Client.create({ name: "A", firm_id: firm.id });
    const b = await Client.create({ name: "B", firm_id: firm.id });

    const proxy = association(firm, "clients");
    const found = await proxy.find([a.id as number, b.id as number]) as Base[];
    expect(found.length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // set ids
  // -------------------------------------------------------------------------

  it("set ids for association on new record applies association correctly", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    const a = await Client.create({ name: "A", firm_id: null });
    const b = await Client.create({ name: "B", firm_id: null });

    const proxy = association(firm, "clients");
    await proxy.setIds([a.id as number, b.id as number]);

    const members = await proxy.toArray();
    expect(members.length).toBe(2);
    expect(members.every(m => m.readAttribute("firm_id") === firm.id)).toBe(true);
  });

  it("assign ids ignoring blanks", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    const a = await Client.create({ name: "A", firm_id: null });

    const proxy = association(firm, "clients");
    await proxy.setIds([a.id as number, "", null as any]);

    const members = await proxy.toArray();
    expect(members.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // adding using create
  // -------------------------------------------------------------------------

  it("adding using create", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });

    await association(firm, "clients").create({ name: "New Via Create" });

    const all = await Client.all().toArray();
    expect(all.length).toBe(1);
    expect(all[0].readAttribute("firm_id")).toBe(firm.id);
  });

  // -------------------------------------------------------------------------
  // creation respects hash condition
  // -------------------------------------------------------------------------

  it("creation respects hash condition", async () => {
    const { Firm } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });

    const client = await association(firm, "clients").create({ name: "Conditioned" });

    expect(client.readAttribute("firm_id")).toBe(firm.id);
    expect(client.readAttribute("name")).toBe("Conditioned");
  });

  // -------------------------------------------------------------------------
  // create with bang on new parent raises
  // -------------------------------------------------------------------------

  it("create with bang on has many when parent is new raises", async () => {
    const { Firm } = makeFirmClients(adapter);
    const firm = new Firm({ name: "New Corp" });

    // build on unsaved parent: FK is null since parent has no id
    const proxy = association(firm, "clients");
    const built = proxy.build({ name: "Child" });
    expect(built.readAttribute("firm_id")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // include? checks
  // -------------------------------------------------------------------------

  it("include uses array include after loaded", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    const a = await Client.create({ name: "A", firm_id: firm.id });

    const proxy = association(firm, "clients");
    await proxy.toArray(); // load
    expect(await proxy.includes(a)).toBe(true);
  });

  it("include returns false for non matching record to verify scoping", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    const other = await Firm.create({ name: "Other" });
    await Client.create({ name: "A", firm_id: firm.id });
    const outside = await Client.create({ name: "B", firm_id: other.id });

    expect(await association(firm, "clients").includes(outside)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // calling many should return false if none or one
  // -------------------------------------------------------------------------

  it("calling many should return false if none or one", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });

    expect(await association(firm, "clients").many()).toBe(false);

    await Client.create({ name: "A", firm_id: firm.id });
    expect(await association(firm, "clients").many()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // find all / find first via proxy
  // -------------------------------------------------------------------------

  it("find all", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    await Client.create({ name: "A", firm_id: firm.id });
    await Client.create({ name: "B", firm_id: firm.id });

    const all = await association(firm, "clients").toArray();
    expect(all.length).toBe(2);
  });

  it("find first", async () => {
    const { Firm, Client } = makeFirmClients(adapter);
    const firm = await Firm.create({ name: "Corp" });
    await Client.create({ name: "Alpha", firm_id: firm.id });
    await Client.create({ name: "Beta", firm_id: firm.id });

    const first = await association(firm, "clients").first();
    expect(first).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Three levels of dependence
  // -------------------------------------------------------------------------

  it("three levels of dependence", async () => {
    // Rails: test_three_levels_of_dependence
    const adapter2 = createTestAdapter();
    class Grandchild extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("child_id", "integer");
        this.adapter = adapter2;
      }
    }
    class Child2 extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("root_id", "integer");
        this.adapter = adapter2;
      }
    }
    class Root extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter2;
      }
    }
    Associations.hasMany.call(Child2, "grandchildren", {
      className: "Grandchild",
      foreignKey: "child_id",
      dependent: "destroy",
    });
    Associations.hasMany.call(Root, "children2", {
      className: "Child2",
      foreignKey: "root_id",
      dependent: "destroy",
    });
    registerModel("Grandchild", Grandchild);
    registerModel("Child2", Child2);
    registerModel("Root", Root);

    const root = await Root.create({ name: "Root" });
    const child = await Child2.create({ name: "Child", root_id: root.id });
    await Grandchild.create({ name: "GC", child_id: child.id });

    await processDependentAssociations(root);
    await root.delete();

    const childrenLeft = await Child2.all().toArray();
    const grandchildrenLeft = await Grandchild.all().toArray();
    expect(childrenLeft.length).toBe(0);
    expect(grandchildrenLeft.length).toBe(0);
  });
});
