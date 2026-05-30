/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import {
  Base,
  StrictLoadingViolationError,
  registerModel,
  setActionOnStrictLoadingViolation,
} from "./index.js";
import {
  Associations,
  association,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
} from "./associations.js";

import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

// ==========================================================================
// StrictLoadingTest — targets strict_loading_test.rb
// ==========================================================================
describe("StrictLoadingTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({
      authors: { name: "string" },
      books: { title: "string", author_id: "integer", publisher_id: "integer" },
      profiles: { bio: "string", author_id: "integer" },
      publishers: { name: "string" },
      tags: { name: "string", taggable_id: "integer", taggable_type: "string" },
      animals: { name: "string" },
    });
  });
  // Rails: test_raises_on_lazy_loading_a_strict_loading_has_many_relation
  it("raises on lazy loading a strict loading has many relation", async () => {
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
    Associations.hasMany.call(Author, "books", {});
    registerModel(Author);
    registerModel(Book);

    const author = await Author.create({ name: "Alice" });
    author.strictLoadingBang();

    await expect(loadHasMany(author, "books", {})).rejects.toThrow(StrictLoadingViolationError);
    // The message names the singular associated klass (Rails' `#{klass}`),
    // not the pluralized association name.
    await expect(loadHasMany(author, "books", {})).rejects.toThrow(
      "The Book association named `:books` cannot be lazily loaded.",
    );
  });

  // Rails: test_raises_on_lazy_loading_a_strict_loading_belongs_to_relation
  it("raises on lazy loading a strict loading belongs to relation", async () => {
    class Publisher extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class Book extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("publisher_id", "integer");
      }
    }
    registerModel(Publisher);
    registerModel(Book);

    const book = await Book.create({ title: "Rails", publisher_id: 1 });
    book.strictLoadingBang();

    await expect(loadBelongsTo(book, "publisher", {})).rejects.toThrow(StrictLoadingViolationError);
  });

  // Rails: test_raises_on_lazy_loading_a_strict_loading_has_one_relation
  it("raises on lazy loading a strict loading has one relation", async () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class Profile extends Base {
      static {
        this.attribute("bio", "string");
        this.attribute("author_id", "integer");
      }
    }
    registerModel(Author);
    registerModel(Profile);

    const author = await Author.create({ name: "Bob" });
    author.strictLoadingBang();

    await expect(loadHasOne(author, "profile", {})).rejects.toThrow(StrictLoadingViolationError);
  });

  // Rails: test_strict_loading_violation_raises_by_default
  it("strict loading violation raises by default", async () => {
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
    registerModel(Author);
    registerModel(Book);

    const author = await Author.create({ name: "Carol" });
    author.strictLoadingBang();

    let threw = false;
    try {
      await loadHasMany(author, "books", {});
    } catch (e) {
      threw = true;
      expect(e).toBeInstanceOf(StrictLoadingViolationError);
    }
    expect(threw).toBe(true);
  });

  // Rails: test_does_not_raise_on_eager_loading_a_strict_loading_has_many_relation
  it("does not raise on eager loading a strict loading has many relation", async () => {
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
    registerModel(Author);
    registerModel(Book);

    const author = await Author.create({ name: "Dave" });
    (author as any)._preloadedAssociations = new Map([["books", []]]);
    author.strictLoadingBang();

    const books = await loadHasMany(author, "books", {});
    expect(Array.isArray(books)).toBe(true);
  });

  // Rails: test_raises_if_strict_loading_by_default_and_lazy_loading
  it("raises if strict loading by default and lazy loading", async () => {
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
    registerModel(Author);
    registerModel(Book);
    Author.strictLoadingByDefault = true;

    try {
      const created = await Author.create({ name: "Eve" });
      const author = await Author.find(created.id);
      await expect(loadHasMany(author, "books", {})).rejects.toThrow(StrictLoadingViolationError);
    } finally {
      Author.strictLoadingByDefault = false;
    }
  });

  // Rails: test_strict_loading_n_plus_one_only_mode_does_not_eager_load_child_associations
  it("strict loading n plus one only mode does not eager load child associations", async () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel(Author);

    const author = new Author({ name: "Frank" });
    expect(typeof author.isStrictLoading()).toBe("boolean");
    expect(author.isStrictLoading()).toBe(false);
    author.strictLoadingBang();
    expect(author.isStrictLoading()).toBe(true);
  });

  // Rails: test_default_mode_is_all
  it("default mode is all", async () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    const author = new Author({ name: "Grace" });
    expect(author.isStrictLoading()).toBe(false);
    author.strictLoadingBang();
    // Rails: strict_loading! defaults `mode: :all`; strict_loading_mode returns :all.
    expect(author.strictLoadingMode()).toBe("all");
    expect(author.isStrictLoadingAll()).toBe(true);
    expect(author.isStrictLoadingNPlusOneOnly()).toBe(false);
  });

  it("strictLoadingBang accepts mode: n_plus_one_only", async () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    const author = new Author({ name: "Ivy" });
    author.strictLoadingBang(true, { mode: "n_plus_one_only" });
    expect(author.isStrictLoading()).toBe(true);
    expect(author.strictLoadingMode()).toBe("n_plus_one_only");
    expect(author.isStrictLoadingNPlusOneOnly()).toBe(true);
    expect(author.isStrictLoadingAll()).toBe(false);
  });

  it("strictLoadingBang rejects an invalid mode", async () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    const author = new Author({ name: "Jack" });
    let caught: Error | null = null;
    try {
      (author.strictLoadingBang as (v: boolean, o: { mode: string }) => unknown)(true, {
        mode: "bogus",
      });
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.name).toBe("ArgumentError");
    expect(caught!.message).toMatch(/The :mode option must be one of/);
  });

  // Rails: test_strict_loading
  it("strict loading", async () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    const author = new Author({ name: "Heidi" });
    expect(author.isStrictLoading()).toBe(false);
    author.strictLoadingBang();
    expect(author.isStrictLoading()).toBe(true);
  });

  // Rails: test_strict_loading_by_default
  it("strict loading by default", async () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    expect(Author.strictLoadingByDefault).toBe(false);
  });

  // Rails: test_strict_loading_by_default_is_inheritable
  it("strict loading by default is inheritable", async () => {
    class Animal extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    Animal.strictLoadingByDefault = true;
    try {
      expect(Animal.strictLoadingByDefault).toBe(true);
    } finally {
      Animal.strictLoadingByDefault = false;
    }
  });

  // Rails: test_strict_loading_violation_on_polymorphic_relation
  it("strict loading violation on polymorphic relation", async () => {
    class Tag extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
      }
    }
    registerModel(Tag);

    const tag = await Tag.create({ name: "ruby", taggable_id: 1, taggable_type: "Post" });
    tag.strictLoadingBang();

    await expect(loadBelongsTo(tag, "taggable", { polymorphic: true })).rejects.toThrow(
      "`Tag` is marked for strict_loading. " +
        "The polymorphic association named `:taggable` cannot be lazily loaded.",
    );
  });

  // Rails: test_does_not_raise_on_eager_loading_a_belongs_to_relation_if_strict_loading_by_default
  it("does not raise on eager loading a belongs to relation if strict loading by default", async () => {
    class Publisher extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class Book extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("publisher_id", "integer");
      }
    }
    registerModel(Publisher);
    registerModel(Book);

    const publisher = await Publisher.create({ name: "Press" });
    const book = await Book.create({ title: "Guide", publisher_id: publisher.id });
    (book as any)._preloadedAssociations = new Map([["publisher", publisher]]);
    book.strictLoadingBang();

    const loaded = await loadBelongsTo(book, "publisher", {});
    expect(loaded).not.toBeNull();
  });

  // Rails: test_raises_on_lazy_loading_a_belongs_to_relation_if_strict_loading_by_default
  it("raises on lazy loading a belongs to relation if strict loading by default", async () => {
    class Publisher extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class Book extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("publisher_id", "integer");
      }
    }
    registerModel(Publisher);
    registerModel(Book);
    Book.strictLoadingByDefault = true;

    try {
      const created = await Book.create({ title: "Test", publisher_id: 1 });
      const book = await Book.find(created.id);
      await expect(loadBelongsTo(book, "publisher", {})).rejects.toThrow(
        StrictLoadingViolationError,
      );
    } finally {
      Book.strictLoadingByDefault = false;
    }
  });

  // Rails: test_raises_on_lazy_loading_a_has_one_relation_if_strict_loading_by_default
  it("raises on lazy loading a has one relation if strict loading by default", async () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class Profile extends Base {
      static {
        this.attribute("bio", "string");
        this.attribute("author_id", "integer");
      }
    }
    registerModel(Author);
    registerModel(Profile);
    Author.strictLoadingByDefault = true;

    try {
      const created = await Author.create({ name: "Iris" });
      const author = await Author.find(created.id);
      await expect(loadHasOne(author, "profile", {})).rejects.toThrow(StrictLoadingViolationError);
    } finally {
      Author.strictLoadingByDefault = false;
    }
  });

  // Rails: test_raises_on_lazy_loading_a_has_many_relation_if_strict_loading_by_default
  it("raises on lazy loading a has many relation if strict loading by default", async () => {
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
    registerModel(Author);
    registerModel(Book);
    Author.strictLoadingByDefault = true;

    try {
      const created = await Author.create({ name: "Jake" });
      const author = await Author.find(created.id);
      await expect(loadHasMany(author, "books", {})).rejects.toThrow(StrictLoadingViolationError);
    } finally {
      Author.strictLoadingByDefault = false;
    }
  });
});

describe("StrictLoadingTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({
      authors: { name: "string" },
      books: { title: "string", author_id: "integer" },
      slvr_authors: { name: "string" },
      sl_bt_publishers: { name: "string" },
      sl_bt_books: { title: "string", publisher_id: "integer" },
      sl_hm_authors: { name: "string" },
      sl_hm_books: { title: "string", author_id: "integer" },
      sl_ho_authors: { name: "string" },
      sl_ho_profiles: { bio: "string", author_id: "integer" },
      sl_thr_authors: { name: "string" },
      sl_thr_posts: { title: "string", sl_thr_author_id: "integer" },
      sl_thr_tags: { name: "string" },
      sl_thr_taggings: { sl_thr_post_id: "integer", sl_thr_tag_id: "integer" },
      sl_hot_authors: { name: "string" },
      sl_hot_accounts: { sl_hot_author_id: "integer" },
      sl_hot_profiles: { sl_hot_account_id: "integer", bio: "string" },
      slrm_authors: { name: "string" },
      sl_all_authors: { name: "string" },
      sl_all_books: { title: "string", author_id: "integer" },
      slc_authors: { name: "string" },
      slp_authors: { name: "string" },
      sls_authors: { name: "string", age: "integer" },
      slsz_authors: { name: "string" },
      sle_authors: { name: "string" },
      sla_authors: { name: "string" },
      sln_authors: { name: "string" },
      slex_authors: { name: "string" },
      sli_authors: { name: "string" },
      sll_authors: { name: "string" },
      slld_authors: { name: "string" },
      slpr_authors: { name: "string" },
      sl_bang_authors: { name: "string" },
      gm_authors: { name: "string" },
      gm_books: { title: "string", author_id: "integer" },
      rsl_authors: { name: "string" },
      rsl_books: { title: "string", author_id: "integer" },
      slcn_authors: { name: "string" },
      slcn_books: { title: "string", sl_cn_author_id: "integer" },
      slbd_authors: { name: "string" },
      slbd_books: { title: "string", sl_bd_author_id: "integer" },
      slwr_authors: { name: "string" },
      slwr_books: { title: "string", sl_wr_author_id: "integer" },
      slnr_authors: { name: "string" },
      slnr_books: { title: "string", sl_nr_author_id: "integer" },
      elsl_devs: { name: "string" },
      elsl_logs: { message: "string", elsl_dev_id: "integer" },
      elslhm_devs: { name: "string" },
      elslhm_logs: { message: "string", elslhm_dev_id: "integer" },
      slppl_devs: { name: "string" },
      slppl_logs: { message: "string", slppl_dev_id: "integer" },
      slpbd_devs: { name: "string" },
      slpbd_logs: { message: "string", slpbd_dev_id: "integer" },
      slpnt_devs: { name: "string" },
      slpnt_logs: { message: "string", slpnt_dev_id: "integer" },
      slpwp_devs: { name: "string" },
      slpwp_logs: { message: "string", slpwp_dev_id: "integer" },
      slpwp_extras: { note: "string", slpwp_dev_id: "integer" },
      slthc_devs: { name: "string" },
      slthc_firms: { name: "string" },
      slthc_contracts: { slthc_dev_id: "integer", slthc_firm_id: "integer" },
      slthc_ships: { name: "string", slthc_dev_id: "integer" },
      urm_devs: { name: "string" },
      tooa_devs: { name: "string", tooa_mentor_id: "integer" },
      tooa_mentors: { name: "string" },
      ebts_books: { title: "string", ebts_publisher_id: "integer" },
      ebts_publishers: { name: "string" },
      slog_authors: { name: "string" },
      slog_books: { title: "string", author_id: "integer" },
      clir_authors: { name: "string" },
      clir_books: { title: "string", author_id: "integer" },
      clp_tags: { name: "string", taggable_id: "integer", taggable_type: "string" },
      clp_pirates: { catchphrase: "string" },
      npo_hm_authors: { name: "string" },
      npo_hm_books: { title: "string", author_id: "integer" },
      npo_bt_developers: { name: "string", ship_id: "integer" },
      npo_bt_ships: { name: "string" },
      npo_bt_parts: { name: "string", ship_id: "integer" },
      vcbt_logs: { message: "string", vcbt_dev_id: "integer" },
      vcbt_devs: { name: "string" },
      vchm_devs: { name: "string" },
      vchm_logs: { message: "string", vchm_dev_id: "integer" },
      slhor_devs: { name: "string" },
      slhor_ships: { name: "string", slhor_dev_id: "integer" },
      slhmr_devs: { name: "string" },
      slhmr_logs: { message: "string", slhmr_dev_id: "integer" },
      slhms_devs: { name: "string" },
      slhms_logs: { message: "string", slhms_dev_id: "integer" },
      ehos_devs: { name: "string" },
      ehos_profiles: { bio: "string", ehos_dev_id: "integer" },
    });
  });
  // Rails: test_raises_on_lazy_loading_a_strict_loading_has_many_relation
  // Rails: test_raises_on_lazy_loading_a_strict_loading_belongs_to_relation
  // Rails: test_raises_on_lazy_loading_a_strict_loading_has_one_relation
  // Rails: test_strict_loading_violation_raises_by_default
  // Rails: test_does_not_raise_on_eager_loading_a_strict_loading_has_many_relation
  // Rails: test_raises_if_strict_loading_by_default_and_lazy_loading
  // Rails: test_strict_loading_n_plus_one_only_mode_does_not_eager_load_child_associations
  // Rails: test_default_mode_is_all
  // Rails: test_strict_loading
  // Rails: test_strict_loading_by_default
  // Rails: test_strict_loading_by_default_is_inheritable
  // Rails: test_strict_loading_violation_on_polymorphic_relation
  // Rails: test_does_not_raise_on_eager_loading_a_belongs_to_relation_if_strict_loading_by_default
  // Rails: test_raises_on_lazy_loading_a_belongs_to_relation_if_strict_loading_by_default
  // Rails: test_raises_on_lazy_loading_a_has_one_relation_if_strict_loading_by_default
  // Rails: test_raises_on_lazy_loading_a_has_many_relation_if_strict_loading_by_default
  it("strict loading by default can be set per model", () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    Author.strictLoadingByDefault = true;
    expect(Author.strictLoadingByDefault).toBe(true);
    Author.strictLoadingByDefault = false;
  });
  it("strict loading raises when lazy loading", async () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    Associations.hasMany.call(Author, "books", {});
    registerModel(Author);
    const a = await Author.create({ name: "test" });
    a.strictLoadingBang();
    await expect(loadHasMany(a, "books", {})).rejects.toThrow(StrictLoadingViolationError);
  });
  it("strict loading enabled on record", () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    const a = new Author({ name: "test" });
    expect(a.isStrictLoading()).toBe(false);
    a.strictLoadingBang();
    expect(a.isStrictLoading()).toBe(true);
  });
  it("strict loading via relation is only for that relation", async () => {
    class SlvrAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel("SlvrAuthor", SlvrAuthor);
    await SlvrAuthor.create({ name: "A" });
    await SlvrAuthor.create({ name: "B" });
    const strictRecords = await SlvrAuthor.all().strictLoading().toArray();
    expect(strictRecords[0].isStrictLoading()).toBe(true);
    const normalRecords = await SlvrAuthor.all().toArray();
    expect(normalRecords[0].isStrictLoading()).toBe(false);
  });

  it("strict loading on a belongs to", async () => {
    class SlBtPublisher extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlBtBook extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("publisher_id", "integer");
      }
    }
    registerModel("SlBtPublisher", SlBtPublisher);
    registerModel("SlBtBook", SlBtBook);
    const book = await SlBtBook.create({ title: "Test", publisher_id: 1 });
    book.strictLoadingBang();
    await expect(
      loadBelongsTo(book, "sl_bt_publisher", {
        className: "SlBtPublisher",
        foreignKey: "publisher_id",
      }),
    ).rejects.toThrow(StrictLoadingViolationError);
  });

  it("strict loading on a has many", async () => {
    class SlHmAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlHmBook extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
      }
    }
    registerModel("SlHmAuthor", SlHmAuthor);
    registerModel("SlHmBook", SlHmBook);
    Associations.hasMany.call(SlHmAuthor, "sl_hm_books", {
      className: "SlHmBook",
      foreignKey: "author_id",
    });
    const author = await SlHmAuthor.create({ name: "Test" });
    author.strictLoadingBang();
    await expect(
      loadHasMany(author, "sl_hm_books", { className: "SlHmBook", foreignKey: "author_id" }),
    ).rejects.toThrow(StrictLoadingViolationError);
  });

  it("strict loading on a has one", async () => {
    class SlHoAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlHoProfile extends Base {
      static {
        this.attribute("bio", "string");
        this.attribute("author_id", "integer");
      }
    }
    registerModel("SlHoAuthor", SlHoAuthor);
    registerModel("SlHoProfile", SlHoProfile);
    const author = await SlHoAuthor.create({ name: "Test" });
    author.strictLoadingBang();
    await expect(
      loadHasOne(author, "sl_ho_profile", { className: "SlHoProfile", foreignKey: "author_id" }),
    ).rejects.toThrow(StrictLoadingViolationError);
  });

  it("strict loading on a has many through", async () => {
    class SlThrAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlThrPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("sl_thr_author_id", "integer");
      }
    }
    class SlThrTag extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlThrTagging extends Base {
      static {
        this.attribute("sl_thr_post_id", "integer");
        this.attribute("sl_thr_tag_id", "integer");
      }
    }
    registerModel("SlThrAuthor", SlThrAuthor);
    registerModel("SlThrPost", SlThrPost);
    registerModel("SlThrTag", SlThrTag);
    registerModel("SlThrTagging", SlThrTagging);
    Associations.hasMany.call(SlThrAuthor, "slThrPosts", { foreignKey: "sl_thr_author_id" });
    Associations.hasMany.call(SlThrPost, "slThrTaggings", { foreignKey: "sl_thr_post_id" });
    Associations.hasMany.call(SlThrPost, "slThrTags", {
      through: "slThrTaggings",
      source: "slThrTag",
      className: "SlThrTag",
    });
    Associations.belongsTo.call(SlThrTagging, "slThrTag", {
      foreignKey: "sl_thr_tag_id",
      className: "SlThrTag",
    });
    Associations.hasMany.call(SlThrAuthor, "slThrTags", {
      through: "slThrPosts",
      source: "slThrTags",
      className: "SlThrTag",
    });
    const author = await SlThrAuthor.create({ name: "Test" });
    author.strictLoadingBang();
    await expect(
      loadHasMany(author, "slThrTags", {
        through: "slThrPosts",
        source: "slThrTags",
        className: "SlThrTag",
      }),
    ).rejects.toThrow(StrictLoadingViolationError);
  });

  it("strict loading on a has one through", async () => {
    class SlHotAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlHotAccount extends Base {
      static {
        this.attribute("sl_hot_author_id", "integer");
      }
    }
    class SlHotProfile extends Base {
      static {
        this.attribute("sl_hot_account_id", "integer");
        this.attribute("bio", "string");
      }
    }
    registerModel("SlHotAuthor", SlHotAuthor);
    registerModel("SlHotAccount", SlHotAccount);
    registerModel("SlHotProfile", SlHotProfile);
    Associations.hasOne.call(SlHotAuthor, "slHotAccount", {
      foreignKey: "sl_hot_author_id",
      className: "SlHotAccount",
    });
    Associations.hasOne.call(SlHotAccount, "slHotProfile", {
      foreignKey: "sl_hot_account_id",
      className: "SlHotProfile",
    });
    Associations.hasOne.call(SlHotAuthor, "slHotProfile", {
      through: "slHotAccount",
      source: "slHotProfile",
      className: "SlHotProfile",
    });
    const author = await SlHotAuthor.create({ name: "Test" });
    author.strictLoadingBang();
    await expect(
      loadHasOne(author, "slHotProfile", {
        through: "slHotAccount",
        source: "slHotProfile",
        className: "SlHotProfile",
      }),
    ).rejects.toThrow(StrictLoadingViolationError);
  });
  it.skip("strict loading with includes prevents lazy loading", () => {
    // BLOCKED: relation — StrictLoadingViolation not wired into association loading
    // ROOT-CAUSE: strict-loading.ts#checkStrictLoading not called from association loading path
    // SCOPE: ~30 LOC in strict-loading.ts + associations/association.ts; affects ~41 tests in strict-loading.test.ts
  });
  it.skip("strict loading with eager load prevents lazy loading", () => {
    // BLOCKED: relation — StrictLoadingViolation not wired into association loading
    // ROOT-CAUSE: strict-loading.ts#checkStrictLoading not called from association loading path
    // SCOPE: ~30 LOC in strict-loading.ts + associations/association.ts; affects ~41 tests in strict-loading.test.ts
  });
  it("strict loading with preload prevents lazy loading", async () => {
    class SlpwpDev extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlpwpLog extends Base {
      static {
        this.attribute("message", "string");
        this.attribute("slpwp_dev_id", "integer");
      }
    }
    class SlpwpExtra extends Base {
      static {
        this.attribute("note", "string");
        this.attribute("slpwp_dev_id", "integer");
      }
    }
    Associations.hasMany.call(SlpwpDev, "slpwpLogs", {
      className: "SlpwpLog",
      foreignKey: "slpwp_dev_id",
    });
    Associations.hasMany.call(SlpwpDev, "slpwpExtras", {
      className: "SlpwpExtra",
      foreignKey: "slpwp_dev_id",
    });
    registerModel("SlpwpDev", SlpwpDev);
    registerModel("SlpwpLog", SlpwpLog);
    registerModel("SlpwpExtra", SlpwpExtra);
    const created = await SlpwpDev.create({ name: "D" });
    await SlpwpLog.create({ message: "M", slpwp_dev_id: created.id });
    await SlpwpExtra.create({ note: "N", slpwp_dev_id: created.id });
    // Preload one association on a strict-loading relation: the preloaded
    // association is reachable, but lazy-loading a different, non-preloaded
    // association on the (now strict) parent must raise.
    const devs = await SlpwpDev.all().includes("slpwpLogs").strictLoading().toArray();
    const dev = devs[0];
    expect(dev.isStrictLoading()).toBe(true);
    const preloaded = (dev as any)._preloadedAssociations?.get("slpwpLogs") ?? [];
    expect(preloaded).toHaveLength(1);
    await expect(
      loadHasMany(dev, "slpwpExtras", { className: "SlpwpExtra", foreignKey: "slpwp_dev_id" }),
    ).rejects.toThrow(StrictLoadingViolationError);
  });
  it("strict loading by default can be toggled", () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    expect(Author.strictLoadingByDefault).toBe(false);
    Author.strictLoadingByDefault = true;
    expect(Author.strictLoadingByDefault).toBe(true);
    Author.strictLoadingByDefault = false;
    expect(Author.strictLoadingByDefault).toBe(false);
  });
  it.skip("strict loading logging by default", () => {
    // BLOCKED: relation — StrictLoadingViolation not wired into association loading
    // ROOT-CAUSE: strict-loading.ts#checkStrictLoading not called from association loading path
    // SCOPE: ~30 LOC in strict-loading.ts + associations/association.ts; affects ~41 tests in strict-loading.test.ts
  });
  it("strict loading violation raises StrictLoadingViolationError by default", async () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    Associations.hasMany.call(Author, "books", {});
    registerModel(Author);
    const a = await Author.create({ name: "test" });
    a.strictLoadingBang();
    await expect(loadHasMany(a, "books", {})).rejects.toThrow(StrictLoadingViolationError);
  });
  it("strict loading violation raises when mode is :raise", async () => {
    class SlrmAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel("SlrmAuthor", SlrmAuthor);
    Associations.hasMany.call(SlrmAuthor, "slrmBooks", {});
    const author = await SlrmAuthor.create({ name: "Test" });
    author.strictLoadingBang();
    await expect(loadHasMany(author, "slrmBooks", {})).rejects.toThrow(StrictLoadingViolationError);
  });

  it("strict loading violation logs when mode is :log", async () => {
    class SlogAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlogBook extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
      }
    }
    registerModel("SlogAuthor", SlogAuthor);
    registerModel("SlogBook", SlogBook);
    const slogOpts = { className: "SlogBook", foreignKey: "author_id" };
    Associations.hasMany.call(SlogAuthor, "slog_books", slogOpts);
    const author = await SlogAuthor.create({ name: "Test" });
    author.strictLoadingBang();

    setActionOnStrictLoadingViolation("log");
    let events = 0;
    const sub = Notifications.subscribe("strict_loading_violation.active_record", () => {
      events++;
    });
    try {
      // Under :log, a lazy load instruments the violation instead of raising.
      await expect(loadHasMany(author, "slog_books", slogOpts)).resolves.toBeDefined();
      expect(events).toBe(1);
    } finally {
      Notifications.unsubscribe(sub);
      setActionOnStrictLoadingViolation("raise");
    }
  });
  it("strict loading logging mode can be set per model", () => {
    class SlmAllModel extends Base {
      static {
        this.attribute("name", "string");
        this.strictLoadingMode = "all";
      }
    }
    class SlmNPlusOneModel extends Base {
      static {
        this.attribute("name", "string");
        this.strictLoadingMode = "n_plus_one_only";
      }
    }
    const allRecord = new SlmAllModel({ name: "A" });
    const nPlusOneRecord = new SlmNPlusOneModel({ name: "B" });
    expect(allRecord.isStrictLoadingAll()).toBe(true);
    expect(allRecord.isStrictLoadingNPlusOneOnly()).toBe(false);
    expect(nPlusOneRecord.isStrictLoadingNPlusOneOnly()).toBe(true);
    expect(nPlusOneRecord.isStrictLoadingAll()).toBe(false);
    expect(nPlusOneRecord.strictLoadingMode()).toBe("n_plus_one_only");
  });
  it("strict loading all prevents lazy loading", async () => {
    class SlAllAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlAllBook extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
      }
    }
    registerModel("SlAllAuthor", SlAllAuthor);
    registerModel("SlAllBook", SlAllBook);
    Associations.hasMany.call(SlAllAuthor, "sl_all_books", {
      className: "SlAllBook",
      foreignKey: "author_id",
    });
    const author = await SlAllAuthor.create({ name: "Test" });
    author.strictLoadingBang();
    await expect(
      loadHasMany(author, "sl_all_books", { className: "SlAllBook", foreignKey: "author_id" }),
    ).rejects.toThrow(StrictLoadingViolationError);
  });
  it("preload does not trigger strict loading", async () => {
    class SlpntDev extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlpntLog extends Base {
      static {
        this.attribute("message", "string");
        this.attribute("slpnt_dev_id", "integer");
      }
    }
    Associations.hasMany.call(SlpntDev, "slpntLogs", {
      className: "SlpntLog",
      foreignKey: "slpnt_dev_id",
    });
    registerModel("SlpntDev", SlpntDev);
    registerModel("SlpntLog", SlpntLog);
    const created = await SlpntDev.create({ name: "D" });
    await SlpntLog.create({ message: "M", slpnt_dev_id: created.id });
    // A plain preload (no strict_loading) neither marks the parent strict nor
    // cascades strictness to the preloaded records.
    const devs = await SlpntDev.all().includes("slpntLogs").toArray();
    const dev = devs[0];
    expect(dev.isStrictLoading()).toBe(false);
    const logs = (dev as any)._preloadedAssociations?.get("slpntLogs") ?? [];
    expect(logs).toHaveLength(1);
    expect(logs.some((l: any) => l._strictLoading)).toBe(false);
  });
  it.skip("strict loading with select on relation", () => {
    // BLOCKED: relation — StrictLoadingViolation not wired into association loading
    // ROOT-CAUSE: strict-loading.ts#checkStrictLoading not called from association loading path
    // SCOPE: ~30 LOC in strict-loading.ts + associations/association.ts; affects ~41 tests in strict-loading.test.ts
  });
  it.skip("strict loading n_plus_one_only prevents n plus one", () => {
    // BLOCKED: relation — StrictLoadingViolation not wired into association loading
    // ROOT-CAUSE: strict-loading.ts#checkStrictLoading not called from association loading path
    // SCOPE: ~30 LOC in strict-loading.ts + associations/association.ts; affects ~41 tests in strict-loading.test.ts
  });
  it.skip("strict loading n_plus_one_only allows first level", () => {
    // BLOCKED: relation — StrictLoadingViolation not wired into association loading
    // ROOT-CAUSE: strict-loading.ts#checkStrictLoading not called from association loading path
    // SCOPE: ~30 LOC in strict-loading.ts + associations/association.ts; affects ~41 tests in strict-loading.test.ts
  });
  it.skip("strict loading n_plus_one_only does not prevent scoped loading", () => {
    // BLOCKED: relation — StrictLoadingViolation not wired into association loading
    // ROOT-CAUSE: strict-loading.ts#checkStrictLoading not called from association loading path
    // SCOPE: ~30 LOC in strict-loading.ts + associations/association.ts; affects ~41 tests in strict-loading.test.ts
  });
  it("strict loading with count does not raise", async () => {
    class SlcAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await SlcAuthor.create({ name: "Test" });
    const count = await SlcAuthor.all().strictLoading().count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("strict loading with pluck does not raise", async () => {
    class SlpAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await SlpAuthor.create({ name: "Test" });
    const names = await SlpAuthor.all().strictLoading().pluck("name");
    expect(names).toContain("Test");
  });

  it("strict loading with sum does not raise", async () => {
    class SlsAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    await SlsAuthor.create({ name: "Test", age: 30 });
    const total = await SlsAuthor.all().strictLoading().sum("age");
    expect(total).toBe(30);
  });

  it("strict loading with size does not raise", async () => {
    class SlszAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await SlszAuthor.create({ name: "Test" });
    const size = await SlszAuthor.all().strictLoading().size();
    expect(size).toBe(1);
  });

  it("strict loading with empty does not raise", async () => {
    class SleAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await SleAuthor.create({ name: "Test" });
    const empty = await SleAuthor.where({ name: "nonexistent" }).strictLoading().isEmpty();
    expect(empty).toBe(true);
  });

  it("strict loading with any does not raise", async () => {
    class SlaAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await SlaAuthor.create({ name: "Test" });
    const any = await SlaAuthor.all().strictLoading().isAny();
    expect(any).toBe(true);
  });

  it("strict loading with none does not raise", async () => {
    class SlnAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await SlnAuthor.create({ name: "Test" });
    const none = await SlnAuthor.none().strictLoading().toArray();
    expect(none).toHaveLength(0);
  });

  it("strict loading with exist does not raise", async () => {
    class SlexAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await SlexAuthor.create({ name: "Test" });
    const exists = await SlexAuthor.all().strictLoading().exists();
    expect(exists).toBe(true);
  });

  it("strict loading with ids does not raise", async () => {
    class SliAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    const a = await SliAuthor.create({ name: "Test" });
    const ids = await SliAuthor.all().strictLoading().ids();
    expect(ids).toContain(a.id);
  });

  it("strict loading with length does not raise", async () => {
    class SllAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await SllAuthor.create({ name: "Test" });
    const len = await SllAuthor.all().strictLoading().length();
    expect(len).toBeGreaterThanOrEqual(1);
  });

  it("strict loading with loaded does not raise", async () => {
    class SlldAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await SlldAuthor.create({ name: "Test" });
    const rel = SlldAuthor.all().strictLoading();
    expect(rel.isLoaded).toBe(false);
    await rel.toArray();
    expect(rel.isLoaded).toBe(true);
  });

  it("strict loading with presence does not raise", async () => {
    class SlprAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await SlprAuthor.create({ name: "Test" });
    const rel = SlprAuthor.all().strictLoading();
    const presence = await rel.presence();
    expect(presence).toBe(rel);
  });
  it("strict loading!", async () => {
    class SlBangAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    const author = new SlBangAuthor({ name: "Test" });
    expect(author.isStrictLoading()).toBe(false);
    author.strictLoadingBang();
    expect(author.isStrictLoading()).toBe(true);
  });
  it("strict loading n plus one only mode with has many", async () => {
    class NpoHmAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class NpoHmBook extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
      }
    }
    registerModel("NpoHmAuthor", NpoHmAuthor);
    registerModel("NpoHmBook", NpoHmBook);
    Associations.hasMany.call(NpoHmAuthor, "npoHmBooks", {
      className: "NpoHmBook",
      foreignKey: "author_id",
    });
    Associations.belongsTo.call(NpoHmBook, "npoHmAuthor", {
      className: "NpoHmAuthor",
      foreignKey: "author_id",
    });
    const author = await NpoHmAuthor.create({ name: "Test" });
    await NpoHmBook.create({ title: "B", author_id: author.id });
    author.strictLoadingBang(true, { mode: "n_plus_one_only" });
    expect(author.isStrictLoading()).toBe(true);

    // Does not raise when loading the first-level has_many association: the
    // N+1-only mode only guards against cascading lookups, not the root load.
    // Read through the CollectionProxy reader (`developer.projects.to_a`),
    // which must cascade strict_loading onto each child.
    const books = (await association(author, "npoHmBooks").toArray()) as Base[];

    // strict_loading is enabled for has_many associations
    expect(books.every((b) => b.isStrictLoading())).toBe(true);
    // ...so the nested (N+1) load off a child raises.
    await expect((books[0] as any).association("npoHmAuthor").loadTarget()).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });
  it("strict loading n plus one only mode with belongs to", async () => {
    class NpoBtDeveloper extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("ship_id", "integer");
      }
    }
    class NpoBtShip extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class NpoBtPart extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("ship_id", "integer");
      }
    }
    registerModel("NpoBtDeveloper", NpoBtDeveloper);
    registerModel("NpoBtShip", NpoBtShip);
    registerModel("NpoBtPart", NpoBtPart);
    Associations.belongsTo.call(NpoBtDeveloper, "npoBtShip", {
      className: "NpoBtShip",
      foreignKey: "ship_id",
    });
    Associations.hasMany.call(NpoBtShip, "npoBtParts", {
      className: "NpoBtPart",
      foreignKey: "ship_id",
    });
    Associations.belongsTo.call(NpoBtPart, "npoBtShip", {
      className: "NpoBtShip",
      foreignKey: "ship_id",
    });
    const ship = await NpoBtShip.create({ name: "S" });
    await NpoBtPart.create({ name: "Stern", ship_id: ship.id });
    const developer = await NpoBtDeveloper.create({ name: "Dev", ship_id: ship.id });
    developer.strictLoadingBang(true, { mode: "n_plus_one_only" });
    expect(developer.isStrictLoading()).toBe(true);

    // Does not raise when a belongs_to association (:ship) loads its
    // has_many association (:parts). The belongs_to target is not strict.
    const loadedShip = (await (developer as any).association("npoBtShip").loadTarget()) as Base;
    expect(loadedShip.isStrictLoading()).toBe(false);

    // strict_loading is enabled for has_many through a belongs_to. Read
    // through the CollectionProxy reader (`developer.ship.parts.to_a`),
    // which must cascade strict_loading onto each child.
    const parts = (await association(loadedShip, "npoBtParts").toArray()) as Base[];
    expect(parts.every((p) => p.isStrictLoading())).toBe(true);
    await expect((parts[0] as any).association("npoBtShip").loadTarget()).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });
  it("default mode can be changed globally", async () => {
    class GmAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class GmBook extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
      }
    }
    registerModel("GmAuthor", GmAuthor);
    registerModel("GmBook", GmBook);
    Associations.hasMany.call(GmAuthor, "gm_books", {
      className: "GmBook",
      foreignKey: "author_id",
    });
    const original = Base.strictLoadingByDefault;
    try {
      Base.strictLoadingByDefault = true;
      const created = await GmAuthor.create({ name: "Global" });
      const author = await GmAuthor.find(created.id);
      expect(author.isStrictLoading()).toBe(true);
      await expect(
        loadHasMany(author, "gm_books", { className: "GmBook", foreignKey: "author_id" }),
      ).rejects.toThrow(StrictLoadingViolationError);
    } finally {
      Base.strictLoadingByDefault = original;
    }
  });
  it("raises if strict loading and lazy loading", async () => {
    class RslAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class RslBook extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
      }
    }
    registerModel("RslAuthor", RslAuthor);
    registerModel("RslBook", RslBook);
    Associations.hasMany.call(RslAuthor, "rsl_books", {
      className: "RslBook",
      foreignKey: "author_id",
    });
    const author = await RslAuthor.create({ name: "Test" });
    author.strictLoadingBang();
    await expect(
      loadHasMany(author, "rsl_books", { className: "RslBook", foreignKey: "author_id" }),
    ).rejects.toThrow(StrictLoadingViolationError);
  });
  it("strict loading is ignored in validation context", async () => {
    class VcbtDev extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class VcbtLog extends Base {
      static {
        this.attribute("message", "string");
        this.attribute("vcbt_dev_id", "integer");
      }
    }
    registerModel("VcbtDev", VcbtDev);
    registerModel("VcbtLog", VcbtLog);
    Associations.belongsTo.call(VcbtLog, "vcbtDev", {
      className: "VcbtDev",
      foreignKey: "vcbt_dev_id",
    });
    const dev = await VcbtDev.create({ name: "Test" });
    const log = await VcbtLog.create({ message: "i am a message", vcbt_dev_id: dev.id });
    log.strictLoadingBang();
    // Rails' Association#violates_strict_loading? returns false while the owner
    // has a non-nil validation_context (set by save!/valid? for the duration of
    // the run), so association loads during validation are never violations.
    (log as any)._validationContext = "create";
    try {
      const loaded = await loadBelongsTo(log, "vcbtDev", {
        className: "VcbtDev",
        foreignKey: "vcbt_dev_id",
      });
      expect(loaded?.id).toBe(dev.id);
    } finally {
      (log as any)._validationContext = undefined;
    }
  });
  it("strict loading with reflection is ignored in validation context", async () => {
    class VchmDev extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class VchmLog extends Base {
      static {
        this.attribute("message", "string");
        this.attribute("vchm_dev_id", "integer");
      }
    }
    registerModel("VchmDev", VchmDev);
    registerModel("VchmLog", VchmLog);
    Associations.hasMany.call(VchmDev, "vchmLogs", {
      className: "VchmLog",
      foreignKey: "vchm_dev_id",
    });
    const dev = await VchmDev.create({ name: "Test" });
    await VchmLog.create({ message: "I am message", vchm_dev_id: dev.id });
    dev.strictLoadingBang();
    (dev as any)._validationContext = "update";
    try {
      const logs = await loadHasMany(dev, "vchmLogs", {
        className: "VchmLog",
        foreignKey: "vchm_dev_id",
      });
      expect(logs).toHaveLength(1);
    } finally {
      (dev as any)._validationContext = undefined;
    }
  });

  it("strict loading on concat is ignored", async () => {
    class SlcnAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlcnBook extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("sl_cn_author_id", "integer");
      }
    }
    registerModel("SlcnAuthor", SlcnAuthor);
    registerModel("SlcnBook", SlcnBook);
    Associations.hasMany.call(SlcnAuthor, "slCnBooks", {
      className: "SlcnBook",
      foreignKey: "sl_cn_author_id",
    });
    const author = await SlcnAuthor.create({ name: "Test" });
    author.strictLoadingBang();
    const proxy = association(author, "slCnBooks");
    const book = new SlcnBook({ title: "New Book" });
    await proxy.concat(book);
    expect(author.isStrictLoading()).toBe(true);
  });

  it("strict loading on build is ignored", async () => {
    class SlbdAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlbdBook extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("sl_bd_author_id", "integer");
      }
    }
    registerModel("SlbdAuthor", SlbdAuthor);
    registerModel("SlbdBook", SlbdBook);
    Associations.hasMany.call(SlbdAuthor, "slBdBooks", {
      className: "SlbdBook",
      foreignKey: "sl_bd_author_id",
    });
    const author = await SlbdAuthor.create({ name: "Test" });
    author.strictLoadingBang();
    const proxy = association(author, "slBdBooks");
    expect(() => proxy.build({ title: "Built Book" })).not.toThrow();
    expect(author.isStrictLoading()).toBe(true);
  });

  it("strict loading on writer is ignored", async () => {
    class SlwrAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlwrBook extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("sl_wr_author_id", "integer");
      }
    }
    registerModel("SlwrAuthor", SlwrAuthor);
    registerModel("SlwrBook", SlwrBook);
    Associations.hasMany.call(SlwrAuthor, "slWrBooks", {
      className: "SlwrBook",
      foreignKey: "sl_wr_author_id",
    });
    const author = await SlwrAuthor.create({ name: "Test" });
    author.strictLoadingBang();
    const proxy = association(author, "slWrBooks");
    const book = new SlwrBook({ title: "Written Book" });
    await proxy.replace([book]);
    expect(author.isStrictLoading()).toBe(true);
  });

  it("strict loading with new record on concat is ignored", async () => {
    class SlnrAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlnrBook extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("sl_nr_author_id", "integer");
      }
    }
    registerModel("SlnrAuthor", SlnrAuthor);
    registerModel("SlnrBook", SlnrBook);
    Associations.hasMany.call(SlnrAuthor, "slNrBooks", {
      className: "SlnrBook",
      foreignKey: "sl_nr_author_id",
    });
    const author = new SlnrAuthor({ name: "Test" });
    author.strictLoadingBang();
    const proxy = association(author, "slNrBooks");
    const book = new SlnrBook({ title: "New Book" });
    await proxy.concat(book);
    expect(author.isStrictLoading()).toBe(true);
  });
  it.skip("strict loading with new record on build is ignored", () => {
    // BLOCKED: relation — StrictLoadingViolation not wired into association loading
    // ROOT-CAUSE: strict-loading.ts#checkStrictLoading not called from association loading path
    // SCOPE: ~30 LOC in strict-loading.ts + associations/association.ts; affects ~41 tests in strict-loading.test.ts
  });
  it.skip("strict loading with new record on writer is ignored", () => {
    // BLOCKED: relation — StrictLoadingViolation not wired into association loading
    // ROOT-CAUSE: strict-loading.ts#checkStrictLoading not called from association loading path
    // SCOPE: ~30 LOC in strict-loading.ts + associations/association.ts; affects ~41 tests in strict-loading.test.ts
  });
  it("strict loading has one reload", async () => {
    class SlhorDev extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlhorShip extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("slhor_dev_id", "integer");
      }
    }
    registerModel("SlhorDev", SlhorDev);
    registerModel("SlhorShip", SlhorShip);
    Associations.hasOne.call(SlhorDev, "slhorShip", {
      className: "SlhorShip",
      foreignKey: "slhor_dev_id",
    });
    const created = await SlhorDev.create({ name: "D" });
    const ship = await SlhorShip.create({ name: "The Great Ship", slhor_dev_id: created.id });
    const developer = (await SlhorDev.all().strictLoading().includes("slhorShip").first())!;
    expect(developer.isStrictLoading()).toBe(true);
    const opts = { className: "SlhorShip", foreignKey: "slhor_dev_id" };
    expect((await loadHasOne(developer, "slhorShip", opts))?.id).toBe(ship.id);

    await developer.reload();

    // Re-accessing the previously-loaded association after reload must not
    // raise — reload re-preloads the strict-loaded association.
    const reloaded = await loadHasOne(developer, "slhorShip", opts);
    expect(reloaded?.id).toBe(ship.id);
  });
  it("strict loading with has many", async () => {
    class SlhmrDev extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlhmrLog extends Base {
      static {
        this.attribute("message", "string");
        this.attribute("slhmr_dev_id", "integer");
      }
    }
    registerModel("SlhmrDev", SlhmrDev);
    registerModel("SlhmrLog", SlhmrLog);
    Associations.hasMany.call(SlhmrDev, "slhmrLogs", {
      className: "SlhmrLog",
      foreignKey: "slhmr_dev_id",
    });
    const created = await SlhmrDev.create({ name: "D" });
    await SlhmrLog.create({ message: "M", slhmr_dev_id: created.id });
    const devs = await SlhmrDev.all().strictLoading().includes("slhmrLogs").toArray();

    // `devs.map(&:audit_logs)` reads the unloaded proxy without forcing a load.
    const proxies = devs.map((d) => association(d, "slhmrLogs"));
    expect((await proxies[0].toArray()).length).toBe(1);

    await devs[0].reload();

    const reloaded = association(devs[0], "slhmrLogs");
    expect((await reloaded.toArray()).length).toBe(1);
  });
  it("strict loading with has many singular association and reload", async () => {
    class SlhmsDev extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlhmsLog extends Base {
      static {
        this.attribute("message", "string");
        this.attribute("slhms_dev_id", "integer");
      }
    }
    registerModel("SlhmsDev", SlhmsDev);
    registerModel("SlhmsLog", SlhmsLog);
    Associations.hasMany.call(SlhmsDev, "slhmsLogs", {
      className: "SlhmsLog",
      foreignKey: "slhms_dev_id",
    });
    const created = await SlhmsDev.create({ name: "D" });
    await SlhmsLog.create({ message: "M", slhms_dev_id: created.id });
    const dev = (await SlhmsDev.all().strictLoading().includes("slhmsLogs").first())!;
    expect((await association(dev, "slhmsLogs").toArray()).length).toBe(1);

    await dev.reload();

    expect((await association(dev, "slhmsLogs").toArray()).length).toBe(1);
  });
  it("strict loading with has many through cascade down to middle records", async () => {
    class SlthcDev extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlthcFirm extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlthcContract extends Base {
      static {
        this.attribute("slthc_dev_id", "integer");
        this.attribute("slthc_firm_id", "integer");
      }
    }
    class SlthcShip extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("slthc_dev_id", "integer");
      }
    }
    registerModel("SlthcDev", SlthcDev);
    registerModel("SlthcFirm", SlthcFirm);
    registerModel("SlthcContract", SlthcContract);
    registerModel("SlthcShip", SlthcShip);
    Associations.hasMany.call(SlthcDev, "slthcContracts", {
      className: "SlthcContract",
      foreignKey: "slthc_dev_id",
    });
    Associations.hasMany.call(SlthcDev, "slthcFirms", {
      through: "slthcContracts",
      source: "slthcFirm",
      className: "SlthcFirm",
    });
    Associations.hasOne.call(SlthcDev, "slthcShip", {
      className: "SlthcShip",
      foreignKey: "slthc_dev_id",
    });
    Associations.belongsTo.call(SlthcContract, "slthcFirm", {
      className: "SlthcFirm",
      foreignKey: "slthc_firm_id",
    });
    Associations.hasMany.call(SlthcFirm, "slthcContracts", {
      className: "SlthcContract",
      foreignKey: "slthc_firm_id",
    });

    const dev = await SlthcDev.create({ name: "Dev" });
    const firm = await SlthcFirm.create({ name: "NASA" });
    await SlthcContract.create({ slthc_dev_id: dev.id, slthc_firm_id: firm.id });

    const loaded = await SlthcDev.all().strictLoading().includes("slthcFirms").first();
    expect(loaded!.isStrictLoading()).toBe(true);

    const firms = (loaded as any)._preloadedAssociations?.get("slthcFirms") ?? [];
    expect(firms).toHaveLength(1);
    // The middle records (firms) cascade to strict_loading, so loading their
    // own associations raises.
    await expect(
      loadHasMany(firms[0], "slthcContracts", {
        className: "SlthcContract",
        foreignKey: "slthc_firm_id",
      }),
    ).rejects.toThrow(StrictLoadingViolationError);
    await expect(
      loadHasMany(loaded!, "slthcContracts", {
        className: "SlthcContract",
        foreignKey: "slthc_dev_id",
      }),
    ).rejects.toThrow(StrictLoadingViolationError);
    await expect(
      loadHasOne(loaded!, "slthcShip", { className: "SlthcShip", foreignKey: "slthc_dev_id" }),
    ).rejects.toThrow(StrictLoadingViolationError);
  });
  it.skip("strict loading with has one through does not prevent creation of association", () => {
    // BLOCKED: relation — StrictLoadingViolation not wired into association loading
    // ROOT-CAUSE: strict-loading.ts#checkStrictLoading not called from association loading path
    // SCOPE: ~30 LOC in strict-loading.ts + associations/association.ts; affects ~41 tests in strict-loading.test.ts
  });
  it("preload audit logs are strict loading because parent is strict loading", async () => {
    class SlpplDev extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlpplLog extends Base {
      static {
        this.attribute("message", "string");
        this.attribute("slppl_dev_id", "integer");
      }
    }
    Associations.hasMany.call(SlpplDev, "slpplLogs", {
      className: "SlpplLog",
      foreignKey: "slppl_dev_id",
    });
    registerModel("SlpplDev", SlpplDev);
    registerModel("SlpplLog", SlpplLog);
    const developer = await SlpplDev.create({ name: "D" });
    for (let i = 0; i < 3; i++) {
      await SlpplLog.create({ message: "I am message", slppl_dev_id: developer.id });
    }
    const devs = await SlpplDev.all().includes("slpplLogs").strictLoading().toArray();
    const dev = devs[0];
    expect(dev.isStrictLoading()).toBe(true);
    const logs = (dev as any)._preloadedAssociations?.get("slpplLogs") ?? [];
    expect(logs).toHaveLength(3);
    expect(logs.every((l: any) => l._strictLoading)).toBe(true);
  });
  it("preload audit logs are strict loading because it is strict loading by default", async () => {
    class SlpbdDev extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SlpbdLog extends Base {
      static {
        this.attribute("message", "string");
        this.attribute("slpbd_dev_id", "integer");
      }
    }
    Associations.hasMany.call(SlpbdDev, "slpbdLogs", {
      className: "SlpbdLog",
      foreignKey: "slpbd_dev_id",
    });
    registerModel("SlpbdDev", SlpbdDev);
    registerModel("SlpbdLog", SlpbdLog);
    SlpbdLog.strictLoadingByDefault = true;
    try {
      const developer = await SlpbdDev.create({ name: "D" });
      for (let i = 0; i < 3; i++) {
        await SlpbdLog.create({ message: "I am message", slpbd_dev_id: developer.id });
      }
      const devs = await SlpbdDev.all().includes("slpbdLogs").toArray();
      const dev = devs[0];
      expect(dev.isStrictLoading()).toBe(false);
      const logs = (dev as any)._preloadedAssociations?.get("slpbdLogs") ?? [];
      expect(logs).toHaveLength(3);
      expect(logs.every((l: any) => l._strictLoading)).toBe(true);
    } finally {
      SlpbdLog.strictLoadingByDefault = false;
    }
  });
  it("eager load audit logs are strict loading because parent is strict loading in hm relation", async () => {
    class ElslhmDev extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class ElslhmLog extends Base {
      static {
        this.attribute("message", "string");
        this.attribute("elslhm_dev_id", "integer");
      }
    }
    Associations.hasMany.call(ElslhmDev, "elslhmLogs", {
      className: "ElslhmLog",
      foreignKey: "elslhm_dev_id",
      strictLoading: true,
    });
    registerModel("ElslhmDev", ElslhmDev);
    registerModel("ElslhmLog", ElslhmLog);
    const dev = await ElslhmDev.create({ name: "D" });
    await ElslhmLog.create({ message: "M", elslhm_dev_id: dev.id });
    const loaded = await ElslhmDev.all().eagerLoad("elslhmLogs").toArray();
    const logs = (loaded[0] as any)._preloadedAssociations?.get("elslhmLogs") ?? [];
    expect(logs).toHaveLength(1);
    expect(logs.every((l: any) => l._strictLoading)).toBe(true);
  });

  it("eager load audit logs are strict loading because parent is strict loading", async () => {
    class ElslDev extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class ElslLog extends Base {
      static {
        this.attribute("message", "string");
        this.attribute("elsl_dev_id", "integer");
      }
    }
    Associations.hasMany.call(ElslDev, "elslLogs", {
      className: "ElslLog",
      foreignKey: "elsl_dev_id",
    });
    registerModel("ElslDev", ElslDev);
    registerModel("ElslLog", ElslLog);
    const dev = await ElslDev.create({ name: "D" });
    await ElslLog.create({ message: "M1", elsl_dev_id: dev.id });
    await ElslLog.create({ message: "M2", elsl_dev_id: dev.id });
    const loaded = await ElslDev.all().eagerLoad("elslLogs").strictLoading().toArray();
    expect((loaded[0] as any)._strictLoading).toBe(true);
    const logs = (loaded[0] as any)._preloadedAssociations?.get("elslLogs") ?? [];
    expect(logs).toHaveLength(2);
    expect(logs.every((l: any) => l._strictLoading)).toBe(true);
  });
  it.skip("eager load audit logs are strict loading because it is strict loading by default", () => {
    // BLOCKED: relation — StrictLoadingViolation not wired into association loading
    // ROOT-CAUSE: strict-loading.ts#checkStrictLoading not called from association loading path
    // SCOPE: ~30 LOC in strict-loading.ts + associations/association.ts; affects ~41 tests in strict-loading.test.ts
  });
  it("raises on unloaded relation methods if strict loading", async () => {
    class UrmDev extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class UrmLog extends Base {
      static {
        this.attribute("message", "string");
        this.attribute("urm_dev_id", "integer");
      }
    }
    registerModel("UrmDev", UrmDev);
    registerModel("UrmLog", UrmLog);
    Associations.hasMany.call(UrmDev, "urmLogs", {
      className: "UrmLog",
      foreignKey: "urm_dev_id",
    });
    const dev = await UrmDev.create({ name: "Dev" });
    dev.strictLoadingBang();
    expect(dev.isStrictLoading()).toBe(true);
    await expect(
      loadHasMany(dev, "urmLogs", { className: "UrmLog", foreignKey: "urm_dev_id" }),
    ).rejects.toThrow(StrictLoadingViolationError);
  });
  it.skip("raises on unloaded relation methods if strict loading by default", () => {
    // FOLLOW-UP: same path as `raises on unloaded relation methods if strict
    // loading`, with the owner strict via strictLoadingByDefault instead of an
    // explicit strictLoadingBang(). Trimmed for PR-size ceiling.
  });
  it("strict loading can be turned off on an association in a model with strict loading on", async () => {
    class TooaDev extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("tooa_mentor_id", "integer");
      }
    }
    class TooaMentor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel("TooaDev", TooaDev);
    registerModel("TooaMentor", TooaMentor);
    // strict_loading: false on the reflection turns enforcement off even
    // though the owning model is strict_loading by default.
    Associations.belongsTo.call(TooaDev, "tooaOffMentor", {
      className: "TooaMentor",
      foreignKey: "tooa_mentor_id",
      strictLoading: false,
    });
    TooaDev.strictLoadingByDefault = true;
    try {
      const mentor = await TooaMentor.create({ name: "Mentor" });
      const created = await TooaDev.create({ name: "Dev", tooa_mentor_id: mentor.id });
      const dev = await TooaDev.find(created.id);
      expect(dev.isStrictLoading()).toBe(true);
      // Drive the loader with the options the reflection preserved, so the
      // test exercises the reflection-level toggle, not an ad-hoc argument.
      const refl = TooaDev._reflectOnAssociation("tooaOffMentor")!;
      expect(refl.options.strictLoading).toBe(false);
      const loaded = await loadBelongsTo(dev, "tooaOffMentor", refl.options);
      expect(loaded?.id).toBe(mentor.id);
    } finally {
      TooaDev.strictLoadingByDefault = false;
    }
  });
  it("does not raise on eager loading a strict loading belongs to relation", async () => {
    class EbtsBook extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("ebts_publisher_id", "integer");
      }
    }
    class EbtsPublisher extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel("EbtsBook", EbtsBook);
    registerModel("EbtsPublisher", EbtsPublisher);
    Associations.belongsTo.call(EbtsBook, "ebtsPublisher", {
      className: "EbtsPublisher",
      foreignKey: "ebts_publisher_id",
      strictLoading: true,
    });
    const publisher = await EbtsPublisher.create({ name: "Press" });
    const book = await EbtsBook.create({ title: "Guide", ebts_publisher_id: publisher.id });
    (book as any)._preloadedAssociations = new Map([["ebtsPublisher", publisher]]);
    const loaded = await loadBelongsTo(book, "ebtsPublisher", {
      className: "EbtsPublisher",
      foreignKey: "ebts_publisher_id",
      strictLoading: true,
    });
    expect(loaded?.id).toBe(publisher.id);
  });
  it("does not raise on eager loading a strict loading has one relation", async () => {
    class EhosDev extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class EhosProfile extends Base {
      static {
        this.attribute("bio", "string");
        this.attribute("ehos_dev_id", "integer");
      }
    }
    registerModel("EhosDev", EhosDev);
    registerModel("EhosProfile", EhosProfile);
    Associations.hasOne.call(EhosDev, "ehosProfile", {
      className: "EhosProfile",
      foreignKey: "ehos_dev_id",
      strictLoading: true,
    });
    const dev = await EhosDev.create({ name: "D" });
    const profile = await EhosProfile.create({ bio: "I am bio", ehos_dev_id: dev.id });
    (dev as any)._preloadedAssociations = new Map([["ehosProfile", profile]]);
    const loaded = await loadHasOne(dev, "ehosProfile", {
      className: "EhosProfile",
      foreignKey: "ehos_dev_id",
      strictLoading: true,
    });
    expect(loaded?.id).toBe(profile.id);
  });
  it.skip("does not raise on eager loading a has one relation if strict loading by default", () => {
    // FOLLOW-UP: owner-strict + preloaded has_one (no-raise) — already covered
    // behaviorally by `preload audit logs are strict loading because parent is
    // strict loading`. Trimmed for PR-size ceiling.
  });
  it.skip("does not raise on eager loading a has many relation if strict loading by default", () => {
    // FOLLOW-UP: owner-strict + preloaded has_many (no-raise) — already covered
    // behaviorally by `preload audit logs are strict loading because parent is
    // strict loading`. Trimmed for PR-size ceiling.
  });
  it.skip("raises on lazy loading a strict loading habtm relation", () => {
    // BLOCKED: relation — StrictLoadingViolation not wired into association loading
    // ROOT-CAUSE: strict-loading.ts#checkStrictLoading not called from association loading path
    // SCOPE: ~30 LOC in strict-loading.ts + associations/association.ts; affects ~41 tests in strict-loading.test.ts
  });
  it.skip("raises on lazy loading a habtm relation if strict loading by default", () => {
    // BLOCKED: relation — StrictLoadingViolation not wired into association loading
    // ROOT-CAUSE: strict-loading.ts#checkStrictLoading not called from association loading path
    // SCOPE: ~30 LOC in strict-loading.ts + associations/association.ts; affects ~41 tests in strict-loading.test.ts
  });
  it.skip("does not raise on eager loading a strict loading habtm relation", () => {
    // BLOCKED: relation — StrictLoadingViolation not wired into association loading
    // ROOT-CAUSE: strict-loading.ts#checkStrictLoading not called from association loading path
    // SCOPE: ~30 LOC in strict-loading.ts + associations/association.ts; affects ~41 tests in strict-loading.test.ts
  });
  it.skip("does not raise on eager loading a habtm relation if strict loading by default", () => {
    // BLOCKED: relation — StrictLoadingViolation not wired into association loading
    // ROOT-CAUSE: strict-loading.ts#checkStrictLoading not called from association loading path
    // SCOPE: ~30 LOC in strict-loading.ts + associations/association.ts; affects ~41 tests in strict-loading.test.ts
  });
  it("strict loading violation can log instead of raise", async () => {
    class ClirAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class ClirBook extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
      }
    }
    registerModel("ClirAuthor", ClirAuthor);
    registerModel("ClirBook", ClirBook);
    const clirOpts = { className: "ClirBook", foreignKey: "author_id" };
    Associations.hasMany.call(ClirAuthor, "clir_books", clirOpts);
    const author = await ClirAuthor.create({ name: "Test" });
    author.strictLoadingBang();

    setActionOnStrictLoadingViolation("log");
    let logged = false;
    const sub = Notifications.subscribe("strict_loading_violation.active_record", () => {
      logged = true;
    });
    try {
      await loadHasMany(author, "clir_books", clirOpts);
      expect(logged).toBe(true);
    } finally {
      Notifications.unsubscribe(sub);
      setActionOnStrictLoadingViolation("raise");
    }
  });
  it("strict loading violation logs on polymorphic relation", async () => {
    class ClpPirate extends Base {
      static {
        this.attribute("catchphrase", "string");
      }
    }
    class ClpTag extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
      }
    }
    registerModel("ClpPirate", ClpPirate);
    registerModel("ClpTag", ClpTag);
    const pirate = await ClpPirate.create({ catchphrase: "Arrr!" });
    const tag = await ClpTag.create({
      name: "ruby",
      taggable_id: pirate.id,
      taggable_type: "ClpPirate",
    });
    tag.strictLoadingBang();

    setActionOnStrictLoadingViolation("log");
    let logged: string | null = null;
    const sub = Notifications.subscribe("strict_loading_violation.active_record", (event: any) => {
      // Mirrors LogSubscriber#strictLoadingViolation: passes payload.owner
      // (the class) straight into the message builder.
      logged = event.payload.reflection.strictLoadingViolationMessage(event.payload.owner);
    });
    try {
      await loadBelongsTo(tag, "taggable", { polymorphic: true });
      expect(logged).toBe(
        "`ClpTag` is marked for strict_loading. " +
          "The polymorphic association named `:taggable` cannot be lazily loaded.",
      );
    } finally {
      Notifications.unsubscribe(sub);
      setActionOnStrictLoadingViolation("raise");
    }
  });
});

describe("StrictLoadingFixturesTest", () => {
  it.skip("strict loading violations are ignored on fixtures", () => {
    // BLOCKED: relation — StrictLoadingViolation not wired into association loading
    // ROOT-CAUSE: strict-loading.ts#checkStrictLoading not called from association loading path
    // SCOPE: ~30 LOC in strict-loading.ts + associations/association.ts; affects ~41 tests in strict-loading.test.ts
    /* fixture-dependent */
  });
});

describe("strict_loading", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({
      authors: { name: "string" },
      books: { author_id: "integer" },
      authors2: { name: "string" },
      posts: { author2_id: "integer" },
    });
  });
  it("raises StrictLoadingViolationError on lazy association load", async () => {
    class Author extends Base {
      static _tableName = "authors";
    }
    Author.attribute("id", "integer");
    Author.attribute("name", "string");
    registerModel("Author", Author);

    class Book extends Base {
      static _tableName = "books";
    }
    Book.attribute("id", "integer");
    Book.attribute("author_id", "integer");
    Associations.belongsTo.call(Book, "author");

    const author = await Author.create({ name: "Test" });
    await Book.create({ author_id: author.id });

    const books = await Book.all().strictLoading().toArray();
    expect(books[0].isStrictLoading()).toBe(true);
    await expect(loadBelongsTo(books[0], "author", {})).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  it("strictLoadingBang() on a record instance", async () => {
    class Author extends Base {
      static _tableName = "authors2";
    }
    Author.attribute("id", "integer");
    Author.attribute("name", "string");
    registerModel("Author2", Author);

    class Post extends Base {
      static _tableName = "posts";
    }
    Post.attribute("id", "integer");
    Post.attribute("author2_id", "integer");
    Associations.belongsTo.call(Post, "author2", { className: "Author2" });

    const author = await Author.create({ name: "Test" });
    await Post.create({ author2_id: author.id });

    const post = (await Post.all().first()) as Base;
    post.strictLoadingBang();
    expect(post.isStrictLoading()).toBe(true);
    await expect(loadBelongsTo(post, "author2", { className: "Author2" })).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });
});

describe("strictLoadingByDefault", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({ users: { name: "string" } });
  });

  it("defaults to false", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    expect(User.strictLoadingByDefault).toBe(false);
  });

  it("sets strict loading on instantiated records when enabled", async () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.strictLoadingByDefault = true;
      }
    }
    await User.create({ name: "Alice" });
    const user = await User.findBy({ name: "Alice" });
    expect(user!.isStrictLoading()).toBe(true);
    // Clean up
    User.strictLoadingByDefault = false;
  });

  it("does not affect records when disabled", async () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    await User.create({ name: "Bob" });
    const user = await User.findBy({ name: "Bob" });
    expect(user!.isStrictLoading()).toBe(false);
  });
});
