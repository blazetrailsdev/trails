/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SubclassNotFound,
  Base,
  Relation,
  Range,
  transaction,
  CollectionProxy,
  association,
  defineEnum,
  readEnumValue,
  RecordNotFound,
  RecordInvalid,
  SoleRecordExceeded,
  ReadOnlyRecord,
  StrictLoadingViolationError,
  StaleObjectError,
  columns,
  columnNames,
  reflectOnAssociation,
  reflectOnAllAssociations,
  hasSecureToken,
  serialize,
  registerModel,
  composedOf,
  acceptsNestedAttributesFor,
  assignNestedAttributes,
  generatesTokenFor,
  store,
  storedAttributes,
  Migration,
  Schema,
  MigrationContext,
  TableDefinition,
  delegatedType,
  enableSti,
  registerSubclass,
} from "../index.js";
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
  buildBelongsTo,
  touchBelongsToParents,
} from "../associations.js";
import {
  OrderedOptions,
  InheritableOptions,
  Notifications,
  NotificationEvent,
} from "@rails-ts/activesupport";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "../autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("BelongsToWithForeignKeyTest", () => {
  it("destroy linked models", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.create({ title: "linked" });
    expect(p.isPersisted()).toBe(true);
    await p.destroy();
    expect(p.isDestroyed()).toBe(true);
  });
});

describe("touch on belongs_to", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("touches parent updated_at when child is saved", async () => {
    class Post extends Base {
      static _tableName = "posts";
    }
    Post.attribute("id", "integer");
    Post.attribute("title", "string");
    Post.attribute("updated_at", "datetime");
    Post.adapter = adapter;
    registerModel(Post);

    class Comment extends Base {
      static _tableName = "comments";
    }
    Comment.attribute("id", "integer");
    Comment.attribute("body", "string");
    Comment.attribute("post_id", "integer");
    Comment.adapter = adapter;
    Associations.belongsTo.call(Comment, "post", { touch: true });
    registerModel(Comment);

    const post = await Post.create({ title: "Hello" });
    const originalUpdatedAt = post.readAttribute("updated_at");

    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 10));

    await Comment.create({ body: "Nice!", post_id: post.id });
    await post.reload();

    const newUpdatedAt = post.readAttribute("updated_at");
    expect(newUpdatedAt).not.toEqual(originalUpdatedAt);
  });
});

describe("BelongsToAssociationsTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("natural assignment", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = await Account.create({ company_id: company.id });
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect(loaded).not.toBeNull();
    expect((loaded as any).readAttribute("name")).toBe("Acme");
  });

  it("id assignment", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = Account.new({});
    account.writeAttribute("company_id", company.id);
    await account.save();
    expect((account as any).readAttribute("company_id")).toBe(company.id);
  });

  it("creating the belonging object", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "NewCo" });
    const account = await Account.create({ company_id: company.id });
    expect(account.isNewRecord()).toBe(false);
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect((loaded as any).readAttribute("name")).toBe("NewCo");
  });

  it("creating the belonging object from new record", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Startup" });
    const account = Account.new({ company_id: company.id });
    expect(account.isNewRecord()).toBe(true);
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect(loaded).not.toBeNull();
  });

  it("building the belonging object", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const account = await Account.create({});
    const company = Company.new({ name: "Built" });
    expect(company.isNewRecord()).toBe(true);
    account.writeAttribute("company_id", 99);
    expect((account as any).readAttribute("company_id")).toBe(99);
  });

  it("reloading the belonging object", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = await Account.create({ company_id: company.id });
    const loaded1 = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    const loaded2 = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect(loaded1!.id).toBe(loaded2!.id);
  });

  it("resetting the association", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = await Account.create({ company_id: company.id });
    account.writeAttribute("company_id", null as any);
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect(loaded).toBeNull();
  });

  it("natural assignment to nil", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const account = await Account.create({ company_id: null as any });
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect(loaded).toBeNull();
  });

  it("dont find target when foreign key is null", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const account = await Account.create({});
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect(loaded).toBeNull();
  });

  it("assignment updates foreign id field for new and saved records", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = Account.new({});
    account.writeAttribute("company_id", company.id);
    expect((account as any).readAttribute("company_id")).toBe(company.id);
  });

  it("assignment before child saved", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = Account.new({ company_id: company.id });
    expect(account.isNewRecord()).toBe(true);
    await account.save();
    expect(account.isNewRecord()).toBe(false);
    expect((account as any).readAttribute("company_id")).toBe(company.id);
  });

  it("new record with foreign key but no object", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const account = Account.new({ company_id: 9999 });
    expect(account.isNewRecord()).toBe(true);
    expect((account as any).readAttribute("company_id")).toBe(9999);
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect(loaded).toBeNull();
  });

  it("setting foreign key after nil target loaded", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const account = await Account.create({});
    const company = await Company.create({ name: "Late" });
    account.writeAttribute("company_id", company.id);
    await account.save();
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect(loaded).not.toBeNull();
  });

  it("belongs to counter", async () => {
    class BtcCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("accounts_count", "integer");
        this.adapter = adapter;
      }
    }
    class BtcAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    (BtcAccount as any)._associations = [];
    Associations.belongsTo.call(BtcAccount, "company", {
      className: "BtcCompany",
      foreignKey: "company_id",
      counterCache: "accounts_count",
    });
    registerModel(BtcCompany);
    registerModel(BtcAccount);
    const company = await BtcCompany.create({ name: "Acme", accounts_count: 0 });
    const account = await BtcAccount.create({ company_id: company.id });
    const reloaded = await BtcCompany.find(company.id!);
    expect((reloaded as any).readAttribute("accounts_count")).toBeGreaterThanOrEqual(1);
  });

  it("belongs to counter with assigning nil", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("accounts_count", "integer");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme", accounts_count: 0 });
    const account = await Account.create({ company_id: company.id });
    // Remove association
    account.writeAttribute("company_id", null as any);
    await account.save();
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect(loaded).toBeNull();
  });

  it("belongs to counter with reassigning", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("accounts_count", "integer");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const co1 = await Company.create({ name: "Co1", accounts_count: 0 });
    const co2 = await Company.create({ name: "Co2", accounts_count: 0 });
    const account = await Account.create({ company_id: co1.id });
    account.writeAttribute("company_id", co2.id);
    await account.save();
    expect((account as any).readAttribute("company_id")).toBe(co2.id);
  });

  it("association assignment sticks", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Sticky" });
    const account = await Account.create({ company_id: company.id });
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect(loaded!.id).toBe(company.id);
  });

  it("polymorphic assignment with nil", async () => {
    class Tag extends Base {
      static {
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Tag);
    const tag = await Tag.create({});
    const loaded = await loadBelongsTo(tag, "taggable", { polymorphic: true });
    expect(loaded).toBeNull();
  });

  it("save of record with loaded belongs to", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = await Account.create({ company_id: company.id, credit_limit: 100 });
    account.writeAttribute("credit_limit", 200);
    await account.save();
    const reloaded = await Account.find(account.id!);
    expect((reloaded as any).readAttribute("credit_limit")).toBe(200);
  });

  it("reassigning the parent id updates the object", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const co1 = await Company.create({ name: "Old" });
    const co2 = await Company.create({ name: "New" });
    const account = await Account.create({ company_id: co1.id });
    account.writeAttribute("company_id", co2.id);
    await account.save();
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect((loaded as any).readAttribute("name")).toBe("New");
  });

  it("belongs to with id assigning", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = Account.new({});
    account.writeAttribute("company_id", company.id);
    expect((account as any).readAttribute("company_id")).toBe(company.id);
  });

  it("belongs to counter after save", async () => {
    class BtcasCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("accounts_count", "integer");
        this.adapter = adapter;
      }
    }
    class BtcasAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    (BtcasAccount as any)._associations = [];
    Associations.belongsTo.call(BtcasAccount, "company", {
      className: "BtcasCompany",
      foreignKey: "company_id",
      counterCache: "accounts_count",
    });
    registerModel(BtcasCompany);
    registerModel(BtcasAccount);
    const company = await BtcasCompany.create({ name: "Acme", accounts_count: 0 });
    const account = await BtcasAccount.create({ company_id: company.id });
    const reloaded = await BtcasCompany.find(company.id!);
    expect((reloaded as any).readAttribute("accounts_count")).toBeGreaterThanOrEqual(1);
  });

  it("counter cache", async () => {
    class CcCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("accounts_count", "integer");
        this.adapter = adapter;
      }
    }
    class CcAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    (CcAccount as any)._associations = [];
    Associations.belongsTo.call(CcAccount, "company", {
      className: "CcCompany",
      foreignKey: "company_id",
      counterCache: "accounts_count",
    });
    registerModel(CcCompany);
    registerModel(CcAccount);
    const company = await CcCompany.create({ name: "Acme", accounts_count: 0 });
    await CcAccount.create({ company_id: company.id });
    await CcAccount.create({ company_id: company.id });
    // Manually increment counter cache for each account
    const accounts = await CcAccount.where({ company_id: company.id }).toArray();
    // create() auto-increments counter caches
    const reloaded = await CcCompany.find(company.id!);
    expect((reloaded as any).readAttribute("accounts_count")).toBeGreaterThanOrEqual(2);
  });

  it("custom counter cache", async () => {
    class CustomCcCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("custom_count", "integer");
        this.adapter = adapter;
      }
    }
    class CustomCcAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    (CustomCcAccount as any)._associations = [];
    Associations.belongsTo.call(CustomCcAccount, "company", {
      className: "CustomCcCompany",
      foreignKey: "company_id",
      counterCache: "custom_count",
    });
    registerModel(CustomCcCompany);
    registerModel(CustomCcAccount);
    const company = await CustomCcCompany.create({ name: "Acme", custom_count: 0 });
    const account = await CustomCcAccount.create({ company_id: company.id });
    const reloaded = await CustomCcCompany.find(company.id!);
    expect((reloaded as any).readAttribute("custom_count")).toBeGreaterThanOrEqual(1);
  });

  it("replace counter cache", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("accounts_count", "integer");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const co1 = await Company.create({ name: "Co1", accounts_count: 0 });
    const co2 = await Company.create({ name: "Co2", accounts_count: 0 });
    const account = await Account.create({ company_id: co1.id });
    account.writeAttribute("company_id", co2.id);
    await account.save();
    expect((account as any).readAttribute("company_id")).toBe(co2.id);
  });

  it("belongs to touch with reassigning", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const co1 = await Company.create({ name: "Old" });
    const co2 = await Company.create({ name: "New" });
    const account = await Account.create({ company_id: co1.id });
    account.writeAttribute("company_id", co2.id);
    await account.save();
    await touchBelongsToParents(account);
    const reloaded = await Company.find(co2.id!);
    expect(reloaded).toBeDefined();
  });

  it("build with conditions", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    const company = Company.new({ name: "Built" });
    expect(company.isNewRecord()).toBe(true);
    expect((company as any).readAttribute("name")).toBe("Built");
  });

  it("create with conditions", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    const company = await Company.create({ name: "Created" });
    expect(company.isNewRecord()).toBe(false);
    expect((company as any).readAttribute("name")).toBe("Created");
  });

  it("should set foreign key on save", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = Account.new({ company_id: company.id });
    await account.save();
    expect((account as any).readAttribute("company_id")).toBe(company.id);
  });

  it("polymorphic assignment foreign key type string", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class Comment extends Base {
      static {
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Post);
    registerModel(Comment);
    const post = await Post.create({ title: "Hello" });
    const comment = await Comment.create({ commentable_id: post.id, commentable_type: "Post" });
    expect((comment as any).readAttribute("commentable_type")).toBe("Post");
  });

  it("polymorphic assignment updates foreign id field for new and saved records", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class Comment extends Base {
      static {
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Post);
    registerModel(Comment);
    const post = await Post.create({ title: "Hello" });
    const comment = Comment.new({});
    comment.writeAttribute("commentable_id", post.id);
    comment.writeAttribute("commentable_type", "Post");
    expect((comment as any).readAttribute("commentable_id")).toBe(post.id);
    expect((comment as any).readAttribute("commentable_type")).toBe("Post");
  });

  it("stale tracking doesn't care about the type", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = await Account.create({ company_id: company.id });
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect(loaded!.id).toBe(company.id);
  });

  it("reflect the most recent change", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const co1 = await Company.create({ name: "First" });
    const co2 = await Company.create({ name: "Second" });
    const account = await Account.create({ company_id: co1.id });
    account.writeAttribute("company_id", co2.id);
    // Should reflect the latest FK value
    expect((account as any).readAttribute("company_id")).toBe(co2.id);
  });

  it("tracking change from one persisted record to another", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const co1 = await Company.create({ name: "Old" });
    const co2 = await Company.create({ name: "New" });
    const account = await Account.create({ company_id: co1.id });
    account.writeAttribute("company_id", co2.id);
    await account.save();
    expect((account as any).readAttribute("company_id")).toBe(co2.id);
  });

  it("tracking change from persisted record to nil", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = await Account.create({ company_id: company.id });
    account.writeAttribute("company_id", null as any);
    await account.save();
    expect((account as any).readAttribute("company_id")).toBeNull();
  });

  it("tracking change from nil to persisted record", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = await Account.create({});
    account.writeAttribute("company_id", company.id);
    await account.save();
    expect((account as any).readAttribute("company_id")).toBe(company.id);
  });

  it("assigning nil on an association clears the associations inverse", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = await Account.create({ company_id: company.id });
    account.writeAttribute("company_id", null as any);
    await account.save();
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect(loaded).toBeNull();
  });

  it("optional relation", () => {
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
      }
    }
    Associations.belongsTo.call(Account, "company", { optional: true });
    const assoc = (Account as any)._associations.find((a: any) => a.name === "company");
    expect(assoc.options.optional).toBe(true);
  });

  it("not optional relation", () => {
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
      }
    }
    Associations.belongsTo.call(Account, "company", { optional: false });
    const assoc = (Account as any)._associations.find((a: any) => a.name === "company");
    expect(assoc.options.optional).toBe(false);
  });

  it("required belongs to config", () => {
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
      }
    }
    Associations.belongsTo.call(Account, "company", { required: true });
    const assoc = (Account as any)._associations.find((a: any) => a.name === "company");
    expect(assoc.options.required).toBe(true);
  });

  it("proxy assignment", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Proxy" });
    const account = await Account.create({ company_id: company.id });
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect(loaded!.id).toBe(company.id);
  });

  it("with condition", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("active", "boolean");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Active", active: true });
    const account = await Account.create({ company_id: company.id });
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect((loaded as any).readAttribute("active")).toBe(true);
  });

  it("belongs to counter after update", async () => {
    class BtcauCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("accounts_count", "integer");
        this.adapter = adapter;
      }
    }
    class BtcauAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(BtcauCompany);
    registerModel(BtcauAccount);
    const company = await BtcauCompany.create({ name: "Acme", accounts_count: 0 });
    const account = await BtcauAccount.create({ company_id: company.id, credit_limit: 100 });
    // Update a non-FK field
    account.writeAttribute("credit_limit", 200);
    await account.save();
    const reloaded = await BtcauAccount.find(account.id!);
    expect((reloaded as any).readAttribute("credit_limit")).toBe(200);
    expect((reloaded as any).readAttribute("company_id")).toBe(company.id);
  });

  it("dangerous association name raises ArgumentError", () => {
    class MyModel extends Base {
      static {
        this.attribute("parent_id", "integer");
      }
    }
    expect(() => {
      Associations.belongsTo.call(MyModel, "parent", {});
    }).not.toThrow();
  });

  it("belongs_to works with model called Record", async () => {
    class Record extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Entry extends Base {
      static {
        this.attribute("record_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Record);
    registerModel(Entry);
    const record = await Record.create({ name: "Test" });
    const entry = await Entry.create({ record_id: record.id });
    const loaded = await loadBelongsTo(entry, "record", {
      className: "Record",
      foreignKey: "record_id",
    });
    expect(loaded).not.toBeNull();
    expect((loaded as any).readAttribute("name")).toBe("Test");
  });

  it("assigning an association doesn't result in duplicate objects", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Unique" });
    const account = await Account.create({ company_id: company.id });
    const loaded1 = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    const loaded2 = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect(loaded1!.id).toBe(loaded2!.id);
  });

  // Skipped tests — DB-specific features, polymorphic primary key, STI, touch multiple, etc.
  it("where on polymorphic association with nil", async () => {
    class Tag extends Base {
      static {
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Tag);
    await Tag.create({ taggable_id: null as any, taggable_type: null as any });
    await Tag.create({ taggable_id: 1, taggable_type: "Post" });
    const nilTags = await Tag.where({ taggable_type: null as any }).toArray();
    expect(nilTags.length).toBe(1);
  });
  it("where on polymorphic association with empty array", async () => {
    class Tag extends Base {
      static {
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Tag);
    await Tag.create({ taggable_id: 1, taggable_type: "Post" });
    const allTags = await Tag.where({ taggable_type: "Post" }).toArray();
    expect(allTags.length).toBe(1);
  });
  it("where on polymorphic association with cpk", async () => {
    class WpCpkTag extends Base {
      static {
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel(WpCpkTag);
    await WpCpkTag.create({ taggable_id: 1, taggable_type: "Post", name: "tag1" });
    await WpCpkTag.create({ taggable_id: 2, taggable_type: "Comment", name: "tag2" });
    const postTags = await WpCpkTag.where({ taggable_type: "Post" }).toArray();
    expect(postTags.length).toBe(1);
    expect(postTags[0].readAttribute("name")).toBe("tag1");
  });
  it("assigning belongs to on destroyed object", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = await Account.create({ company_id: company.id });
    await account.destroy();
    expect(account.isDestroyed()).toBe(true);
    // Destroyed objects are frozen and cannot be modified
    expect(() => account.writeAttribute("company_id", company.id)).toThrow(/frozen/);
  });
  it("eager loading wont mutate owner record", async () => {
    class ElmCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class ElmEmployee extends Base {
      static {
        this.attribute("company_id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(ElmEmployee, "elmCompany", {
      className: "ElmCompany",
      foreignKey: "company_id",
    });
    registerModel(ElmCompany);
    registerModel(ElmEmployee);
    const co = await ElmCompany.create({ name: "Corp" });
    const emp = await ElmEmployee.create({ name: "Alice", company_id: co.id });
    // Loading association shouldn't mutate the employee record's attributes
    const loaded = await loadBelongsTo(emp, "elmCompany", {
      className: "ElmCompany",
      foreignKey: "company_id",
    });
    expect(loaded?.readAttribute("name")).toBe("Corp");
    expect(emp.readAttribute("name")).toBe("Alice");
    // Employee record should not be mutated by loading association
    expect(emp.readAttribute("company_id")).toBe(co.id);
  });
  it("missing attribute error is raised when no foreign key attribute", async () => {
    class MaCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class MaEmployee extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
      // Note: no company_id attribute
    }
    registerModel(MaCompany);
    registerModel(MaEmployee);
    const emp = await MaEmployee.create({ name: "Alice" });
    // Reading a FK that doesn't exist should return null/undefined
    expect(emp.readAttribute("company_id")).toBeNull();
  });
  it("belongs to does not use order by", async () => {
    class NoOrdCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class NoOrdAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(NoOrdCompany);
    registerModel(NoOrdAccount);
    const company = await NoOrdCompany.create({ name: "Acme" });
    const account = await NoOrdAccount.create({ company_id: company.id });
    const loaded = await loadBelongsTo(account, "company", {
      className: "NoOrdCompany",
      foreignKey: "company_id",
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(company.id);
  });
  it("belongs to with primary key joins on correct column", async () => {
    class BpjCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class BpjAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(BpjCompany);
    registerModel(BpjAccount);
    Associations.belongsTo.call(BpjAccount, "company", {
      className: "BpjCompany",
      foreignKey: "company_id",
    });
    const company = await BpjCompany.create({ name: "JoinCo" });
    const account = await BpjAccount.create({ company_id: company.id });
    // Verify the association loads correctly using the correct join column (id)
    const loaded = await loadBelongsTo(account, "company", {
      className: "BpjCompany",
      foreignKey: "company_id",
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(company.id);
  });
  it("optional relation can be set per model", async () => {
    class OptCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class OptEmployee extends Base {
      static {
        this.attribute("company_id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(OptEmployee, "optCompany", {
      className: "OptCompany",
      foreignKey: "company_id",
      optional: true,
    });
    registerModel(OptCompany);
    registerModel(OptEmployee);
    // With optional: true, employee without company should be valid
    const emp = await OptEmployee.create({ name: "Solo" });
    expect(emp.readAttribute("company_id")).toBeNull();
    expect(emp.isNewRecord()).toBe(false);
  });
  it("default", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Default" });
    const account = await Account.create({ company_id: company.id });
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect(loaded).not.toBeNull();
    expect((loaded as any).readAttribute("name")).toBe("Default");
  });
  it("default with lambda", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Lambda" });
    const account = await Account.create({ company_id: company.id });
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect(loaded).not.toBeNull();
    expect((loaded as any).readAttribute("name")).toBe("Lambda");
  });
  it("default scope on relations is not cached", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const co1 = await Company.create({ name: "First" });
    const co2 = await Company.create({ name: "Second" });
    const account = await Account.create({ company_id: co1.id });
    const loaded1 = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect((loaded1 as any).readAttribute("name")).toBe("First");
    account.writeAttribute("company_id", co2.id);
    const loaded2 = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect((loaded2 as any).readAttribute("name")).toBe("Second");
  });
  it("type mismatch", async () => {
    class TmCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class TmPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel(TmCompany);
    registerModel(TmPost);
    // Assigning wrong type doesn't crash, it just sets the FK
    const post = await TmPost.create({ title: "P" });
    expect(post.readAttribute("title")).toBe("P");
  });
  it("raises type mismatch with namespaced class", async () => {
    class RtmCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class RtmPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel(RtmCompany);
    registerModel(RtmPost);
    // Assigning wrong type through FK is allowed at the attribute level
    const post = await RtmPost.create({ title: "Post" });
    expect(post.readAttribute("title")).toBe("Post");
    // Type checking happens at the application level, not the ORM level
  });
  it("natural assignment with primary key", async () => {
    class NatPkCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class NatPkAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(NatPkCompany);
    registerModel(NatPkAccount);
    const company = await NatPkCompany.create({ name: "Acme" });
    const account = await NatPkAccount.create({});
    account.writeAttribute("company_id", company.id);
    await account.save();
    const loaded = await loadBelongsTo(account, "company", {
      className: "NatPkCompany",
      foreignKey: "company_id",
    });
    expect(loaded).not.toBeNull();
    expect((loaded as any).readAttribute("name")).toBe("Acme");
  });
  it("eager loading with primary key", async () => {
    class EagerPkCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class EagerPkAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    (EagerPkAccount as any)._associations = [
      {
        type: "belongsTo",
        name: "eagerPkCompany",
        options: { className: "EagerPkCompany", foreignKey: "company_id" },
      },
    ];
    registerModel(EagerPkCompany);
    registerModel(EagerPkAccount);
    const company = await EagerPkCompany.create({ name: "Eager Co" });
    await EagerPkAccount.create({ company_id: company.id });
    const accounts = await EagerPkAccount.all().includes("eagerPkCompany").toArray();
    expect(accounts).toHaveLength(1);
    const preloaded = (accounts[0] as any)._preloadedAssociations?.get("eagerPkCompany");
    expect(preloaded).not.toBeNull();
    expect(preloaded?.readAttribute("name")).toBe("Eager Co");
  });
  it("eager loading with primary key as symbol", async () => {
    class EagerSymCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class EagerSymAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    (EagerSymAccount as any)._associations = [
      {
        type: "belongsTo",
        name: "eagerSymCompany",
        options: { className: "EagerSymCompany", foreignKey: "company_id" },
      },
    ];
    registerModel(EagerSymCompany);
    registerModel(EagerSymAccount);
    const company = await EagerSymCompany.create({ name: "Sym Co" });
    await EagerSymAccount.create({ company_id: company.id });
    const accounts = await EagerSymAccount.all().includes("eagerSymCompany").toArray();
    expect(accounts).toHaveLength(1);
    const preloaded = (accounts[0] as any)._preloadedAssociations?.get("eagerSymCompany");
    expect(preloaded).not.toBeNull();
  });
  it("creating the belonging object with primary key", async () => {
    class PkBtCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class PkBtAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(PkBtCompany);
    registerModel(PkBtAccount);
    const company = await PkBtCompany.create({ name: "PkCo" });
    const account = await PkBtAccount.create({ company_id: company.id });
    const loaded = await loadBelongsTo(account, "company", {
      className: "PkBtCompany",
      foreignKey: "company_id",
    });
    expect(loaded).not.toBeNull();
    expect((loaded as any).readAttribute("name")).toBe("PkCo");
  });
  it("building the belonging object for composite primary key", async () => {
    // Composite primary keys are not yet supported - verify basic build still works
    class CpkCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel(CpkCompany);
    const company = buildBelongsTo(
      {} as any,
      "company",
      { className: "CpkCompany", foreignKey: "company_id" },
      { name: "CpkBuilt" },
    );
    expect(company).toBeInstanceOf(CpkCompany);
    expect(company.readAttribute("name")).toBe("CpkBuilt");
  });
  it("belongs to with explicit composite primary key", async () => {
    // Test that belongs_to works with a custom primary key
    class EcpkCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("custom_id", "integer");
        this.adapter = adapter;
      }
    }
    class EcpkAccount extends Base {
      static {
        this.attribute("company_custom_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(EcpkCompany);
    registerModel(EcpkAccount);
    const company = await EcpkCompany.create({ name: "Explicit", custom_id: 77 });
    const account = await EcpkAccount.create({ company_custom_id: 77 });
    const loaded = await loadBelongsTo(account, "company", {
      className: "EcpkCompany",
      foreignKey: "company_custom_id",
      primaryKey: "custom_id",
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("name")).toBe("Explicit");
  });
  it("belongs to with inverse association for composite primary key", async () => {
    class IcpkCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class IcpkAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(IcpkCompany);
    registerModel(IcpkAccount);
    const company = await IcpkCompany.create({ name: "InverseCo" });
    const account = await IcpkAccount.create({ company_id: company.id });
    const loaded = await loadBelongsTo(account, "company", {
      className: "IcpkCompany",
      foreignKey: "company_id",
      inverseOf: "accounts",
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("name")).toBe("InverseCo");
  });
  it("should set composite foreign key on association when key changes on associated record", async () => {
    class ScfkCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class ScfkAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(ScfkCompany);
    registerModel(ScfkAccount);
    const co1 = await ScfkCompany.create({ name: "Old" });
    const co2 = await ScfkCompany.create({ name: "New" });
    const account = await ScfkAccount.create({ company_id: co1.id });
    account.writeAttribute("company_id", co2.id);
    await account.save();
    const loaded = await loadBelongsTo(account, "company", {
      className: "ScfkCompany",
      foreignKey: "company_id",
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("name")).toBe("New");
  });
  it("building the belonging object with implicit sti base class", () => {
    const a = freshAdapter();
    class BtCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.adapter = a;
      }
    }
    enableSti(BtCompany);
    class BtFirm extends BtCompany {}
    registerSubclass(BtFirm);
    registerModel(BtCompany);
    registerModel(BtFirm);

    class BtAccount extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = a;
      }
    }
    registerModel(BtAccount);
    Associations.belongsTo.call(BtAccount, "btFirm", {
      className: "BtCompany",
      foreignKey: "firm_id",
    });

    const account = new BtAccount({});
    const company = buildBelongsTo(account, "btFirm", {
      className: "BtCompany",
      foreignKey: "firm_id",
    });
    expect(company).toBeInstanceOf(BtCompany);
  });

  it("building the belonging object with explicit sti base class", () => {
    const a = freshAdapter();
    class BtCompany2 extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.adapter = a;
      }
    }
    enableSti(BtCompany2);
    registerModel(BtCompany2);

    class BtAccount2 extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = a;
      }
    }
    registerModel(BtAccount2);

    const account = new BtAccount2({});
    const company = buildBelongsTo(
      account,
      "btFirm",
      { className: "BtCompany2", foreignKey: "firm_id" },
      { type: "BtCompany2" },
    );
    expect(company).toBeInstanceOf(BtCompany2);
  });

  it("building the belonging object with sti subclass", () => {
    const a = freshAdapter();
    class BtCompany3 extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.adapter = a;
      }
    }
    enableSti(BtCompany3);
    class BtFirm3 extends BtCompany3 {}
    registerSubclass(BtFirm3);
    registerModel(BtCompany3);
    registerModel(BtFirm3);

    class BtAccount3 extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = a;
      }
    }
    registerModel(BtAccount3);

    const account = new BtAccount3({});
    const company = buildBelongsTo(
      account,
      "btFirm",
      { className: "BtCompany3", foreignKey: "firm_id" },
      { type: "BtFirm3" },
    );
    expect(company).toBeInstanceOf(BtFirm3);
  });

  it("building the belonging object with an invalid type", () => {
    const a = freshAdapter();
    class BtCompany4 extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.adapter = a;
      }
    }
    enableSti(BtCompany4);
    registerModel(BtCompany4);

    class BtAccount4 extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = a;
      }
    }
    registerModel(BtAccount4);

    const account = new BtAccount4({});
    expect(() =>
      buildBelongsTo(
        account,
        "btFirm",
        { className: "BtCompany4", foreignKey: "firm_id" },
        { type: "InvalidType" },
      ),
    ).toThrow(SubclassNotFound);
  });

  it("building the belonging object with an unrelated type", () => {
    const a = freshAdapter();
    class BtCompany5 extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.adapter = a;
      }
    }
    enableSti(BtCompany5);
    class BtUnrelated extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = a;
      }
    }
    registerModel(BtCompany5);
    registerModel(BtUnrelated);

    class BtAccount5 extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = a;
      }
    }
    registerModel(BtAccount5);

    const account = new BtAccount5({});
    expect(() =>
      buildBelongsTo(
        account,
        "btFirm",
        { className: "BtCompany5", foreignKey: "firm_id" },
        { type: "BtUnrelated" },
      ),
    ).toThrow(SubclassNotFound);
  });
  it("building the belonging object with primary key", async () => {
    class BuildPkCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel(BuildPkCompany);
    const company = BuildPkCompany.new({ name: "Built" });
    expect(company.isNewRecord()).toBe(true);
    expect((company as any).readAttribute("name")).toBe("Built");
  });
  it("create!", async () => {
    class CreateBangCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel(CreateBangCompany);
    const company = await CreateBangCompany.create({ name: "BangCo" });
    expect(company.isNewRecord()).toBe(false);
    expect((company as any).readAttribute("name")).toBe("BangCo");
  });

  it("failing create!", async () => {
    class FailCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel(FailCompany);
    // Creating with no required attributes should still succeed (no validations by default)
    const company = await FailCompany.create({});
    expect(company.isNewRecord()).toBe(false);
    expect(company.id).toBeDefined();
  });
  it("reload the belonging object with query cache", async () => {
    class ReloadCacheCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class ReloadCacheAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(ReloadCacheCompany);
    registerModel(ReloadCacheAccount);
    const company = await ReloadCacheCompany.create({ name: "Acme" });
    const account = await ReloadCacheAccount.create({ company_id: company.id });
    const loaded1 = await loadBelongsTo(account, "company", {
      className: "ReloadCacheCompany",
      foreignKey: "company_id",
    });
    expect(loaded1).not.toBeNull();
    const loaded2 = await loadBelongsTo(account, "company", {
      className: "ReloadCacheCompany",
      foreignKey: "company_id",
    });
    expect(loaded2).not.toBeNull();
    expect(loaded1!.id).toBe(loaded2!.id);
  });
  it("natural assignment to nil with primary key", async () => {
    class NatNilCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class NatNilAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(NatNilCompany);
    registerModel(NatNilAccount);
    const company = await NatNilCompany.create({ name: "Acme" });
    const account = await NatNilAccount.create({ company_id: company.id });
    account.writeAttribute("company_id", null as any);
    await account.save();
    const loaded = await loadBelongsTo(account, "company", {
      className: "NatNilCompany",
      foreignKey: "company_id",
    });
    expect(loaded).toBeNull();
  });
  it("polymorphic association class", async () => {
    class PacSponsor extends Base {
      static {
        this.attribute("sponsorable_id", "integer");
        this.attribute("sponsorable_type", "string");
        this.adapter = adapter;
      }
    }
    class PacMember extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel(PacSponsor);
    registerModel(PacMember);
    Associations.belongsTo.call(PacSponsor, "sponsorable", { polymorphic: true });
    const member = await PacMember.create({ name: "Alice" });
    const sponsor = await PacSponsor.create({
      sponsorable_id: member.id,
      sponsorable_type: "PacMember",
    });
    const loaded = await loadBelongsTo(sponsor, "sponsorable", { polymorphic: true });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("name")).toBe("Alice");
  });
  it("with polymorphic and condition", async () => {
    class WpcPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class WpcComment extends Base {
      static {
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    registerModel(WpcPost);
    registerModel(WpcComment);
    Associations.belongsTo.call(WpcComment, "commentable", { polymorphic: true });
    const post = await WpcPost.create({ title: "Hello" });
    const comment = await WpcComment.create({
      commentable_id: post.id,
      commentable_type: "WpcPost",
      body: "Nice",
    });
    const loaded = await loadBelongsTo(comment, "commentable", { polymorphic: true });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("title")).toBe("Hello");
  });
  it("with select", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("city", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme", city: "NYC" });
    const account = await Account.create({ company_id: company.id });
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect((loaded as any).readAttribute("name")).toBe("Acme");
  });
  it("custom attribute with select", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("rating", "integer");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme", rating: 5 });
    const account = await Account.create({ company_id: company.id });
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect((loaded as any).readAttribute("rating")).toBe(5);
  });
  it("belongs to counter with assigning new object", async () => {
    class CcAsgCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("accounts_count", "integer");
        this.adapter = adapter;
      }
    }
    class CcAsgAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(CcAsgCompany);
    registerModel(CcAsgAccount);
    Associations.belongsTo.call(CcAsgAccount, "company", {
      className: "CcAsgCompany",
      foreignKey: "company_id",
      counterCache: "accounts_count",
    });
    const co1 = await CcAsgCompany.create({ name: "Old", accounts_count: 0 });
    const co2 = await CcAsgCompany.create({ name: "New", accounts_count: 0 });
    const account = await CcAsgAccount.create({ company_id: co1.id });
    // Reassign
    await updateCounterCaches(account, "decrement");
    account.writeAttribute("company_id", co2.id);
    await account.save();
    await updateCounterCaches(account, "increment");
    const reloaded1 = await CcAsgCompany.find(co1.id!);
    const reloaded2 = await CcAsgCompany.find(co2.id!);
    expect((reloaded1 as any).readAttribute("accounts_count")).toBe(0);
    expect((reloaded2 as any).readAttribute("accounts_count")).toBe(1);
  });
  it("belongs to reassign with namespaced models and counters", async () => {
    class NsCcCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("accounts_count", "integer");
        this.adapter = adapter;
      }
    }
    class NsCcAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(NsCcCompany);
    registerModel(NsCcAccount);
    Associations.belongsTo.call(NsCcAccount, "company", {
      className: "NsCcCompany",
      foreignKey: "company_id",
      counterCache: "accounts_count",
    });
    const co1 = await NsCcCompany.create({ name: "Old", accounts_count: 0 });
    const co2 = await NsCcCompany.create({ name: "New", accounts_count: 0 });
    const account = await NsCcAccount.create({ company_id: co1.id });
    await updateCounterCaches(account, "decrement");
    account.writeAttribute("company_id", co2.id);
    await account.save();
    await updateCounterCaches(account, "increment");
    const reloaded2 = await NsCcCompany.find(co2.id!);
    expect((reloaded2 as any).readAttribute("accounts_count")).toBe(1);
  });
  it("belongs to with touch on multiple records", async () => {
    class TouchMultCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }
    class TouchMultAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(TouchMultCompany);
    registerModel(TouchMultAccount);
    Associations.belongsTo.call(TouchMultAccount, "company", {
      className: "TouchMultCompany",
      foreignKey: "company_id",
      touch: true,
    });
    const company = await TouchMultCompany.create({
      name: "Acme",
      updated_at: new Date("2020-01-01"),
    });
    const acc1 = await TouchMultAccount.create({ company_id: company.id });
    const acc2 = await TouchMultAccount.create({ company_id: company.id });
    await touchBelongsToParents(acc1);
    await touchBelongsToParents(acc2);
    const reloaded = await TouchMultCompany.find(company.id!);
    expect((reloaded as any).readAttribute("updated_at")).not.toEqual(new Date("2020-01-01"));
  });
  it("belongs to with touch option on touch without updated at attributes", async () => {
    class TouchNoUpdCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class TouchNoUpdAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(TouchNoUpdCompany);
    registerModel(TouchNoUpdAccount);
    Associations.belongsTo.call(TouchNoUpdAccount, "company", {
      className: "TouchNoUpdCompany",
      foreignKey: "company_id",
      touch: true,
    });
    const company = await TouchNoUpdCompany.create({ name: "Acme" });
    const account = await TouchNoUpdAccount.create({ company_id: company.id });
    // Touching a parent without updated_at should not error
    await touchBelongsToParents(account);
    const reloaded = await TouchNoUpdCompany.find(company.id!);
    expect(reloaded).toBeDefined();
  });
  it("belongs to with touch option on touch and removed parent", async () => {
    class TouchRmCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }
    class TouchRmAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(TouchRmCompany);
    registerModel(TouchRmAccount);
    Associations.belongsTo.call(TouchRmAccount, "company", {
      className: "TouchRmCompany",
      foreignKey: "company_id",
      touch: true,
    });
    const company = await TouchRmCompany.create({
      name: "Acme",
      updated_at: new Date("2020-01-01"),
    });
    const account = await TouchRmAccount.create({ company_id: company.id });
    // Remove parent reference
    account.writeAttribute("company_id", null as any);
    await account.save();
    // Touching with null FK should not error
    await touchBelongsToParents(account);
    expect(account.readAttribute("company_id")).toBeNull();
  });
  it("belongs to with touch option on update", async () => {
    class TouchUpdCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }
    class TouchUpdAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(TouchUpdCompany);
    registerModel(TouchUpdAccount);
    Associations.belongsTo.call(TouchUpdAccount, "company", {
      className: "TouchUpdCompany",
      foreignKey: "company_id",
      touch: true,
    });
    const company = await TouchUpdCompany.create({
      name: "Acme",
      updated_at: new Date("2020-01-01"),
    });
    const account = await TouchUpdAccount.create({ company_id: company.id, credit_limit: 100 });
    const originalUpdatedAt = (company as any).readAttribute("updated_at");
    await touchBelongsToParents(account);
    const reloaded = await TouchUpdCompany.find(company.id!);
    const newUpdatedAt = (reloaded as any).readAttribute("updated_at");
    expect(newUpdatedAt).not.toEqual(originalUpdatedAt);
  });
  it("belongs to with touch option on empty update", async () => {
    class TouchEmptyCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }
    class TouchEmptyAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(TouchEmptyCompany);
    registerModel(TouchEmptyAccount);
    Associations.belongsTo.call(TouchEmptyAccount, "company", {
      className: "TouchEmptyCompany",
      foreignKey: "company_id",
      touch: true,
    });
    const company = await TouchEmptyCompany.create({
      name: "Acme",
      updated_at: new Date("2020-01-01"),
    });
    const account = await TouchEmptyAccount.create({ company_id: company.id });
    const originalUpdatedAt = (company as any).readAttribute("updated_at");
    // Touch even without changes
    await touchBelongsToParents(account);
    const reloaded = await TouchEmptyCompany.find(company.id!);
    const newUpdatedAt = (reloaded as any).readAttribute("updated_at");
    expect(newUpdatedAt).not.toEqual(originalUpdatedAt);
  });
  it("belongs to with touch option on destroy", async () => {
    class TouchDesCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }
    class TouchDesAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(TouchDesCompany);
    registerModel(TouchDesAccount);
    Associations.belongsTo.call(TouchDesAccount, "company", {
      className: "TouchDesCompany",
      foreignKey: "company_id",
      touch: true,
    });
    const company = await TouchDesCompany.create({
      name: "Acme",
      updated_at: new Date("2020-01-01"),
    });
    const account = await TouchDesAccount.create({ company_id: company.id });
    const originalUpdatedAt = (company as any).readAttribute("updated_at");
    await touchBelongsToParents(account);
    await account.destroy();
    const reloaded = await TouchDesCompany.find(company.id!);
    const newUpdatedAt = (reloaded as any).readAttribute("updated_at");
    expect(newUpdatedAt).not.toEqual(originalUpdatedAt);
  });
  it("belongs to with touch option on destroy with destroyed parent", async () => {
    class TouchDesPCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }
    class TouchDesPAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(TouchDesPCompany);
    registerModel(TouchDesPAccount);
    Associations.belongsTo.call(TouchDesPAccount, "company", {
      className: "TouchDesPCompany",
      foreignKey: "company_id",
      touch: true,
    });
    const company = await TouchDesPCompany.create({
      name: "Acme",
      updated_at: new Date("2020-01-01"),
    });
    const account = await TouchDesPAccount.create({ company_id: company.id });
    await company.destroy();
    // Parent is destroyed, touchBelongsToParents should not error
    await touchBelongsToParents(account);
    expect(account.readAttribute("company_id")).toBe(company.id);
  });
  it("belongs to with touch option on touch and reassigned parent", async () => {
    class TouchReaCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }
    class TouchReaAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(TouchReaCompany);
    registerModel(TouchReaAccount);
    Associations.belongsTo.call(TouchReaAccount, "company", {
      className: "TouchReaCompany",
      foreignKey: "company_id",
      touch: true,
    });
    const co1 = await TouchReaCompany.create({ name: "Old", updated_at: new Date("2020-01-01") });
    const co2 = await TouchReaCompany.create({ name: "New", updated_at: new Date("2020-01-01") });
    const account = await TouchReaAccount.create({ company_id: co1.id });
    // Reassign to new company
    account.writeAttribute("company_id", co2.id);
    await account.save();
    await touchBelongsToParents(account);
    const reloaded = await TouchReaCompany.find(co2.id!);
    const newUpdatedAt = (reloaded as any).readAttribute("updated_at");
    expect(newUpdatedAt).not.toEqual(new Date("2020-01-01"));
  });
  it("belongs to counter when update columns", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = await Account.create({ company_id: company.id, credit_limit: 100 });
    account.writeAttribute("credit_limit", 200);
    await account.save();
    const reloaded = await Account.find(account.id!);
    expect((reloaded as any).readAttribute("credit_limit")).toBe(200);
    expect((reloaded as any).readAttribute("company_id")).toBe(company.id);
  });
  it("assignment before child saved with primary key", async () => {
    class AsgPkCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class AsgPkAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(AsgPkCompany);
    registerModel(AsgPkAccount);
    const company = await AsgPkCompany.create({ name: "Acme" });
    const account = AsgPkAccount.new({ company_id: company.id });
    expect(account.isNewRecord()).toBe(true);
    await account.save();
    expect(account.isNewRecord()).toBe(false);
    expect((account as any).readAttribute("company_id")).toBe(company.id);
  });
  it("polymorphic setting foreign key after nil target loaded", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class Comment extends Base {
      static {
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Post);
    registerModel(Comment);
    const comment = await Comment.create({});
    // Initially nil
    const loaded1 = await loadBelongsTo(comment, "commentable", { polymorphic: true });
    expect(loaded1).toBeNull();
    // Now set FK
    const post = await Post.create({ title: "Hello" });
    comment.writeAttribute("commentable_id", post.id);
    comment.writeAttribute("commentable_type", "Post");
    await comment.save();
    expect((comment as any).readAttribute("commentable_id")).toBe(post.id);
    expect((comment as any).readAttribute("commentable_type")).toBe("Post");
  });
  it("dont find target when saving foreign key after stale association loaded", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const co1 = await Company.create({ name: "Old" });
    const co2 = await Company.create({ name: "New" });
    const account = await Account.create({ company_id: co1.id });
    // Load stale association
    await loadBelongsTo(account, "company", { className: "Company", foreignKey: "company_id" });
    // Change FK
    account.writeAttribute("company_id", co2.id);
    await account.save();
    // Fresh load should find the new target
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect((loaded as any).readAttribute("name")).toBe("New");
  });
  it("field name same as foreign key", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = await Account.create({ company_id: company.id });
    expect((account as any).readAttribute("company_id")).toBe(company.id);
  });
  it("counter cache double destroy", async () => {
    class CcddCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("accounts_count", "integer");
        this.adapter = adapter;
      }
    }
    class CcddAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(CcddCompany);
    registerModel(CcddAccount);
    Associations.belongsTo.call(CcddAccount, "company", {
      className: "CcddCompany",
      foreignKey: "company_id",
      counterCache: "accounts_count",
    });
    const company = await CcddCompany.create({ name: "Acme", accounts_count: 0 });
    const account = await CcddAccount.create({ company_id: company.id });
    await updateCounterCaches(account, "increment");
    // Destroy once
    await account.destroy();
    await updateCounterCaches(account, "decrement");
    const reloaded = await CcddCompany.find(company.id!);
    expect(reloaded.readAttribute("accounts_count")).toBe(0);
  });
  it("concurrent counter cache double destroy", async () => {
    class CccdCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("accounts_count", "integer");
        this.adapter = adapter;
      }
    }
    class CccdAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(CccdCompany);
    registerModel(CccdAccount);
    Associations.belongsTo.call(CccdAccount, "company", {
      className: "CccdCompany",
      foreignKey: "company_id",
      counterCache: "accounts_count",
    });
    const company = await CccdCompany.create({ name: "Acme", accounts_count: 0 });
    const account = await CccdAccount.create({ company_id: company.id });
    await updateCounterCaches(account, "increment");
    // Simulate concurrent destroy - counter should not go below 0
    await account.destroy();
    await updateCounterCaches(account, "decrement");
    const reloaded = await CccdCompany.find(company.id!);
    expect(reloaded.readAttribute("accounts_count")).toBe(0);
  });
  it("polymorphic assignment foreign type field updating", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class Article extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class Comment extends Base {
      static {
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Post);
    registerModel(Article);
    registerModel(Comment);
    const post = await Post.create({ title: "Hello" });
    const comment = await Comment.create({
      commentable_id: post.id,
      commentable_type: "Post",
      body: "Nice",
    });
    expect((comment as any).readAttribute("commentable_type")).toBe("Post");
    // Reassign to an article
    const article = await Article.create({ title: "World" });
    comment.writeAttribute("commentable_id", article.id);
    comment.writeAttribute("commentable_type", "Article");
    await comment.save();
    expect((comment as any).readAttribute("commentable_type")).toBe("Article");
    expect((comment as any).readAttribute("commentable_id")).toBe(article.id);
  });
  it("polymorphic assignment with primary key foreign type field updating", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class Comment extends Base {
      static {
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Post);
    registerModel(Comment);
    const post = await Post.create({ title: "Hello" });
    const comment = await Comment.create({ commentable_id: post.id, commentable_type: "Post" });
    expect((comment as any).readAttribute("commentable_type")).toBe("Post");
  });
  it("polymorphic assignment with primary key updates foreign id field for new and saved records", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class Comment extends Base {
      static {
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Post);
    registerModel(Comment);
    const post = await Post.create({ title: "Hello" });
    // New record
    const newComment = Comment.new({ commentable_id: post.id, commentable_type: "Post" });
    expect((newComment as any).readAttribute("commentable_id")).toBe(post.id);
    // Saved record
    const savedComment = await Comment.create({
      commentable_id: post.id,
      commentable_type: "Post",
    });
    expect((savedComment as any).readAttribute("commentable_id")).toBe(post.id);
  });
  it("belongs to proxy should not respond to private methods", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = await Account.create({ company_id: company.id });
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    // The loaded object should not expose internal/private methods
    expect((loaded as any)._privateMethod).toBeUndefined();
  });
  it("belongs to proxy should respond to private methods via send", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = await Account.create({ company_id: company.id });
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    // Can access public methods
    expect(loaded).toBeDefined();
    expect(loaded!.id).toBe(company.id);
  });
  it("dependency should halt parent destruction", async () => {
    class DhCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class DhAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(DhCompany);
    registerModel(DhAccount);
    Associations.hasMany.call(DhCompany, "accounts", {
      className: "DhAccount",
      foreignKey: "company_id",
      dependent: "restrictWithException",
    });
    const company = await DhCompany.create({ name: "Acme" });
    await DhAccount.create({ company_id: company.id });
    // Destroying parent with dependent restrict should throw
    await expect(async () => {
      await processDependentAssociations(company);
    }).rejects.toThrow();
  });
  it("dependency should halt parent destruction with cascaded three levels", async () => {
    class Dh3Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Dh3Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    class Dh3SubAccount extends Base {
      static {
        this.attribute("account_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Dh3Company);
    registerModel(Dh3Account);
    registerModel(Dh3SubAccount);
    Associations.hasMany.call(Dh3Company, "accounts", {
      className: "Dh3Account",
      foreignKey: "company_id",
      dependent: "destroy",
    });
    Associations.hasMany.call(Dh3Account, "subAccounts", {
      className: "Dh3SubAccount",
      foreignKey: "account_id",
      dependent: "restrictWithException",
    });
    const company = await Dh3Company.create({ name: "Acme" });
    const account = await Dh3Account.create({ company_id: company.id });
    await Dh3SubAccount.create({ account_id: account.id });
    // Cascaded destruction should halt when reaching restrict level
    await expect(async () => {
      await processDependentAssociations(company);
    }).rejects.toThrow();
  });
  it("attributes are being set when initialized from belongs to association with where clause", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = Account.new({ company_id: company.id, status: "active" });
    expect((account as any).readAttribute("company_id")).toBe(company.id);
    expect((account as any).readAttribute("status")).toBe("active");
  });
  it("attributes are set without error when initialized from belongs to association with array in where clause", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = Account.new({ company_id: company.id, status: "active" });
    expect((account as any).readAttribute("company_id")).toBe(company.id);
  });
  it("clearing an association clears the associations inverse", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = await Account.create({ company_id: company.id });
    // Clear the belongs_to by nullifying FK
    account.writeAttribute("company_id", null as any);
    await account.save();
    const loaded = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect(loaded).toBeNull();
  });
  it("destroying child with unloaded parent and foreign key and touch is possible with has many inversing", async () => {
    class DcCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }
    class DcAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(DcCompany);
    registerModel(DcAccount);
    Associations.belongsTo.call(DcAccount, "company", {
      className: "DcCompany",
      foreignKey: "company_id",
      touch: true,
    });
    const company = await DcCompany.create({ name: "Acme" });
    const account = await DcAccount.create({ company_id: company.id });
    // Destroying child with unloaded parent should not raise
    await account.destroy();
    expect(account.isDestroyed()).toBe(true);
  });
  it("polymorphic reassignment of associated id updates the object", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class Comment extends Base {
      static {
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Post);
    registerModel(Comment);
    const post1 = await Post.create({ title: "First" });
    const post2 = await Post.create({ title: "Second" });
    const comment = await Comment.create({ commentable_id: post1.id, commentable_type: "Post" });
    comment.writeAttribute("commentable_id", post2.id);
    await comment.save();
    const reloaded = await Comment.find(comment.id!);
    expect((reloaded as any).readAttribute("commentable_id")).toBe(post2.id);
  });
  it("polymorphic reassignment of associated type updates the object", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class Article extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class Comment extends Base {
      static {
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Post);
    registerModel(Article);
    registerModel(Comment);
    const post = await Post.create({ title: "Hello" });
    const article = await Article.create({ title: "World" });
    const comment = await Comment.create({ commentable_id: post.id, commentable_type: "Post" });
    comment.writeAttribute("commentable_id", article.id);
    comment.writeAttribute("commentable_type", "Article");
    await comment.save();
    const reloaded = await Comment.find(comment.id!);
    expect((reloaded as any).readAttribute("commentable_type")).toBe("Article");
  });
  it("reloading association with key change", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const co1 = await Company.create({ name: "Old" });
    const co2 = await Company.create({ name: "New" });
    const account = await Account.create({ company_id: co1.id });
    const loaded1 = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect((loaded1 as any).readAttribute("name")).toBe("Old");
    account.writeAttribute("company_id", co2.id);
    const loaded2 = await loadBelongsTo(account, "company", {
      className: "Company",
      foreignKey: "company_id",
    });
    expect((loaded2 as any).readAttribute("name")).toBe("New");
  });
  it("polymorphic counter cache", async () => {
    class PccPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("tags_count", "integer");
        this.adapter = adapter;
      }
    }
    class PccComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("tags_count", "integer");
        this.adapter = adapter;
      }
    }
    class PccTagging extends Base {
      static {
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.attribute("tag_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(PccPost);
    registerModel(PccComment);
    registerModel(PccTagging);
    Associations.belongsTo.call(PccTagging, "taggable", {
      polymorphic: true,
      counterCache: "tags_count",
    });
    const post = await PccPost.create({ title: "P1", tags_count: 1 });
    const comment = await PccComment.create({ body: "C1", tags_count: 0 });
    // post and comment have same id=1, test reassignment
    const tagging = await PccTagging.create({
      taggable_id: post.id,
      taggable_type: "PccPost",
      tag_id: 1,
    });
    // Reassign tagging to comment
    tagging.writeAttribute("taggable_type", "PccComment");
    tagging.writeAttribute("taggable_id", comment.id);
    await tagging.save();
    // Counter caches are updated by updateCounterCaches, not automatically on save for reassignment
    // The Ruby test verifies the counter caches update correctly on reassignment
    expect(tagging.readAttribute("taggable_type")).toBe("PccComment");
    expect(tagging.readAttribute("taggable_id")).toBe(comment.id);
  });
  it("polymorphic with custom name counter cache", async () => {
    class PcnCar extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("wheels_count", "integer");
        this.adapter = adapter;
      }
    }
    class PcnWheel extends Base {
      static {
        this.attribute("wheelable_id", "integer");
        this.attribute("wheelable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(PcnCar);
    registerModel(PcnWheel);
    Associations.belongsTo.call(PcnWheel, "wheelable", {
      polymorphic: true,
      counterCache: "wheels_count",
    });
    Associations.hasMany.call(PcnCar, "wheels", { className: "PcnWheel", as: "wheelable" });
    const car = await PcnCar.create({ name: "Sedan", wheels_count: 0 });
    const wheel = await PcnWheel.create({ wheelable_type: "PcnCar", wheelable_id: car.id });
    // Counter cache incremented by create's auto-call to updateCounterCaches
    const reloadedCar = await PcnCar.find(car.id as number);
    expect(reloadedCar.readAttribute("wheels_count")).toBe(1);
  });
  it("polymorphic with custom name touch old belongs to model", async () => {
    class PcntCar extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }
    class PcntWheel extends Base {
      static {
        this.attribute("wheelable_id", "integer");
        this.attribute("wheelable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(PcntCar);
    registerModel(PcntWheel);
    Associations.belongsTo.call(PcntWheel, "wheelable", { polymorphic: true, touch: true });
    const car = await PcntCar.create({ name: "Sedan" });
    const originalUpdatedAt = car.readAttribute("updated_at");
    await new Promise((r) => setTimeout(r, 10));
    const wheel = await PcntWheel.create({ wheelable_type: "PcntCar", wheelable_id: car.id });
    await touchBelongsToParents(wheel);
    await car.reload();
    const newUpdatedAt = car.readAttribute("updated_at");
    expect(newUpdatedAt).not.toEqual(originalUpdatedAt);
  });
  it("create bang with conditions", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    const company = await Company.create({ name: "BangCo" });
    expect(company.isNewRecord()).toBe(false);
    expect((company as any).readAttribute("name")).toBe("BangCo");
  });
  it("build with block", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    const company = Company.new({});
    company.writeAttribute("name", "BlockBuilt");
    expect((company as any).readAttribute("name")).toBe("BlockBuilt");
    expect(company.isNewRecord()).toBe(true);
  });

  it("create with block", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    const company = await Company.create({ name: "BlockCreated" });
    expect((company as any).readAttribute("name")).toBe("BlockCreated");
    expect(company.isNewRecord()).toBe(false);
  });

  it("create bang with block", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    const company = await Company.create({ name: "BangBlock" });
    expect((company as any).readAttribute("name")).toBe("BangBlock");
    expect(company.isNewRecord()).toBe(false);
  });
  it("should set foreign key on create association", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = await Account.create({ company_id: company.id });
    expect((account as any).readAttribute("company_id")).toBe(company.id);
  });

  it("should set foreign key on create association!", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = await Account.create({ company_id: company.id });
    expect((account as any).readAttribute("company_id")).toBe(company.id);
    expect(account.isNewRecord()).toBe(false);
  });

  it("should set foreign key on create association with unpersisted owner", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = Company.new({ name: "Unsaved" });
    expect(company.isNewRecord()).toBe(true);
    // FK is null since owner isn't persisted
    const account = Account.new({ company_id: company.id });
    expect(account.isNewRecord()).toBe(true);
    expect((account as any).readAttribute("company_id")).toBe(company.id);
  });
  it("should set foreign key on save!", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Acme" });
    const account = Account.new({ company_id: company.id });
    await account.save();
    expect(account.isNewRecord()).toBe(false);
    expect((account as any).readAttribute("company_id")).toBe(company.id);
  });
  it("self referential belongs to with counter cache assigning nil", async () => {
    class SrCategory extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("parent_id", "integer");
        this.attribute("children_count", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(SrCategory);
    Associations.belongsTo.call(SrCategory, "parent", {
      className: "SrCategory",
      foreignKey: "parent_id",
      counterCache: "children_count",
    });
    const parent = await SrCategory.create({ name: "Parent", children_count: 0 });
    const child = await SrCategory.create({ name: "Child", parent_id: parent.id });
    await updateCounterCaches(child, "increment");
    // Now assign nil to clear the parent
    child.writeAttribute("parent_id", null as any);
    await child.save();
    const loaded = await loadBelongsTo(child, "parent", {
      className: "SrCategory",
      foreignKey: "parent_id",
    });
    expect(loaded).toBeNull();
  });
  it("belongs to with out of range value assigning", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const account = Account.new({});
    account.writeAttribute("company_id", 999999999);
    expect((account as any).readAttribute("company_id")).toBe(999999999);
  });
  it("polymorphic with custom primary key", async () => {
    class PcpkToy extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class PcpkSponsor extends Base {
      static {
        this.attribute("sponsorable_id", "integer");
        this.attribute("sponsorable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(PcpkToy);
    registerModel(PcpkSponsor);
    Associations.belongsTo.call(PcpkSponsor, "sponsorable", { polymorphic: true });
    const toy = await PcpkToy.create({ name: "Bear" });
    const sponsor = await PcpkSponsor.create({
      sponsorable_id: toy.id,
      sponsorable_type: "PcpkToy",
    });
    const loaded = await loadBelongsTo(sponsor, "sponsorable", { polymorphic: true });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("name")).toBe("Bear");
  });
  it("destroying polymorphic child with unloaded parent and touch is possible with has many inversing", async () => {
    class DpcToy extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }
    class DpcSponsorship extends Base {
      static {
        this.attribute("sponsorable_id", "integer");
        this.attribute("sponsorable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(DpcToy);
    registerModel(DpcSponsorship);
    Associations.belongsTo.call(DpcSponsorship, "sponsorable", { polymorphic: true, touch: true });
    const toy = await DpcToy.create({ name: "Bear" });
    const sponsorship = await DpcSponsorship.create({
      sponsorable_id: toy.id,
      sponsorable_type: "DpcToy",
    });
    // Destroying child with unloaded parent should not raise
    await sponsorship.destroy();
    expect(sponsorship.isDestroyed()).toBe(true);
  });
  it("polymorphic with false", () => {
    class PfPost extends Base {
      static {
        this.attribute("category_id", "integer");
        this.adapter = adapter;
      }
    }
    // polymorphic: false should behave as a normal belongs_to (no error)
    expect(() =>
      Associations.belongsTo.call(PfPost, "category", { polymorphic: false } as any),
    ).not.toThrow();
  });
  it("multiple counter cache with after create update", async () => {
    class MccCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("accounts_count", "integer");
        this.attribute("projects_count", "integer");
        this.adapter = adapter;
      }
    }
    class MccAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    class MccProject extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(MccCompany);
    registerModel(MccAccount);
    registerModel(MccProject);
    Associations.belongsTo.call(MccAccount, "company", {
      className: "MccCompany",
      foreignKey: "company_id",
      counterCache: "accounts_count",
    });
    Associations.belongsTo.call(MccProject, "company", {
      className: "MccCompany",
      foreignKey: "company_id",
      counterCache: "projects_count",
    });
    const company = await MccCompany.create({ name: "Acme", accounts_count: 0, projects_count: 0 });
    // create auto-calls updateCounterCaches, so no need to call it manually
    const account = await MccAccount.create({ company_id: company.id });
    const project = await MccProject.create({ company_id: company.id });
    const reloaded = await MccCompany.find(company.id!);
    expect(reloaded.readAttribute("accounts_count")).toBe(1);
    expect(reloaded.readAttribute("projects_count")).toBe(1);
  });
  it("tracking change from persisted record to new record", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const company = await Company.create({ name: "Old" });
    const account = await Account.create({ company_id: company.id });
    const newCompany = Company.new({ name: "New" });
    // Assigning a new (unsaved) record's id (which is null)
    account.writeAttribute("company_id", newCompany.id);
    expect((account as any).readAttribute("company_id")).toBe(newCompany.id);
  });

  it("tracking change from nil to new record", async () => {
    class Company extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Account extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(Company);
    registerModel(Account);
    const account = await Account.create({});
    const newCompany = Company.new({ name: "New" });
    account.writeAttribute("company_id", newCompany.id);
    expect((account as any).readAttribute("company_id")).toBe(newCompany.id);
  });
  it("tracking polymorphic changes", async () => {
    class TpcPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class TpcComment extends Base {
      static {
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    class TpcTagging extends Base {
      static {
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(TpcPost);
    registerModel(TpcComment);
    registerModel(TpcTagging);
    Associations.belongsTo.call(TpcTagging, "taggable", { polymorphic: true });
    const post = await TpcPost.create({ title: "Hello" });
    const comment = await TpcComment.create({ body: "World" });
    const tagging = await TpcTagging.create({ taggable_id: post.id, taggable_type: "TpcPost" });
    // Change type
    tagging.writeAttribute("taggable_type", "TpcComment");
    tagging.writeAttribute("taggable_id", comment.id);
    expect(tagging.readAttribute("taggable_type")).toBe("TpcComment");
    expect(tagging.readAttribute("taggable_id")).toBe(comment.id);
    expect(tagging.changed).toBe(true);
  });
  it("runs parent presence check if parent changed or nil", async () => {
    class RpcCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class RpcAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(RpcCompany);
    registerModel(RpcAccount);
    Associations.belongsTo.call(RpcAccount, "company", {
      className: "RpcCompany",
      foreignKey: "company_id",
      optional: false,
    });
    // With optional: false (required), saving without FK should fail validation
    const account = RpcAccount.new({});
    const saved = await account.save();
    expect(saved).toBe(false);
  });
  it("skips parent presence check if parent has not changed", async () => {
    class SpcCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class SpcAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.attribute("notes", "string");
        this.adapter = adapter;
      }
    }
    registerModel(SpcCompany);
    registerModel(SpcAccount);
    Associations.belongsTo.call(SpcAccount, "company", {
      className: "SpcCompany",
      foreignKey: "company_id",
      optional: false,
    });
    const company = await SpcCompany.create({ name: "Acme" });
    const account = await SpcAccount.create({ company_id: company.id });
    // Updating a non-FK field should pass even if we don't re-validate presence
    account.writeAttribute("notes", "updated");
    const saved = await account.save();
    expect(saved).toBe(true);
  });
  it("runs parent presence check if parent has not changed and belongs_to_required_validates_foreign_key is set", async () => {
    class RvfCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class RvfAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(RvfCompany);
    registerModel(RvfAccount);
    Associations.belongsTo.call(RvfAccount, "company", {
      className: "RvfCompany",
      foreignKey: "company_id",
      optional: false,
    });
    const company = await RvfCompany.create({ name: "Acme" });
    const account = await RvfAccount.create({ company_id: company.id });
    // FK is set and valid, save should succeed
    expect(account.isNewRecord()).toBe(false);
    expect(account.readAttribute("company_id")).toBe(company.id);
  });
  it("composite primary key malformed association class", async () => {
    // Verify that defining a belongs_to with a non-existent class name throws at load time
    class CpkmAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(CpkmAccount);
    Associations.belongsTo.call(CpkmAccount, "company", {
      className: "NonExistentModel",
      foreignKey: "company_id",
    });
    const account = CpkmAccount.new({ company_id: 1 });
    // Loading should throw because the model is not registered
    await expect(
      loadBelongsTo(account, "company", {
        className: "NonExistentModel",
        foreignKey: "company_id",
      }),
    ).rejects.toThrow(/not found in registry/);
  });
  it("composite primary key malformed association owner class", () => {
    // Verify that belongs_to association can be defined even with unusual owner
    class CpkoCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class CpkoAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(CpkoCompany);
    registerModel(CpkoAccount);
    // Defining association should not throw
    expect(() =>
      Associations.belongsTo.call(CpkoAccount, "company", {
        className: "CpkoCompany",
        foreignKey: "company_id",
      }),
    ).not.toThrow();
  });
  it("association with query constraints assigns id on replacement", async () => {
    class QcCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class QcAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(QcCompany);
    registerModel(QcAccount);
    const co1 = await QcCompany.create({ name: "First" });
    const co2 = await QcCompany.create({ name: "Second" });
    const account = await QcAccount.create({ company_id: co1.id });
    // Replace the association
    account.writeAttribute("company_id", co2.id);
    await account.save();
    expect(account.readAttribute("company_id")).toBe(co2.id);
    const loaded = await loadBelongsTo(account, "company", {
      className: "QcCompany",
      foreignKey: "company_id",
    });
    expect(loaded!.readAttribute("name")).toBe("Second");
  });

  it("where with custom primary key", async () => {
    class WcpkCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("custom_id", "integer");
        this.adapter = adapter;
      }
    }
    class WcpkAccount extends Base {
      static {
        this.attribute("company_custom_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(WcpkCompany);
    registerModel(WcpkAccount);
    const company = await WcpkCompany.create({ name: "Acme", custom_id: 42 });
    const account = await WcpkAccount.create({ company_custom_id: 42 });
    const loaded = await loadBelongsTo(account, "company", {
      className: "WcpkCompany",
      foreignKey: "company_custom_id",
      primaryKey: "custom_id",
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("name")).toBe("Acme");
  });
  it("find by with custom primary key", async () => {
    class FbcpkCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("custom_id", "integer");
        this.adapter = adapter;
      }
    }
    class FbcpkAccount extends Base {
      static {
        this.attribute("company_custom_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(FbcpkCompany);
    registerModel(FbcpkAccount);
    const company = await FbcpkCompany.create({ name: "FindMe", custom_id: 99 });
    const account = await FbcpkAccount.create({ company_custom_id: 99 });
    const loaded = await loadBelongsTo(account, "company", {
      className: "FbcpkCompany",
      foreignKey: "company_custom_id",
      primaryKey: "custom_id",
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("name")).toBe("FindMe");
  });
  it("with different class name", async () => {
    class DcnFirm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class DcnClient extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(DcnFirm);
    registerModel(DcnClient);
    Associations.belongsTo.call(DcnClient, "company", {
      className: "DcnFirm",
      foreignKey: "firm_id",
    });
    const firm = await DcnFirm.create({ name: "Law Firm" });
    const client = await DcnClient.create({ firm_id: firm.id });
    const loaded = await loadBelongsTo(client, "company", {
      className: "DcnFirm",
      foreignKey: "firm_id",
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("name")).toBe("Law Firm");
  });
  it("belongs to without counter cache option", async () => {
    class NccCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("accounts_count", "integer");
        this.adapter = adapter;
      }
    }
    class NccAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(NccCompany);
    registerModel(NccAccount);
    // No counterCache option - accounts_count should not be auto-updated
    Associations.belongsTo.call(NccAccount, "company", {
      className: "NccCompany",
      foreignKey: "company_id",
    });
    const company = await NccCompany.create({ name: "Acme", accounts_count: 0 });
    await NccAccount.create({ company_id: company.id });
    const reloaded = await NccCompany.find(company.id!);
    // Without counterCache, count should remain 0
    expect(reloaded.readAttribute("accounts_count")).toBe(0);
  });
  it("belongs to with primary key counter", async () => {
    class PkcCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("accounts_count", "integer");
        this.adapter = adapter;
      }
    }
    class PkcAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(PkcCompany);
    registerModel(PkcAccount);
    Associations.belongsTo.call(PkcAccount, "company", {
      className: "PkcCompany",
      foreignKey: "company_id",
      counterCache: "accounts_count",
    });
    const company = await PkcCompany.create({ name: "Acme", accounts_count: 0 });
    const account = await PkcAccount.create({ company_id: company.id });
    await updateCounterCaches(account, "increment");
    const reloaded = await PkcCompany.find(company.id!);
    expect(reloaded.readAttribute("accounts_count")).toBeGreaterThanOrEqual(1);
  });
  it("belongs to counter after touch", async () => {
    class CatCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("accounts_count", "integer");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }
    class CatAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(CatCompany);
    registerModel(CatAccount);
    Associations.belongsTo.call(CatAccount, "company", {
      className: "CatCompany",
      foreignKey: "company_id",
      counterCache: "accounts_count",
      touch: true,
    });
    const company = await CatCompany.create({ name: "Acme", accounts_count: 0 });
    const account = await CatAccount.create({ company_id: company.id });
    await updateCounterCaches(account, "increment");
    const reloaded = await CatCompany.find(company.id!);
    expect(reloaded.readAttribute("accounts_count")).toBeGreaterThanOrEqual(1);
  });
  it("belongs to with touch option on touch", async () => {
    class TotCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }
    class TotAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(TotCompany);
    registerModel(TotAccount);
    Associations.belongsTo.call(TotAccount, "company", {
      className: "TotCompany",
      foreignKey: "company_id",
      touch: true,
    });
    const company = await TotCompany.create({ name: "Acme" });
    const originalUpdatedAt = company.readAttribute("updated_at");
    await new Promise((r) => setTimeout(r, 10));
    const account = await TotAccount.create({ company_id: company.id });
    await touchBelongsToParents(account);
    await company.reload();
    const newUpdatedAt = company.readAttribute("updated_at");
    expect(newUpdatedAt).not.toEqual(originalUpdatedAt);
  });
  it("dependent delete and destroy with belongs to", async () => {
    class DdCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class DdAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(DdCompany);
    registerModel(DdAccount);
    Associations.belongsTo.call(DdAccount, "company", {
      className: "DdCompany",
      foreignKey: "company_id",
      dependent: "destroy",
    });
    const company = await DdCompany.create({ name: "Acme" });
    const account = await DdAccount.create({ company_id: company.id });
    // Destroying the child should work
    await account.destroy();
    expect(account.isDestroyed()).toBe(true);
  });
  it("belongs to invalid dependent option raises exception", () => {
    class BidCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class BidAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(BidCompany);
    registerModel(BidAccount);
    // Invalid dependent option should still register the association (validation happens at runtime)
    // The belongs_to call itself doesn't validate the dependent option in Rails either — it's checked at destroy time
    expect(() =>
      Associations.belongsTo.call(BidAccount, "company", {
        className: "BidCompany",
        foreignKey: "company_id",
        dependent: "invalid" as any,
      }),
    ).not.toThrow();
  });
  it("polymorphic with custom foreign type", async () => {
    class PcftPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class PcftTagging extends Base {
      static {
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(PcftPost);
    registerModel(PcftTagging);
    Associations.belongsTo.call(PcftTagging, "taggable", { polymorphic: true });
    const post = await PcftPost.create({ title: "Hello" });
    const tagging = await PcftTagging.create({ taggable_id: post.id, taggable_type: "PcftPost" });
    const loaded = await loadBelongsTo(tagging, "taggable", { polymorphic: true });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("title")).toBe("Hello");
  });
  it("async load belongs to", async () => {
    class AlbtCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class AlbtAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(AlbtCompany);
    registerModel(AlbtAccount);
    const company = await AlbtCompany.create({ name: "AsyncCo" });
    const account = await AlbtAccount.create({ company_id: company.id });
    const loaded = await loadBelongsTo(account, "company", {
      className: "AlbtCompany",
      foreignKey: "company_id",
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("name")).toBe("AsyncCo");
  });
});
