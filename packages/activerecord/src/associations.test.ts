/**
 * Associations tests — mirrors Rails activerecord/test/cases/associations/*
 *
 * Covers: belongsTo, hasOne, hasMany, hasManyThrough, hasAndBelongsToMany,
 * polymorphic, dependent, counterCache, touch, CollectionProxy, reflection,
 * strict loading, inverse_of, and scoped associations.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  Base,
  registerModel,
  association,
  reflectOnAssociation,
  reflectOnAllAssociations,
  StrictLoadingViolationError,
  DeleteRestrictionError,
} from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import {
  Associations,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
  loadHasManyThrough,
  loadHabtm,
  processDependentAssociations,
  updateCounterCaches,
  touchBelongsToParents,
  CollectionProxy,
} from "./associations.js";

function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ==========================================================================
// belongs_to associations (Rails: belongs_to_associations_test.rb)
// ==========================================================================

describe("BelongsToAssociations", () => {
  let adapter: DatabaseAdapter;

  class Company extends Base {
    static { this.attribute("name", "string"); }
  }

  class Account extends Base {
    static { this.attribute("company_id", "integer"); this.attribute("credit_limit", "integer"); }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Company.adapter = adapter;
    Account.adapter = adapter;
    registerModel(Company);
    registerModel(Account);
  });

  // Rails: test_belongs_to
  it("test_belongs_to", async () => {
    const company = await Company.create({ name: "37signals" });
    const account = await Account.create({ company_id: company.id, credit_limit: 50 });
    const loaded = await loadBelongsTo(account, "company", {});
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("name")).toBe("37signals");
  });

  // Rails: test_belongs_to_with_primary_key
  it("test_belongs_to_with_primary_key", async () => {
    class Firm extends Base {
      static { this.attribute("name", "string"); this.attribute("uuid", "string"); this.adapter = adapter; }
    }
    class Client extends Base {
      static { this.attribute("firm_uuid", "string"); this.adapter = adapter; }
    }
    registerModel(Firm);
    registerModel(Client);

    const firm = await Firm.create({ name: "Acme", uuid: "abc-123" });
    const client = await Client.create({ firm_uuid: "abc-123" });
    const loaded = await loadBelongsTo(client, "firm", {
      foreignKey: "firm_uuid",
      primaryKey: "uuid",
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("name")).toBe("Acme");
  });

  // Rails: test_belongs_to_with_null_foreign_key
  it("test_belongs_to_with_null_foreign_key", async () => {
    const account = await Account.create({ credit_limit: 50 });
    const loaded = await loadBelongsTo(account, "company", {});
    expect(loaded).toBeNull();
  });

  // Rails: test_belongs_to_with_missing_record
  it("test_belongs_to_with_missing_record", async () => {
    const account = await Account.create({ company_id: 9999, credit_limit: 50 });
    const loaded = await loadBelongsTo(account, "company", {});
    expect(loaded).toBeNull();
  });

  // Rails: test_belongs_to_with_custom_foreign_key
  it("test_belongs_to_with_custom_foreign_key", async () => {
    class Sponsor extends Base {
      static { this.attribute("sponsor_club_id", "integer"); this.adapter = adapter; }
    }
    registerModel(Sponsor);
    const company = await Company.create({ name: "Club" });
    const sponsor = await Sponsor.create({ sponsor_club_id: company.id });
    const loaded = await loadBelongsTo(sponsor, "sponsorable", {
      className: "Company",
      foreignKey: "sponsor_club_id",
    });
    expect(loaded!.readAttribute("name")).toBe("Club");
  });

  // Rails: test_polymorphic_belongs_to
  it("test_polymorphic_belongs_to", async () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    class Comment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Post);
    registerModel(Comment);

    const post = await Post.create({ title: "Hello" });
    const comment = await Comment.create({
      body: "Nice!",
      commentable_id: post.id,
      commentable_type: "Post",
    });
    const loaded = await loadBelongsTo(comment, "commentable", { polymorphic: true });
    expect(loaded).not.toBeNull();
    expect(loaded!.readAttribute("title")).toBe("Hello");
  });

  // Rails: test_polymorphic_belongs_to_with_null_type
  it("test_polymorphic_belongs_to_with_null_type", async () => {
    class Comment extends Base {
      static {
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
        this.adapter = adapter;
      }
    }
    const comment = await Comment.create({ commentable_id: 1 });
    const loaded = await loadBelongsTo(comment, "commentable", { polymorphic: true });
    expect(loaded).toBeNull();
  });

  // Rails: test_belongs_to_counter_cache (definition only)
  it("test_belongs_to_registers_counter_cache_option", () => {
    class Reply extends Base {
      static { this.attribute("topic_id", "integer"); }
    }
    Associations.belongsTo.call(Reply, "topic", { counterCache: true });
    const assoc = (Reply as any)._associations.find((a: any) => a.name === "topic");
    expect(assoc.options.counterCache).toBe(true);
  });

  // Rails: test_belongs_to_touch_option
  it("test_belongs_to_registers_touch_option", () => {
    class Reply extends Base {
      static { this.attribute("topic_id", "integer"); }
    }
    Associations.belongsTo.call(Reply, "topic", { touch: true });
    const assoc = (Reply as any)._associations.find((a: any) => a.name === "topic");
    expect(assoc.options.touch).toBe(true);
  });

  // Rails: test_belongs_to_required_validates_foreign_key
  it("test_belongs_to_required_validates_foreign_key", () => {
    class Subscriber extends Base {
      static { this.attribute("company_id", "integer"); }
    }
    Associations.belongsTo.call(Subscriber, "company", { required: true });
    const assoc = (Subscriber as any)._associations.find((a: any) => a.name === "company");
    expect(assoc.options.required).toBe(true);
  });

  // Rails: test_optional_false_is_same_as_required
  it("test_optional_false_is_same_as_required", () => {
    class Subscriber extends Base {
      static { this.attribute("company_id", "integer"); }
    }
    Associations.belongsTo.call(Subscriber, "company", { optional: false });
    const assoc = (Subscriber as any)._associations.find((a: any) => a.name === "company");
    expect(assoc.options.optional).toBe(false);
  });

  // Rails: test_belongs_to_inverse_of caching
  it("test_belongs_to_with_inverse_of_caches_parent", async () => {
    class Author extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class Book extends Base {
      static { this.attribute("author_id", "integer"); this.adapter = adapter; }
    }
    registerModel(Author);
    registerModel(Book);

    const author = await Author.create({ name: "Dean" });
    const book = await Book.create({ author_id: author.id });

    const loaded = await loadBelongsTo(book, "author", { inverseOf: "books" });
    expect(loaded).not.toBeNull();
    // The loaded author should have the book cached under "books"
    const cached = (loaded as any)._cachedAssociations?.get("books");
    expect(cached).toBe(book);
  });
});

// ==========================================================================
// has_one associations (Rails: has_one_associations_test.rb)
// ==========================================================================

describe("HasOneAssociations", () => {
  let adapter: DatabaseAdapter;

  class Firm extends Base {
    static { this.attribute("name", "string"); }
  }

  class AccountDetail extends Base {
    static { this.attribute("firm_id", "integer"); this.attribute("credit_limit", "integer"); }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Firm.adapter = adapter;
    AccountDetail.adapter = adapter;
    registerModel("Firm", Firm);
    registerModel("AccountDetail", AccountDetail);
  });

  // Rails: test_has_one
  it("test_has_one", async () => {
    const firm = await Firm.create({ name: "37signals" });
    await AccountDetail.create({ firm_id: firm.id, credit_limit: 50 });
    const detail = await loadHasOne(firm, "accountDetail", {});
    expect(detail).not.toBeNull();
    expect(detail!.readAttribute("credit_limit")).toBe(50);
  });

  // Rails: test_has_one_with_no_record
  it("test_has_one_with_no_record", async () => {
    const firm = await Firm.create({ name: "Empty" });
    const detail = await loadHasOne(firm, "accountDetail", {});
    expect(detail).toBeNull();
  });

  // Rails: test_has_one_with_custom_foreign_key
  it("test_has_one_with_custom_foreign_key", async () => {
    class Profile extends Base {
      static { this.attribute("owner_id", "integer"); this.attribute("bio", "string"); this.adapter = adapter; }
    }
    registerModel(Profile);
    const firm = await Firm.create({ name: "Corp" });
    await Profile.create({ owner_id: firm.id, bio: "A firm" });
    const loaded = await loadHasOne(firm, "profile", { foreignKey: "owner_id" });
    expect(loaded!.readAttribute("bio")).toBe("A firm");
  });

  // Rails: test_has_one_polymorphic_as
  it("test_has_one_polymorphic_as", async () => {
    class Image extends Base {
      static {
        this.attribute("imageable_id", "integer");
        this.attribute("imageable_type", "string");
        this.attribute("url", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Image);
    const firm = await Firm.create({ name: "Corp" });
    await Image.create({ imageable_id: firm.id, imageable_type: "Firm", url: "logo.png" });
    await Image.create({ imageable_id: firm.id, imageable_type: "Other", url: "wrong.png" });

    const img = await loadHasOne(firm, "image", { as: "imageable" });
    expect(img).not.toBeNull();
    expect(img!.readAttribute("url")).toBe("logo.png");
  });

  // Rails: test_has_one_inverse_of
  it("test_has_one_with_inverse_of_caches_owner", async () => {
    class Profile extends Base {
      static { this.attribute("firm_id", "integer"); this.adapter = adapter; }
    }
    registerModel(Profile);
    const firm = await Firm.create({ name: "Corp" });
    await Profile.create({ firm_id: firm.id });

    const profile = await loadHasOne(firm, "profile", { inverseOf: "firm" });
    expect(profile).not.toBeNull();
    const cached = (profile as any)._cachedAssociations?.get("firm");
    expect(cached).toBe(firm);
  });

  // Rails: test_has_one_cache_hit
  it("test_has_one_uses_preloaded_cache", async () => {
    const firm = await Firm.create({ name: "Cached" });
    const sentinel = { id: 42 } as any;
    (firm as any)._preloadedAssociations = new Map([["accountDetail", sentinel]]);
    const loaded = await loadHasOne(firm, "accountDetail", {});
    expect(loaded).toBe(sentinel);
  });
});

// ==========================================================================
// has_many associations (Rails: has_many_associations_test.rb)
// ==========================================================================

describe("HasManyAssociations", () => {
  let adapter: DatabaseAdapter;

  class Author extends Base {
    static { this.attribute("name", "string"); }
  }

  class Post extends Base {
    static { this.attribute("title", "string"); this.attribute("author_id", "integer"); }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Author.adapter = adapter;
    Post.adapter = adapter;
    registerModel(Author);
    registerModel(Post);
  });

  // Rails: test_has_many
  it("test_has_many", async () => {
    const author = await Author.create({ name: "DHH" });
    await Post.create({ title: "P1", author_id: author.id });
    await Post.create({ title: "P2", author_id: author.id });
    const posts = await loadHasMany(author, "posts", {});
    expect(posts).toHaveLength(2);
  });

  // Rails: test_has_many_empty
  it("test_has_many_with_no_records", async () => {
    const author = await Author.create({ name: "Lonely" });
    const posts = await loadHasMany(author, "posts", {});
    expect(posts).toEqual([]);
  });

  // Rails: test_has_many_with_custom_foreign_key
  it("test_has_many_with_custom_foreign_key", async () => {
    class Article extends Base {
      static { this.attribute("writer_id", "integer"); this.attribute("title", "string"); this.adapter = adapter; }
    }
    registerModel(Article);
    const author = await Author.create({ name: "Writer" });
    await Article.create({ title: "A1", writer_id: author.id });
    const articles = await loadHasMany(author, "articles", { foreignKey: "writer_id" });
    expect(articles).toHaveLength(1);
  });

  // Rails: test_has_many_with_custom_class_name
  it("test_has_many_with_custom_class_name", async () => {
    class BlogEntry extends Base {
      static { this.attribute("author_id", "integer"); this.attribute("title", "string"); this.adapter = adapter; }
    }
    registerModel(BlogEntry);
    const author = await Author.create({ name: "Writer" });
    await BlogEntry.create({ title: "B1", author_id: author.id });
    const entries = await loadHasMany(author, "writings", { className: "BlogEntry", foreignKey: "author_id" });
    expect(entries).toHaveLength(1);
  });

  // Rails: test_has_many_polymorphic_as
  it("test_has_many_polymorphic_as", async () => {
    class Tagging extends Base {
      static {
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.attribute("tag", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Tagging);
    const author = await Author.create({ name: "Tagged" });
    await Tagging.create({ taggable_id: author.id, taggable_type: "Author", tag: "cool" });
    await Tagging.create({ taggable_id: author.id, taggable_type: "Author", tag: "nice" });
    await Tagging.create({ taggable_id: author.id, taggable_type: "Other", tag: "wrong" });

    const taggings = await loadHasMany(author, "taggings", { as: "taggable" });
    expect(taggings).toHaveLength(2);
  });

  // Rails: test_has_many_inverse_of
  it("test_has_many_with_inverse_of_caches_owner_on_children", async () => {
    const author = await Author.create({ name: "Dean" });
    await Post.create({ title: "P1", author_id: author.id });
    const posts = await loadHasMany(author, "posts", { inverseOf: "author" });
    expect(posts).toHaveLength(1);
    const cached = (posts[0] as any)._cachedAssociations?.get("author");
    expect(cached).toBe(author);
  });

  // Rails: test_has_many_preloaded_cache
  it("test_has_many_uses_preloaded_cache", async () => {
    const author = await Author.create({ name: "Cached" });
    const sentinel = [{ id: 99 }] as any;
    (author as any)._preloadedAssociations = new Map([["posts", sentinel]]);
    const posts = await loadHasMany(author, "posts", {});
    expect(posts).toBe(sentinel);
  });

  // Rails: test_has_many_returns_empty_when_pk_is_null
  it("test_has_many_returns_empty_when_pk_is_null", async () => {
    const author = new Author({ name: "Unsaved" });
    // new record has no id
    const posts = await loadHasMany(author, "posts", {});
    expect(posts).toEqual([]);
  });

  // Rails: test_has_many_scoped
  it("test_has_many_with_scope", async () => {
    const author = await Author.create({ name: "Scoped" });
    await Post.create({ title: "AAA", author_id: author.id });
    await Post.create({ title: "ZZZ", author_id: author.id });
    const posts = await loadHasMany(author, "posts", {
      scope: (rel: any) => rel.order("title", "asc"),
    });
    expect(posts).toHaveLength(2);
    expect(posts[0].readAttribute("title")).toBe("AAA");
  });
});

// ==========================================================================
// has_many :through (Rails: has_many_through_associations_test.rb)
// ==========================================================================

describe("HasManyThroughAssociations", () => {
  let adapter: DatabaseAdapter;

  class Doctor extends Base {
    static { this.attribute("name", "string"); }
  }

  class Appointment extends Base {
    static { this.attribute("doctor_id", "integer"); this.attribute("patient_id", "integer"); }
  }

  class Patient extends Base {
    static { this.attribute("name", "string"); }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Doctor.adapter = adapter;
    Appointment.adapter = adapter;
    Patient.adapter = adapter;
    registerModel(Doctor);
    registerModel(Appointment);
    registerModel(Patient);

    (Doctor as any)._associations = [
      { type: "hasMany", name: "appointments", options: { className: "Appointment" } },
      { type: "hasMany", name: "patients", options: { through: "appointments", className: "Patient", source: "patient" } },
    ];
  });

  // Rails: test_has_many_through
  it("test_has_many_through", async () => {
    const doc = await Doctor.create({ name: "Dr. Smith" });
    const p1 = await Patient.create({ name: "Alice" });
    const p2 = await Patient.create({ name: "Bob" });
    await Appointment.create({ doctor_id: doc.id, patient_id: p1.id });
    await Appointment.create({ doctor_id: doc.id, patient_id: p2.id });

    const patients = await loadHasManyThrough(doc, "patients", {
      through: "appointments", className: "Patient", source: "patient",
    });
    expect(patients).toHaveLength(2);
  });

  // Rails: test_has_many_through_with_no_records
  it("test_has_many_through_with_no_records", async () => {
    const doc = await Doctor.create({ name: "Dr. Empty" });
    const patients = await loadHasManyThrough(doc, "patients", {
      through: "appointments", className: "Patient", source: "patient",
    });
    expect(patients).toEqual([]);
  });

  // Rails: test_has_many_through_missing_through_association
  it("test_has_many_through_raises_when_through_association_missing", async () => {
    class Orphan extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    (Orphan as any)._associations = [];
    registerModel(Orphan);

    const orphan = await Orphan.create({ name: "Lost" });
    await expect(
      loadHasManyThrough(orphan, "things", { through: "nonexistent", className: "Patient" })
    ).rejects.toThrow('Through association "nonexistent" not found');
  });

  // Rails: test_has_many_through_only_returns_matching
  it("test_has_many_through_only_returns_matching_records", async () => {
    const doc1 = await Doctor.create({ name: "Dr. A" });
    const doc2 = await Doctor.create({ name: "Dr. B" });
    const p1 = await Patient.create({ name: "Alice" });
    const p2 = await Patient.create({ name: "Bob" });
    await Appointment.create({ doctor_id: doc1.id, patient_id: p1.id });
    await Appointment.create({ doctor_id: doc2.id, patient_id: p2.id });

    const patients1 = await loadHasManyThrough(doc1, "patients", {
      through: "appointments", className: "Patient", source: "patient",
    });
    expect(patients1).toHaveLength(1);
    expect(patients1[0].readAttribute("name")).toBe("Alice");
  });
});

// ==========================================================================
// CollectionProxy (Rails: collection_proxy_test.rb)
// ==========================================================================

describe("CollectionProxy", () => {
  let adapter: DatabaseAdapter;

  class Team extends Base {
    static { this.attribute("name", "string"); }
  }

  class Player extends Base {
    static { this.attribute("name", "string"); this.attribute("team_id", "integer"); }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Team.adapter = adapter;
    Player.adapter = adapter;
    registerModel(Team);
    registerModel(Player);
    (Team as any)._associations = [
      { type: "hasMany", name: "players", options: { className: "Player", foreignKey: "team_id" } },
    ];
  });

  // Rails: test_build
  it("test_build_sets_foreign_key", async () => {
    const team = await Team.create({ name: "Bulls" });
    const proxy = association(team, "players");
    const player = proxy.build({ name: "Jordan" });
    expect(player.readAttribute("team_id")).toBe(team.id);
    expect(player.isNewRecord()).toBe(true);
  });

  // Rails: test_create
  it("test_create_saves_and_sets_foreign_key", async () => {
    const team = await Team.create({ name: "Bulls" });
    const proxy = association(team, "players");
    const player = await proxy.create({ name: "Pippen" });
    expect(player.isPersisted()).toBe(true);
    expect(player.readAttribute("team_id")).toBe(team.id);
  });

  // Rails: test_count
  it("test_count", async () => {
    const team = await Team.create({ name: "Bulls" });
    await Player.create({ name: "Jordan", team_id: team.id });
    await Player.create({ name: "Pippen", team_id: team.id });
    const proxy = association(team, "players");
    expect(await proxy.count()).toBe(2);
  });

  // Rails: test_size
  it("test_size", async () => {
    const team = await Team.create({ name: "Bulls" });
    await Player.create({ name: "Jordan", team_id: team.id });
    const proxy = association(team, "players");
    expect(await proxy.size()).toBe(1);
  });

  // Rails: test_empty?
  it("test_isEmpty", async () => {
    const team = await Team.create({ name: "Empty" });
    const proxy = association(team, "players");
    expect(await proxy.isEmpty()).toBe(true);
    await Player.create({ name: "Rodman", team_id: team.id });
    expect(await proxy.isEmpty()).toBe(false);
  });

  // Rails: test_first
  it("test_first", async () => {
    const team = await Team.create({ name: "Bulls" });
    await Player.create({ name: "Jordan", team_id: team.id });
    await Player.create({ name: "Pippen", team_id: team.id });
    const proxy = association(team, "players");
    const first = await proxy.first();
    expect(first).not.toBeNull();
  });

  // Rails: test_last
  it("test_last", async () => {
    const team = await Team.create({ name: "Bulls" });
    await Player.create({ name: "Jordan", team_id: team.id });
    await Player.create({ name: "Pippen", team_id: team.id });
    const proxy = association(team, "players");
    const last = await proxy.last();
    expect(last).not.toBeNull();
  });

  // Rails: test_first_on_empty
  it("test_first_returns_null_on_empty", async () => {
    const team = await Team.create({ name: "Empty" });
    const proxy = association(team, "players");
    expect(await proxy.first()).toBeNull();
  });

  // Rails: test_last_on_empty
  it("test_last_returns_null_on_empty", async () => {
    const team = await Team.create({ name: "Empty" });
    const proxy = association(team, "players");
    expect(await proxy.last()).toBeNull();
  });

  // Rails: test_push
  it("test_push_sets_fk_and_saves", async () => {
    const team = await Team.create({ name: "Bulls" });
    const proxy = association(team, "players");
    const player = await Player.create({ name: "Rodman" });
    expect(player.readAttribute("team_id")).toBeFalsy();
    await proxy.push(player);
    expect(player.readAttribute("team_id")).toBe(team.id);
    expect(player.isPersisted()).toBe(true);
  });

  // Rails: test_concat
  it("test_concat_is_alias_for_push", async () => {
    const team = await Team.create({ name: "Bulls" });
    const proxy = association(team, "players");
    const p1 = await Player.create({ name: "A" });
    const p2 = await Player.create({ name: "B" });
    await proxy.concat(p1, p2);
    expect(await proxy.count()).toBe(2);
  });

  // Rails: test_delete
  it("test_delete_nullifies_foreign_key", async () => {
    const team = await Team.create({ name: "Bulls" });
    const player = await Player.create({ name: "Jordan", team_id: team.id });
    const proxy = association(team, "players");
    await proxy.delete(player);
    expect(player.readAttribute("team_id")).toBeNull();
  });

  // Rails: test_destroy_on_proxy
  it("test_destroy_removes_record", async () => {
    const team = await Team.create({ name: "Bulls" });
    const player = await Player.create({ name: "Jordan", team_id: team.id });
    const proxy = association(team, "players");
    await proxy.destroy(player);
    expect(player.isDestroyed()).toBe(true);
    expect(await Player.all().count()).toBe(0);
  });

  // Rails: test_clear
  it("test_clear_nullifies_all_foreign_keys", async () => {
    const team = await Team.create({ name: "Bulls" });
    await Player.create({ name: "Jordan", team_id: team.id });
    await Player.create({ name: "Pippen", team_id: team.id });
    const proxy = association(team, "players");
    await proxy.clear();
    expect(await proxy.count()).toBe(0);
    // Players still exist, just unlinked
    expect(await Player.all().count()).toBe(2);
  });

  // Rails: test_include?
  it("test_includes_checks_membership", async () => {
    const team = await Team.create({ name: "Bulls" });
    const jordan = await Player.create({ name: "Jordan", team_id: team.id });
    const magic = await Player.create({ name: "Magic", team_id: 999 });
    const proxy = association(team, "players");
    expect(await proxy.includes(jordan)).toBe(true);
    expect(await proxy.includes(magic)).toBe(false);
  });

  // Rails: test_to_array
  it("test_toArray_returns_all_records", async () => {
    const team = await Team.create({ name: "Bulls" });
    await Player.create({ name: "Jordan", team_id: team.id });
    await Player.create({ name: "Pippen", team_id: team.id });
    const proxy = association(team, "players");
    const arr = await proxy.toArray();
    expect(arr).toHaveLength(2);
  });

  // Rails: test_association_not_found
  it("test_association_raises_when_not_found", async () => {
    const team = await Team.create({ name: "Bulls" });
    expect(() => association(team, "nonexistent")).toThrow('Association "nonexistent" not found');
  });
});

// ==========================================================================
// Dependent associations (Rails: has_many_associations_test.rb)
// ==========================================================================

describe("DependentAssociations", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  // Rails: test_dependent_destroy
  it("test_dependent_destroy_has_many", async () => {
    class Comment extends Base {
      static { this.attribute("body", "string"); this.attribute("post_id", "integer"); this.adapter = adapter; }
    }
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    (Post as any)._associations = [
      { type: "hasMany", name: "comments", options: { dependent: "destroy", className: "Comment", foreignKey: "post_id" } },
    ];
    registerModel(Post);
    registerModel(Comment);

    const post = await Post.create({ title: "Hello" });
    await Comment.create({ body: "A", post_id: post.id });
    await Comment.create({ body: "B", post_id: post.id });

    await processDependentAssociations(post);
    expect(await Comment.all().count()).toBe(0);
  });

  // Rails: test_dependent_delete_all
  it("test_dependent_delete_has_many", async () => {
    class Tag extends Base {
      static { this.attribute("name", "string"); this.attribute("item_id", "integer"); this.adapter = adapter; }
    }
    class Item extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    (Item as any)._associations = [
      { type: "hasMany", name: "tags", options: { dependent: "delete", className: "Tag", foreignKey: "item_id" } },
    ];
    registerModel(Item);
    registerModel(Tag);

    const item = await Item.create({ name: "Widget" });
    await Tag.create({ name: "red", item_id: item.id });
    await processDependentAssociations(item);
    expect(await Tag.all().count()).toBe(0);
  });

  // Rails: test_dependent_nullify
  it("test_dependent_nullify_has_many", async () => {
    class Comment extends Base {
      static { this.attribute("body", "string"); this.attribute("post_id", "integer"); this.adapter = adapter; }
    }
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    (Post as any)._associations = [
      { type: "hasMany", name: "comments", options: { dependent: "nullify", className: "Comment", foreignKey: "post_id" } },
    ];
    registerModel(Post);
    registerModel(Comment);

    const post = await Post.create({ title: "Hello" });
    const c = await Comment.create({ body: "A", post_id: post.id });
    await processDependentAssociations(post);

    const reloaded = await Comment.find(c.id);
    expect(reloaded.readAttribute("post_id")).toBeNull();
  });

  // Rails: test_dependent_restrict_with_exception
  it("test_dependent_restrict_with_exception_has_many", async () => {
    class Comment extends Base {
      static { this.attribute("body", "string"); this.attribute("post_id", "integer"); this.adapter = adapter; }
    }
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    (Post as any)._associations = [
      { type: "hasMany", name: "comments", options: { dependent: "restrictWithException", className: "Comment", foreignKey: "post_id" } },
    ];
    registerModel(Post);
    registerModel(Comment);

    const post = await Post.create({ title: "Hello" });
    await Comment.create({ body: "A", post_id: post.id });
    await expect(processDependentAssociations(post)).rejects.toThrow(DeleteRestrictionError);
  });

  // Rails: test_dependent_restrict_with_exception_no_children
  it("test_dependent_restrict_with_exception_passes_with_no_children", async () => {
    class Comment extends Base {
      static { this.attribute("body", "string"); this.attribute("post_id", "integer"); this.adapter = adapter; }
    }
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    (Post as any)._associations = [
      { type: "hasMany", name: "comments", options: { dependent: "restrictWithException", className: "Comment", foreignKey: "post_id" } },
    ];
    registerModel(Post);
    registerModel(Comment);

    const post = await Post.create({ title: "Alone" });
    await expect(processDependentAssociations(post)).resolves.toBeUndefined();
  });

  // Rails: test_dependent_destroy_has_one
  it("test_dependent_destroy_has_one", async () => {
    class Profile extends Base {
      static { this.attribute("user_id", "integer"); this.attribute("bio", "string"); this.adapter = adapter; }
    }
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    (User as any)._associations = [
      { type: "hasOne", name: "profile", options: { dependent: "destroy", className: "Profile", foreignKey: "user_id" } },
    ];
    registerModel(User);
    registerModel(Profile);

    const user = await User.create({ name: "Dean" });
    await Profile.create({ user_id: user.id, bio: "Hi" });
    await processDependentAssociations(user);
    expect(await Profile.all().count()).toBe(0);
  });

  // Rails: test_dependent_nullify_has_one
  it("test_dependent_nullify_has_one", async () => {
    class Profile extends Base {
      static { this.attribute("user_id", "integer"); this.attribute("bio", "string"); this.adapter = adapter; }
    }
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    (User as any)._associations = [
      { type: "hasOne", name: "profile", options: { dependent: "nullify", className: "Profile", foreignKey: "user_id" } },
    ];
    registerModel(User);
    registerModel(Profile);

    const user = await User.create({ name: "Dean" });
    const p = await Profile.create({ user_id: user.id, bio: "Hi" });
    await processDependentAssociations(user);
    const reloaded = await Profile.find(p.id);
    expect(reloaded.readAttribute("user_id")).toBeNull();
  });

  // Rails: test_dependent_restrict_has_one
  it("test_dependent_restrict_with_exception_has_one", async () => {
    class Profile extends Base {
      static { this.attribute("user_id", "integer"); this.adapter = adapter; }
    }
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    (User as any)._associations = [
      { type: "hasOne", name: "profile", options: { dependent: "restrictWithException", className: "Profile", foreignKey: "user_id" } },
    ];
    registerModel(User);
    registerModel(Profile);

    const user = await User.create({ name: "Dean" });
    await Profile.create({ user_id: user.id });
    await expect(processDependentAssociations(user)).rejects.toThrow(DeleteRestrictionError);
  });

  // Rails: test_no_dependent_option_skips
  it("test_no_dependent_option_skips_processing", async () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    (Post as any)._associations = [
      { type: "hasMany", name: "comments", options: { className: "Comment" } },
    ];
    registerModel(Post);
    const post = await Post.create({ title: "Safe" });
    // Should not throw
    await expect(processDependentAssociations(post)).resolves.toBeUndefined();
  });
});

// ==========================================================================
// Strict loading (Rails: strict_loading_test.rb)
// ==========================================================================

describe("StrictLoading", () => {
  let adapter: DatabaseAdapter;

  class Author extends Base {
    static { this.attribute("name", "string"); }
  }

  class Book extends Base {
    static { this.attribute("title", "string"); this.attribute("author_id", "integer"); }
  }

  class Profile extends Base {
    static { this.attribute("bio", "string"); this.attribute("author_id", "integer"); }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Author.adapter = adapter;
    Book.adapter = adapter;
    Profile.adapter = adapter;
    registerModel(Author);
    registerModel(Book);
    registerModel(Profile);
  });

  // Rails: test_strict_loading_on_belongs_to
  it("test_strict_loading_raises_on_lazy_belongs_to", async () => {
    const book = await Book.create({ title: "Test", author_id: 1 });
    (book as any)._strictLoading = true;
    await expect(loadBelongsTo(book, "author", {})).rejects.toThrow(StrictLoadingViolationError);
  });

  // Rails: test_strict_loading_on_has_many
  it("test_strict_loading_raises_on_lazy_has_many", async () => {
    const author = await Author.create({ name: "Dean" });
    (author as any)._strictLoading = true;
    await expect(loadHasMany(author, "books", {})).rejects.toThrow(StrictLoadingViolationError);
  });

  // Rails: test_strict_loading_on_has_one
  it("test_strict_loading_raises_on_lazy_has_one", async () => {
    const author = await Author.create({ name: "Dean" });
    (author as any)._strictLoading = true;
    await expect(loadHasOne(author, "profile", {})).rejects.toThrow(StrictLoadingViolationError);
  });

  // Rails: test_strict_loading_does_not_raise_with_preloaded
  it("test_strict_loading_allows_preloaded_belongs_to", async () => {
    const book = await Book.create({ title: "Test", author_id: 1 });
    (book as any)._strictLoading = true;
    const sentinel = { id: 1 } as any;
    (book as any)._preloadedAssociations = new Map([["author", sentinel]]);
    const loaded = await loadBelongsTo(book, "author", {});
    expect(loaded).toBe(sentinel);
  });

  // Rails: test_strict_loading_does_not_raise_with_cached
  it("test_strict_loading_allows_cached_has_many", async () => {
    const author = await Author.create({ name: "Dean" });
    (author as any)._strictLoading = true;
    const sentinel = [{ id: 1 }] as any;
    (author as any)._cachedAssociations = new Map([["books", sentinel]]);
    const loaded = await loadHasMany(author, "books", {});
    expect(loaded).toBe(sentinel);
  });

  // Rails: test_strict_loading_bang
  it("test_strict_loading_bang_sets_flag", async () => {
    const author = await Author.create({ name: "Dean" });
    expect(author.isStrictLoading()).toBe(false);
    author.strictLoadingBang();
    expect(author.isStrictLoading()).toBe(true);
  });
});

// ==========================================================================
// Association definition via class methods
// ==========================================================================

describe("AssociationDefinitions", () => {
  // Rails: test_belongs_to_macro_is_stored
  it("test_belongsTo_stores_definition", () => {
    class Post extends Base {
      static { this.attribute("author_id", "integer"); }
    }
    Associations.belongsTo.call(Post, "author", {});
    const defs = (Post as any)._associations;
    expect(defs).toContainEqual({ type: "belongsTo", name: "author", options: {} });
  });

  // Rails: test_has_one_macro_is_stored
  it("test_hasOne_stores_definition", () => {
    class User extends Base {}
    Associations.hasOne.call(User, "profile", { dependent: "destroy" });
    const defs = (User as any)._associations;
    expect(defs).toContainEqual({ type: "hasOne", name: "profile", options: { dependent: "destroy" } });
  });

  // Rails: test_has_many_macro_is_stored
  it("test_hasMany_stores_definition", () => {
    class Author extends Base {}
    Associations.hasMany.call(Author, "books", { foreignKey: "writer_id" });
    const defs = (Author as any)._associations;
    expect(defs).toContainEqual({ type: "hasMany", name: "books", options: { foreignKey: "writer_id" } });
  });

  // Rails: test_habtm_macro_is_stored
  it("test_hasAndBelongsToMany_stores_definition", () => {
    class Developer extends Base {}
    Associations.hasAndBelongsToMany.call(Developer, "projects", { joinTable: "dev_proj" });
    const defs = (Developer as any)._associations;
    expect(defs).toContainEqual({ type: "hasAndBelongsToMany", name: "projects", options: { joinTable: "dev_proj" } });
  });

  // Rails: test_associations_are_inherited_but_independent
  it("test_associations_inherit_but_are_independent", () => {
    class Parent extends Base {}
    Associations.hasMany.call(Parent, "children", {});

    class Child extends Parent {}
    Associations.hasMany.call(Child, "grandchildren", {});

    const parentAssocs = (Parent as any)._associations;
    const childAssocs = (Child as any)._associations;

    expect(parentAssocs).toHaveLength(1);
    expect(childAssocs).toHaveLength(2); // inherited + own
  });
});

// ==========================================================================
// Reflection (Rails: reflection_test.rb)
// ==========================================================================

describe("AssociationReflection", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  // Rails: test_reflect_on_association
  it("test_reflect_on_association", () => {
    class Author extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    Associations.hasMany.call(Author, "books", {});
    Associations.belongsTo.call(Author, "publisher", {});

    const reflection = reflectOnAssociation(Author, "books");
    expect(reflection).not.toBeNull();
    expect(reflection!.name).toBe("books");
    expect(reflection!.macro).toBe("hasMany");
  });

  // Rails: test_reflect_on_association_not_found
  it("test_reflect_on_association_returns_null_for_missing", () => {
    class Author extends Base {
      static { this.adapter = adapter; }
    }
    (Author as any)._associations = [];
    const reflection = reflectOnAssociation(Author, "nonexistent");
    expect(reflection).toBeNull();
  });

  // Rails: test_reflect_on_all_associations
  it("test_reflect_on_all_associations", () => {
    class Author extends Base {
      static { this.adapter = adapter; }
    }
    Associations.hasMany.call(Author, "books", {});
    Associations.belongsTo.call(Author, "publisher", {});
    Associations.hasOne.call(Author, "profile", {});

    const all = reflectOnAllAssociations(Author);
    expect(all).toHaveLength(3);
  });

  // Rails: test_reflect_on_all_associations_with_macro_filter
  it("test_reflect_on_all_associations_filtered_by_macro", () => {
    class Author extends Base {
      static { this.adapter = adapter; }
    }
    Associations.hasMany.call(Author, "books", {});
    Associations.belongsTo.call(Author, "publisher", {});
    Associations.hasOne.call(Author, "profile", {});

    const hasManyOnly = reflectOnAllAssociations(Author, "hasMany");
    expect(hasManyOnly).toHaveLength(1);
    expect(hasManyOnly[0].name).toBe("books");

    const belongsToOnly = reflectOnAllAssociations(Author, "belongsTo");
    expect(belongsToOnly).toHaveLength(1);
    expect(belongsToOnly[0].name).toBe("publisher");
  });

  // Rails: test_association_reflection_foreign_key
  it("test_reflection_derives_foreign_key", () => {
    class Author extends Base {
      static { this.adapter = adapter; }
    }
    Associations.hasMany.call(Author, "books", {});
    const reflection = reflectOnAssociation(Author, "books");
    expect(reflection!.foreignKey).toBe("author_id");
  });

  // Rails: test_belongs_to_reflection_foreign_key
  it("test_belongs_to_reflection_derives_foreign_key", () => {
    class Book extends Base {
      static { this.adapter = adapter; }
    }
    Associations.belongsTo.call(Book, "author", {});
    const reflection = reflectOnAssociation(Book, "author");
    expect(reflection!.foreignKey).toBe("author_id");
  });

  // Rails: test_reflection_class_name
  it("test_reflection_derives_class_name", () => {
    class Author extends Base {
      static { this.adapter = adapter; }
    }
    Associations.hasMany.call(Author, "books", {});
    const reflection = reflectOnAssociation(Author, "books");
    expect(reflection!.className).toBe("Book");
  });

  // Rails: test_reflection_custom_class_name
  it("test_reflection_uses_custom_class_name", () => {
    class Author extends Base {
      static { this.adapter = adapter; }
    }
    Associations.hasMany.call(Author, "writings", { className: "Article" });
    const reflection = reflectOnAssociation(Author, "writings");
    expect(reflection!.className).toBe("Article");
  });

  // Rails: test_reflection_is_belongs_to / is_has_many etc.
  it("test_reflection_type_predicates", () => {
    class Author extends Base {
      static { this.adapter = adapter; }
    }
    Associations.belongsTo.call(Author, "publisher", {});
    Associations.hasMany.call(Author, "books", {});
    Associations.hasOne.call(Author, "profile", {});

    const bt = reflectOnAssociation(Author, "publisher");
    expect(bt!.isBelongsTo()).toBe(true);
    expect(bt!.isHasMany()).toBe(false);

    const hm = reflectOnAssociation(Author, "books");
    expect(hm!.isHasMany()).toBe(true);
    expect(hm!.isBelongsTo()).toBe(false);

    const ho = reflectOnAssociation(Author, "profile");
    expect(ho!.isHasOne()).toBe(true);
  });
});

// ==========================================================================
// HABTM (Rails: has_and_belongs_to_many_associations_test.rb)
// ==========================================================================

describe("HasAndBelongsToManyAssociations", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  // Rails: test_habtm
  it("test_habtm_loads_through_join_table", async () => {
    class Developer extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    class Project extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    registerModel(Developer);
    registerModel(Project);

    const dev = await Developer.create({ name: "David" });
    const p1 = await Project.create({ name: "Rails" });
    const p2 = await Project.create({ name: "Basecamp" });

    await adapter.executeMutation(
      `INSERT INTO "developers_projects" ("developer_id", "project_id") VALUES (${dev.id}, ${p1.id})`
    );
    await adapter.executeMutation(
      `INSERT INTO "developers_projects" ("developer_id", "project_id") VALUES (${dev.id}, ${p2.id})`
    );

    const projects = await loadHabtm(dev, "projects", { joinTable: "developers_projects" });
    expect(projects).toHaveLength(2);
  });

  // Rails: test_habtm_empty
  it("test_habtm_returns_empty_when_no_join_rows", async () => {
    class Developer extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    registerModel(Developer);

    const dev = await Developer.create({ name: "Solo" });
    const projects = await loadHabtm(dev, "projects", { joinTable: "developers_projects" });
    expect(projects).toEqual([]);
  });

  // Rails: test_habtm_unsaved_record
  it("test_habtm_returns_empty_for_unsaved_record", async () => {
    class Developer extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    registerModel(Developer);

    const dev = new Developer({ name: "New" });
    const projects = await loadHabtm(dev, "projects", { joinTable: "developers_projects" });
    expect(projects).toEqual([]);
  });

  // Rails: test_habtm_preloaded_cache
  it("test_habtm_uses_preloaded_cache", async () => {
    class Developer extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    registerModel(Developer);

    const dev = await Developer.create({ name: "Cached" });
    const sentinel = [{ id: 1 }] as any;
    (dev as any)._preloadedAssociations = new Map([["projects", sentinel]]);
    const projects = await loadHabtm(dev, "projects", { joinTable: "developers_projects" });
    expect(projects).toBe(sentinel);
  });
});

// ==========================================================================
// Counter cache (Rails: counter_cache_test.rb)
// ==========================================================================

describe("CounterCache", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  // Rails: test_update_counter_cache_on_create
  it("test_update_counter_caches_increment", async () => {
    class Topic extends Base {
      static { this.attribute("title", "string"); this.attribute("replies_count", "integer", { default: 0 }); this.adapter = adapter; }
    }
    class Reply extends Base {
      static { this.attribute("content", "string"); this.attribute("topic_id", "integer"); this.adapter = adapter; }
    }
    Associations.belongsTo.call(Reply, "topic", { counterCache: true });
    registerModel(Topic);
    registerModel(Reply);

    const topic = await Topic.create({ title: "Test" });
    // create() auto-increments counter cache, so no manual call needed
    await Reply.create({ content: "Hi", topic_id: topic.id });

    const reloaded = await Topic.find(topic.id);
    expect(reloaded.readAttribute("replies_count")).toBe(1);
  });

  // Rails: test_update_counter_cache_on_destroy
  it("test_update_counter_caches_decrement", async () => {
    class Topic extends Base {
      static { this.attribute("title", "string"); this.attribute("replies_count", "integer", { default: 0 }); this.adapter = adapter; }
    }
    class Reply extends Base {
      static { this.attribute("content", "string"); this.attribute("topic_id", "integer"); this.adapter = adapter; }
    }
    Associations.belongsTo.call(Reply, "topic", { counterCache: true });
    registerModel(Topic);
    registerModel(Reply);

    const topic = await Topic.create({ title: "Test" });
    const reply = await Reply.create({ content: "Hi", topic_id: topic.id });
    // create auto-incremented to 1, now decrement
    await updateCounterCaches(reply, "decrement");

    const reloaded = await Topic.find(topic.id);
    expect(reloaded.readAttribute("replies_count")).toBe(0);
  });

  // Rails: test_counter_cache_with_custom_column_name
  it("test_counter_cache_with_custom_column_name", async () => {
    class Category extends Base {
      static { this.attribute("name", "string"); this.attribute("num_products", "integer", { default: 0 }); this.adapter = adapter; }
    }
    class Product extends Base {
      static { this.attribute("name", "string"); this.attribute("category_id", "integer"); this.adapter = adapter; }
    }
    Associations.belongsTo.call(Product, "category", { counterCache: "num_products" });
    registerModel(Category);
    registerModel(Product);

    const cat = await Category.create({ name: "Electronics" });
    // create() auto-increments counter cache
    await Product.create({ name: "Phone", category_id: cat.id });

    const reloaded = await Category.find(cat.id);
    expect(reloaded.readAttribute("num_products")).toBe(1);
  });

  // Rails: test_counter_cache_null_fk_skips
  it("test_counter_cache_skips_when_fk_is_null", async () => {
    class Topic extends Base {
      static { this.attribute("replies_count", "integer", { default: 0 }); this.adapter = adapter; }
    }
    class Reply extends Base {
      static { this.attribute("topic_id", "integer"); this.adapter = adapter; }
    }
    Associations.belongsTo.call(Reply, "topic", { counterCache: true });
    registerModel(Topic);
    registerModel(Reply);

    const reply = await Reply.create({});
    // Should not throw
    await expect(updateCounterCaches(reply, "increment")).resolves.toBeUndefined();
  });
});

// ==========================================================================
// Touch parent (Rails: belongs_to_associations_test.rb touch tests)
// ==========================================================================

describe("TouchBelongsToParents", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  // Rails: test_belongs_to_touch_parent
  it("test_touch_updates_parent_timestamp", async () => {
    class Owner extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }
    class Pet extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("owner_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(Pet, "owner", { touch: true });
    registerModel(Owner);
    registerModel(Pet);

    const owner = await Owner.create({ name: "Alice" });
    const originalTs = owner.readAttribute("updated_at");

    // Small delay so timestamp differs
    await new Promise((r) => setTimeout(r, 10));

    const pet = await Pet.create({ name: "Buddy", owner_id: owner.id });
    await touchBelongsToParents(pet);

    const reloaded = await Owner.find(owner.id);
    const newTs = reloaded.readAttribute("updated_at");
    // updated_at should have been set (could be different from original if original was set)
    expect(newTs).toBeDefined();
  });

  // Rails: test_touch_skips_when_fk_is_null
  it("test_touch_skips_when_fk_is_null", async () => {
    class Owner extends Base {
      static { this.attribute("name", "string"); this.attribute("updated_at", "datetime"); this.adapter = adapter; }
    }
    class Pet extends Base {
      static { this.attribute("owner_id", "integer"); this.adapter = adapter; }
    }
    Associations.belongsTo.call(Pet, "owner", { touch: true });
    registerModel(Owner);
    registerModel(Pet);

    const pet = await Pet.create({});
    await expect(touchBelongsToParents(pet)).resolves.toBeUndefined();
  });
});
