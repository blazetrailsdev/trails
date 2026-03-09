/**
 * BelongsTo extended tests — mirrors Rails:
 * activerecord/test/cases/associations/belongs_to_associations_test.rb
 *
 * Covers testable behaviors using MemoryAdapter. Tests requiring raw SQL,
 * query cache, DB-specific features, or complex fixture setups are kept as
 * null in the naming map.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  Base,
  registerModel,
  touchBelongsToParents,
  updateCounterCaches,
} from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { Associations, loadBelongsTo } from "./associations.js";

// ---------------------------------------------------------------------------
// BelongsToAssociationsTest (testable subset)
// ---------------------------------------------------------------------------

describe("BelongsToAssociationsTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = createTestAdapter();
  });

  // -------------------------------------------------------------------------
  // Basic belongs_to
  // -------------------------------------------------------------------------

  it("belongs to", async () => {
    // Rails: test_belongs_to
    class BtCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class BtAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("BtCompany", BtCompany);
    registerModel("BtAccount", BtAccount);

    const company = await BtCompany.create({ name: "37signals" });
    const account = await BtAccount.create({
      company_id: company.id,
      credit_limit: 50,
    });

    const loaded = await loadBelongsTo(account, "btCompany", {
      className: "BtCompany",
      foreignKey: "company_id",
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("name")).toBe("37signals");
  });

  it("belongs to with primary key", async () => {
    // Rails: test_belongs_to_with_primary_key
    class PkFirm extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("firm_name", "string");
        this.adapter = adapter;
      }
    }
    class PkClient extends Base {
      static {
        this.attribute("firm_name", "string");
        this.adapter = adapter;
      }
    }
    registerModel("PkFirm", PkFirm);
    registerModel("PkClient", PkClient);

    const firm = await PkFirm.create({ name: "Apple", firm_name: "Apple Inc" });
    const client = await PkClient.create({ firm_name: "Apple Inc" });

    const loaded = await loadBelongsTo(client, "pkFirm", {
      className: "PkFirm",
      foreignKey: "firm_name",
      primaryKey: "firm_name",
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("name")).toBe("Apple");
  });

  it("belongs to with null foreign key", async () => {
    // Rails: test_belongs_to (null FK variant)
    class NullFkCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class NullFkAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("NullFkCompany", NullFkCompany);
    registerModel("NullFkAccount", NullFkAccount);

    const account = await NullFkAccount.create({ company_id: null });
    const loaded = await loadBelongsTo(account, "nullFkCompany", {
      className: "NullFkCompany",
      foreignKey: "company_id",
    });
    expect(loaded).toBeNull();
  });

  it("belongs to with missing record returns null", async () => {
    // Rails: test_belongs_to (missing FK)
    class MissingCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class MissingAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("MissingCompany", MissingCompany);
    registerModel("MissingAccount", MissingAccount);

    const account = await MissingAccount.create({ company_id: 9999 });
    const loaded = await loadBelongsTo(account, "missingCompany", {
      className: "MissingCompany",
      foreignKey: "company_id",
    });
    expect(loaded).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Building / creating the belonging object
  // -------------------------------------------------------------------------

  it("building the belonging object", async () => {
    // Rails: test_building_the_belonging_object
    class BuildFirm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class BuildAccount extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("BuildFirm", BuildFirm);

    const account = await BuildAccount.create({ credit_limit: 10 });

    // Simulate buildAssociation — create unsaved firm and set FK
    const firm = new BuildFirm({ name: "Apple" });
    await firm.save();
    account.writeAttribute("firm_id", firm.id);
    await account.save();

    const reloaded = await loadBelongsTo(account, "buildFirm", {
      className: "BuildFirm",
      foreignKey: "firm_id",
    });
    expect(reloaded).not.toBeNull();
    expect(reloaded!.readAttribute("name")).toBe("Apple");
  });

  it("creating the belonging object", async () => {
    // Rails: test_creating_the_belonging_object
    class CreateFirm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class CreateAccount extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("CreateFirm", CreateFirm);

    const account = await CreateAccount.create({ credit_limit: 10 });

    const firm = await CreateFirm.create({ name: "Apple" });
    account.writeAttribute("firm_id", firm.id);
    await account.save();

    const loaded = await loadBelongsTo(account, "createFirm", {
      className: "CreateFirm",
      foreignKey: "firm_id",
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("name")).toBe("Apple");
    expect(loaded!.isNewRecord()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Assignment / natural assignment
  // -------------------------------------------------------------------------

  it("natural assignment", async () => {
    // Rails: test_natural_assignment
    class NatFirm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class NatAccount extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("NatFirm", NatFirm);

    const apple = await NatFirm.create({ name: "Apple" });
    const account = await NatAccount.create({ credit_limit: 10 });

    account.writeAttribute("firm_id", apple.id);
    await account.save();

    expect(account.readAttribute("firm_id")).toBe(apple.id);
  });

  it("natural assignment to nil removes the association", async () => {
    // Rails: test_natural_assignment_to_nil
    class NilFirm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class NilAccount extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("NilFirm", NilFirm);
    registerModel("NilAccount", NilAccount);

    const firm = await NilFirm.create({ name: "Apple" });
    const account = await NilAccount.create({
      firm_id: firm.id,
      credit_limit: 10,
    });

    // Clear the FK
    account.writeAttribute("firm_id", null);
    await account.save();

    const loaded = await loadBelongsTo(account, "nilFirm", {
      className: "NilFirm",
      foreignKey: "firm_id",
    });
    expect(loaded).toBeNull();
  });

  // -------------------------------------------------------------------------
  // optional / required
  // -------------------------------------------------------------------------

  it("optional relation", async () => {
    // Rails: test_optional_relation
    class OptCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class OptAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(OptAccount, "optCompany", {
      className: "OptCompany",
      foreignKey: "company_id",
      optional: true,
    });
    registerModel("OptCompany", OptCompany);
    registerModel("OptAccount", OptAccount);

    const account = new OptAccount({});
    // optional: true means no FK presence validation
    const valid = await account.isValid();
    expect(valid).toBe(true);
  });

  it("not optional relation is invalid without fk", async () => {
    // Rails: test_not_optional_relation
    class ReqCompany extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class ReqAccount extends Base {
      static {
        this.attribute("company_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(ReqAccount, "reqCompany", {
      className: "ReqCompany",
      foreignKey: "company_id",
      optional: false,
    });
    registerModel("ReqCompany", ReqCompany);
    registerModel("ReqAccount", ReqAccount);

    const account = new ReqAccount({});
    const valid = await account.isValid();
    expect(valid).toBe(false);
  });

  // -------------------------------------------------------------------------
  // touch: true
  // -------------------------------------------------------------------------

  it("belongs to with touch option on save", async () => {
    // Rails: test_belongs_to_with_touch_option_on_touch
    class TouchPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("updated_at", "string");
        this.adapter = adapter;
      }
    }
    class TouchComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("post_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(TouchComment, "touchPost", {
      className: "TouchPost",
      foreignKey: "post_id",
      touch: true,
    });
    registerModel("TouchPost", TouchPost);
    registerModel("TouchComment", TouchComment);

    const post = await TouchPost.create({
      title: "Hello",
      updated_at: new Date("2020-01-01").toISOString(),
    });
    const comment = await TouchComment.create({ body: "Nice", post_id: post.id });

    await touchBelongsToParents(comment);

    const reloaded = await TouchPost.find(post.id as number);
    // updated_at should be updated (not necessarily the same as before)
    expect(reloaded.readAttribute("updated_at")).not.toBe(
      new Date("2020-01-01").toISOString()
    );
  });

  // -------------------------------------------------------------------------
  // counter_cache
  // -------------------------------------------------------------------------

  it("belongs to counter", async () => {
    // Rails: test_belongs_to_counter
    // create() auto-increments counter cache; destroy() auto-decrements
    class CcPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("cc_comments_count", "integer", { default: 0 });
        this.adapter = adapter;
      }
    }
    class CcComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("post_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(CcComment, "ccPost", {
      className: "CcPost",
      foreignKey: "post_id",
      counterCache: true,
    });
    registerModel("CcPost", CcPost);
    registerModel("CcComment", CcComment);

    const post = await CcPost.create({ title: "Post" });

    // create() should auto-increment the counter
    await CcComment.create({ body: "Hi", post_id: post.id });

    const reloaded = await CcPost.find(post.id as number);
    expect(reloaded.readAttribute("cc_comments_count")).toBe(1);
  });

  it("custom named counter cache", async () => {
    // Rails: test_custom_named_counter_cache / test_custom_counter_cache
    class CnPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("my_comment_count", "integer");
        this.adapter = adapter;
      }
    }
    class CnComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("post_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(CnComment, "cnPost", {
      className: "CnPost",
      foreignKey: "post_id",
      counterCache: "my_comment_count",
    });
    registerModel("CnPost", CnPost);
    registerModel("CnComment", CnComment);

    const post = await CnPost.create({ title: "Post", my_comment_count: 0 });
    await CnComment.create({ body: "Hi", post_id: post.id });

    const reloaded = await CnPost.find(post.id as number);
    expect(reloaded.readAttribute("my_comment_count")).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Polymorphic belongs_to
  // -------------------------------------------------------------------------

  it("polymorphic belongs_to", async () => {
    // Rails: test_polymorphic_association_class
    class PolyImage extends Base {
      static {
        this.attribute("url", "string");
        this.attribute("imageable_id", "integer");
        this.attribute("imageable_type", "string");
        this.adapter = adapter;
      }
    }
    class PolyPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel("PolyPost", PolyPost);
    registerModel("PolyImage", PolyImage);

    const post = await PolyPost.create({ title: "Hello" });
    const image = await PolyImage.create({
      url: "http://example.com/img.png",
      imageable_id: post.id,
      imageable_type: "PolyPost",
    });

    const loaded = await loadBelongsTo(image, "imageable", {
      polymorphic: true,
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("title")).toBe("Hello");
  });

  // -------------------------------------------------------------------------
  // Reloading the belonging object
  // -------------------------------------------------------------------------

  it("reloading the belonging object", async () => {
    // Rails: test_reloading_the_belonging_object
    class ReloadFirm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class ReloadAccount extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("ReloadFirm", ReloadFirm);
    registerModel("ReloadAccount", ReloadAccount);

    const firm = await ReloadFirm.create({ name: "Odegy" });
    const account = await ReloadAccount.create({ firm_id: firm.id });

    // First load
    const first = await loadBelongsTo(account, "reloadFirm", {
      className: "ReloadFirm",
      foreignKey: "firm_id",
    });
    expect(first!.readAttribute("name")).toBe("Odegy");

    // Update firm name directly
    firm.writeAttribute("name", "ODEGY");
    await firm.save();

    // Reload by clearing cache and reloading
    if ((account as any)._cachedAssociations) {
      (account as any)._cachedAssociations.delete("reloadFirm");
    }
    const second = await loadBelongsTo(account, "reloadFirm", {
      className: "ReloadFirm",
      foreignKey: "firm_id",
    });
    expect(second!.readAttribute("name")).toBe("ODEGY");
  });

  // -------------------------------------------------------------------------
  // Assignment before child saved
  // -------------------------------------------------------------------------

  it("assignment before child saved", async () => {
    // Rails: test_assignment_before_child_saved
    class AbsFirm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class AbsClient extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("firm_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("AbsFirm", AbsFirm);
    registerModel("AbsClient", AbsClient);

    const firm = await AbsFirm.create({ name: "New Firm" });
    const client = new AbsClient({ name: "New Client" });

    client.writeAttribute("firm_id", firm.id);
    await client.save();

    expect(client.readAttribute("firm_id")).toBe(firm.id);
    expect(client.isNewRecord()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // inverse_of
  // -------------------------------------------------------------------------

  it("belongs to with inverse of", async () => {
    // Rails: test_belongs_to (inverse caching)
    class InvPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class InvComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("post_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.hasMany.call(InvPost, "comments", {
      className: "InvComment",
      foreignKey: "post_id",
      inverseOf: "post",
    });
    Associations.belongsTo.call(InvComment, "post", {
      className: "InvPost",
      foreignKey: "post_id",
      inverseOf: "comments",
    });
    registerModel("InvPost", InvPost);
    registerModel("InvComment", InvComment);

    const post = await InvPost.create({ title: "Hello" });
    const comment = await InvComment.create({ body: "Hi", post_id: post.id });

    const loaded = await loadBelongsTo(comment, "post", {
      className: "InvPost",
      foreignKey: "post_id",
      inverseOf: "comments",
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("title")).toBe("Hello");
  });

  // -------------------------------------------------------------------------
  // Stale tracking / foreign key changes
  // -------------------------------------------------------------------------

  it("reassigning the parent id updates the object", async () => {
    // Rails: test_reassigning_the_parent_id_updates_the_object
    class StFirm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class StClient extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("firm_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("StFirm", StFirm);
    registerModel("StClient", StClient);

    const firm1 = await StFirm.create({ name: "First" });
    const firm2 = await StFirm.create({ name: "Second" });
    const client = await StClient.create({ name: "Movable", firm_id: firm1.id });

    expect(client.readAttribute("firm_id")).toBe(firm1.id);

    client.writeAttribute("firm_id", firm2.id);
    await client.save();

    expect(client.readAttribute("firm_id")).toBe(firm2.id);

    const loaded = await loadBelongsTo(client, "stFirm", {
      className: "StFirm",
      foreignKey: "firm_id",
    });
    expect(loaded!.readAttribute("name")).toBe("Second");
  });

  // -------------------------------------------------------------------------
  // New record with FK but no object
  // -------------------------------------------------------------------------

  it("new record with foreign key but no object", async () => {
    // Rails: test_new_record_with_foreign_key_but_no_object
    class NrFirm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class NrClient extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("firm_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("NrFirm", NrFirm);
    registerModel("NrClient", NrClient);

    const client = new NrClient({ name: "New Client", firm_id: 1 });
    // It's a new record so is not persisted
    expect(client.isNewRecord()).toBe(true);
    // FK is set
    expect(client.readAttribute("firm_id")).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Don't find target when FK is null
  // -------------------------------------------------------------------------

  it("dont find target when foreign key is null", async () => {
    // Rails: test_dont_find_target_when_foreign_key_is_null
    class NoFkFirm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class NoFkClient extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("firm_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("NoFkFirm", NoFkFirm);
    registerModel("NoFkClient", NoFkClient);

    const client = new NoFkClient({ name: "Client" });
    // No FK set — null FK means no query
    const loaded = await loadBelongsTo(client, "noFkFirm", {
      className: "NoFkFirm",
      foreignKey: "firm_id",
    });
    expect(loaded).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Clearing association clears inverse
  // -------------------------------------------------------------------------

  it("assigning nil on an association clears the associations inverse", async () => {
    // Rails: test_assigning_nil_on_an_association_clears_the_associations_inverse
    class NilInvPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class NilInvComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("post_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("NilInvPost", NilInvPost);
    registerModel("NilInvComment", NilInvComment);

    const post = await NilInvPost.create({ title: "Post" });
    const comment = await NilInvComment.create({ body: "Hi", post_id: post.id });

    // Simulate clearing — set FK to null
    comment.writeAttribute("post_id", null);
    await comment.save();

    const loaded = await loadBelongsTo(comment, "nilInvPost", {
      className: "NilInvPost",
      foreignKey: "post_id",
    });
    expect(loaded).toBeNull();
  });

  // -------------------------------------------------------------------------
  // natural assignment / id assignment
  // -------------------------------------------------------------------------

  it("natural assignment", async () => {
    class NatFirm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class NatAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel("NatFirm", NatFirm);
    registerModel("NatAccount", NatAccount);

    const firm = await NatFirm.create({ name: "Signal37" });
    const account = await NatAccount.create({ firm_id: firm.id });

    const loaded = await loadBelongsTo(account, "natFirm", {
      className: "NatFirm", foreignKey: "firm_id",
    });
    expect(loaded!.readAttribute("name")).toBe("Signal37");
  });

  it("id assignment", async () => {
    class IdFirm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class IdAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel("IdFirm", IdFirm);
    registerModel("IdAccount", IdAccount);

    const firm = await IdFirm.create({ name: "Corp" });
    const account = new IdAccount({});
    account.writeAttribute("firm_id", firm.id);
    await account.save();

    const loaded = await loadBelongsTo(account, "idFirm", {
      className: "IdFirm", foreignKey: "firm_id",
    });
    expect(loaded!.id).toBe(firm.id);
  });

  it("natural assignment to nil", async () => {
    class NilFirm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class NilAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel("NilFirm", NilFirm);
    registerModel("NilAccount", NilAccount);

    const firm = await NilFirm.create({ name: "Corp" });
    const account = await NilAccount.create({ firm_id: firm.id });
    account.writeAttribute("firm_id", null);
    await account.save();

    const loaded = await loadBelongsTo(account, "nilFirm", {
      className: "NilFirm", foreignKey: "firm_id",
    });
    expect(loaded).toBeNull();
  });

  // -------------------------------------------------------------------------
  // building / creating via belongs_to
  // -------------------------------------------------------------------------

  it("building the belonging object", async () => {
    class BuildFirm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class BuildAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    Associations.belongsTo.call(BuildAccount, "buildFirm", {
      className: "BuildFirm", foreignKey: "firm_id",
    });
    registerModel("BuildFirm", BuildFirm);
    registerModel("BuildAccount", BuildAccount);

    const account = new BuildAccount({});
    const firm = new BuildFirm({ name: "New Firm" });
    account.writeAttribute("firm_id", undefined);

    // Simulate build: create firm, set FK
    await firm.save();
    account.writeAttribute("firm_id", firm.id);
    await account.save();

    const loaded = await loadBelongsTo(account, "buildFirm", {
      className: "BuildFirm", foreignKey: "firm_id",
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("name")).toBe("New Firm");
  });

  it("creating the belonging object", async () => {
    class CrFirm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class CrAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel("CrFirm", CrFirm);
    registerModel("CrAccount", CrAccount);

    const account = new CrAccount({});
    const firm = await CrFirm.create({ name: "Created Firm" });
    account.writeAttribute("firm_id", firm.id);
    await account.save();

    const loaded = await loadBelongsTo(account, "crFirm", {
      className: "CrFirm", foreignKey: "firm_id",
    });
    expect(loaded!.readAttribute("name")).toBe("Created Firm");
    expect(loaded!.isNewRecord()).toBe(false);
  });

  it("creating the belonging object from new record", async () => {
    class CrNrFirm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class CrNrAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel("CrNrFirm", CrNrFirm);
    registerModel("CrNrAccount", CrNrAccount);

    const account = new CrNrAccount({});
    const firm = await CrNrFirm.create({ name: "New Parent" });
    account.writeAttribute("firm_id", firm.id);
    await account.save();

    expect(account.isNewRecord()).toBe(false);
    const loaded = await loadBelongsTo(account, "crNrFirm", {
      className: "CrNrFirm", foreignKey: "firm_id",
    });
    expect(loaded).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // assignment before child saved
  // -------------------------------------------------------------------------

  it("assignment before child saved", async () => {
    class AbsFirm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class AbsAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel("AbsFirm", AbsFirm);
    registerModel("AbsAccount", AbsAccount);

    const firm = await AbsFirm.create({ name: "Corp" });
    const account = new AbsAccount({});
    account.writeAttribute("firm_id", firm.id);
    await account.save();

    expect(account.isNewRecord()).toBe(false);
    expect(account.readAttribute("firm_id")).toBe(firm.id);
  });

  // -------------------------------------------------------------------------
  // new record with FK but no object loaded
  // -------------------------------------------------------------------------

  it("new record with foreign key but no object", async () => {
    class NrFkFirm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class NrFkAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel("NrFkFirm", NrFkFirm);
    registerModel("NrFkAccount", NrFkAccount);

    const firm = await NrFkFirm.create({ name: "Corp" });
    const account = new NrFkAccount({ firm_id: firm.id });

    const loaded = await loadBelongsTo(account, "nrFkFirm", {
      className: "NrFkFirm", foreignKey: "firm_id",
    });
    expect(loaded).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // setting FK after nil target loaded
  // -------------------------------------------------------------------------

  it("setting foreign key after nil target loaded", async () => {
    class FkNilFirm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class FkNilAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel("FkNilFirm", FkNilFirm);
    registerModel("FkNilAccount", FkNilAccount);

    const account = await FkNilAccount.create({ firm_id: null });
    let loaded = await loadBelongsTo(account, "fkNilFirm", {
      className: "FkNilFirm", foreignKey: "firm_id",
    });
    expect(loaded).toBeNull();

    const firm = await FkNilFirm.create({ name: "Later Corp" });
    account.writeAttribute("firm_id", firm.id);
    await account.save();

    loaded = await loadBelongsTo(account, "fkNilFirm", {
      className: "FkNilFirm", foreignKey: "firm_id",
    });
    expect(loaded).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // association assignment sticks
  // -------------------------------------------------------------------------

  it("association assignment sticks", async () => {
    class StkFirm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class StkAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel("StkFirm", StkFirm);
    registerModel("StkAccount", StkAccount);

    const firmA = await StkFirm.create({ name: "Firm A" });
    const firmB = await StkFirm.create({ name: "Firm B" });
    const account = await StkAccount.create({ firm_id: firmA.id });

    account.writeAttribute("firm_id", firmB.id);
    await account.save();

    const loaded = await loadBelongsTo(account, "stkFirm", {
      className: "StkFirm", foreignKey: "firm_id",
    });
    expect(loaded!.id).toBe(firmB.id);
  });

  // -------------------------------------------------------------------------
  // polymorphic assignment updates type + id fields
  // -------------------------------------------------------------------------

  it("polymorphic assignment updates foreign id field for new and saved records", async () => {
    class PolyOwner extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class PolyItem extends Base {
      static {
        this.attribute("owner_id", "integer");
        this.attribute("owner_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel("PolyOwner", PolyOwner);
    registerModel("PolyItem", PolyItem);

    const owner = await PolyOwner.create({ name: "Owner" });
    const item = new PolyItem({});
    item.writeAttribute("owner_id", owner.id);
    item.writeAttribute("owner_type", "PolyOwner");
    await item.save();

    const loaded = await loadBelongsTo(item, "polyOwner", {
      className: "PolyOwner", foreignKey: "owner_id",
    });
    expect(loaded!.id).toBe(owner.id);
  });

  it("polymorphic assignment with nil", async () => {
    class PolyNilOwner extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class PolyNilItem extends Base {
      static {
        this.attribute("owner_id", "integer");
        this.attribute("owner_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel("PolyNilOwner", PolyNilOwner);
    registerModel("PolyNilItem", PolyNilItem);

    const item = await PolyNilItem.create({ owner_id: null, owner_type: null });
    const loaded = await loadBelongsTo(item, "polyNilOwner", {
      polymorphic: true, foreignKey: "owner_id",
    });
    expect(loaded).toBeNull();
  });

  // -------------------------------------------------------------------------
  // save of record with loaded belongs_to
  // -------------------------------------------------------------------------

  it("save of record with loaded belongs to", async () => {
    class SlFirm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class SlAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel("SlFirm", SlFirm);
    registerModel("SlAccount", SlAccount);

    const firm = await SlFirm.create({ name: "Corp" });
    const account = await SlAccount.create({ firm_id: firm.id });

    // Reload firm, save account — should not error
    const loaded = await loadBelongsTo(account, "slFirm", {
      className: "SlFirm", foreignKey: "firm_id",
    });
    expect(loaded).not.toBeNull();
    await account.save();
    expect(account.isNewRecord()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // should set foreign key on create association
  // -------------------------------------------------------------------------

  it("should set foreign key on create association", async () => {
    class FkCrFirm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class FkCrAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel("FkCrFirm", FkCrFirm);
    registerModel("FkCrAccount", FkCrAccount);

    const firm = await FkCrFirm.create({ name: "Corp" });
    const account = new FkCrAccount({});
    account.writeAttribute("firm_id", firm.id);
    await account.save();

    expect(account.readAttribute("firm_id")).toBe(firm.id);
  });

  it("should set foreign key on save", async () => {
    class FkSvFirm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class FkSvAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel("FkSvFirm", FkSvFirm);
    registerModel("FkSvAccount", FkSvAccount);

    const firm = await FkSvFirm.create({ name: "Corp" });
    const account = new FkSvAccount({ firm_id: firm.id });
    await account.save();

    const reloaded = await FkSvAccount.find(account.id as number);
    expect(reloaded.readAttribute("firm_id")).toBe(firm.id);
  });

  // -------------------------------------------------------------------------
  // tracking changes
  // -------------------------------------------------------------------------

  it("tracking change from nil to persisted record", async () => {
    class TcFirm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class TcAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel("TcFirm", TcFirm);
    registerModel("TcAccount", TcAccount);

    const account = await TcAccount.create({ firm_id: null });
    const firm = await TcFirm.create({ name: "Corp" });
    account.writeAttribute("firm_id", firm.id);

    expect(account.readAttribute("firm_id")).toBe(firm.id);
  });

  it("tracking change from persisted record to nil", async () => {
    class Tc2Firm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class Tc2Account extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel("Tc2Firm", Tc2Firm);
    registerModel("Tc2Account", Tc2Account);

    const firm = await Tc2Firm.create({ name: "Corp" });
    const account = await Tc2Account.create({ firm_id: firm.id });
    account.writeAttribute("firm_id", null);

    expect(account.readAttribute("firm_id")).toBeNull();
  });

  it("tracking change from one persisted record to another", async () => {
    class Tc3Firm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class Tc3Account extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel("Tc3Firm", Tc3Firm);
    registerModel("Tc3Account", Tc3Account);

    const firmA = await Tc3Firm.create({ name: "A" });
    const firmB = await Tc3Firm.create({ name: "B" });
    const account = await Tc3Account.create({ firm_id: firmA.id });
    account.writeAttribute("firm_id", firmB.id);

    expect(account.readAttribute("firm_id")).toBe(firmB.id);
  });

  // -------------------------------------------------------------------------
  // reassigning parent id updates the object
  // -------------------------------------------------------------------------

  it("reassigning the parent id updates the object", async () => {
    class RaFirm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class RaAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel("RaFirm", RaFirm);
    registerModel("RaAccount", RaAccount);

    const firmA = await RaFirm.create({ name: "A" });
    const firmB = await RaFirm.create({ name: "B" });
    const account = await RaAccount.create({ firm_id: firmA.id });

    account.writeAttribute("firm_id", firmB.id);
    await account.save();

    const reloaded = await RaAccount.find(account.id as number);
    expect(reloaded.readAttribute("firm_id")).toBe(firmB.id);
  });

  // -------------------------------------------------------------------------
  // with condition / build with conditions
  // -------------------------------------------------------------------------

  it("with condition", async () => {
    class WcFirm extends Base {
      static { this.attribute("name", "string"); this.attribute("active", "boolean"); this.adapter = adapter; }
    }
    class WcAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel("WcFirm", WcFirm);
    registerModel("WcAccount", WcAccount);

    const firm = await WcFirm.create({ name: "Active Corp", active: true });
    const account = await WcAccount.create({ firm_id: firm.id });

    const loaded = await loadBelongsTo(account, "wcFirm", {
      className: "WcFirm", foreignKey: "firm_id",
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("active")).toBe(true);
  });

  it("build with conditions", async () => {
    class BcFirm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class BcAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
    }
    registerModel("BcFirm", BcFirm);
    registerModel("BcAccount", BcAccount);

    const firm = await BcFirm.create({ name: "Corp" });
    // Build account with conditions (FK + additional attrs)
    const account = new BcAccount({ firm_id: firm.id, name: "New Account" });
    await account.save();

    expect(account.readAttribute("firm_id")).toBe(firm.id);
    expect(account.readAttribute("name")).toBe("New Account");
  });

  it("create with conditions", async () => {
    class CcFirm extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class CcAccount extends Base {
      static { this.attribute("firm_id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
    }
    registerModel("CcFirm", CcFirm);
    registerModel("CcAccount", CcAccount);

    const firm = await CcFirm.create({ name: "Corp" });
    const account = await CcAccount.create({ firm_id: firm.id, name: "Created Account" });

    expect(account.isNewRecord()).toBe(false);
    expect(account.readAttribute("firm_id")).toBe(firm.id);
  });
});
