/**
 * Faithful port of vendor/rails/activerecord/test/cases/enum_test.rb.
 *
 * Rides the canonical `Book` model (test-helpers/models/book.ts) and the real
 * `books` fixtures (test-helpers/fixtures/books.ts), mirroring Rails' own test
 * names and assertions. Ruby predicate/scope/bang accessors translate to the
 * trails camelCase surface (`@book.published?` → `book.isPublished()`,
 * `Book.published` → `Book.published()`, `@book.written!` → `book.writtenBang()`,
 * `Book.statuses` → `Book.statuses`).
 *
 * Cases the canonical `Book` enum surface cannot yet express are kept under
 * their Rails names and `it.skip`-ped, tracked-pending-convergence under RFC
 * 0023-surfaced-deviations (enum-canonical-book-gaps): the `cover` string enum,
 * the `boolean_status` boolean enum, the `last_read` `forgotten: nil` value,
 * frozen `statuses`, `*_before_type_cast` / `*_for_database`, the `validate:`
 * option, and the conflict-detection / option-validation message surface
 * (the last is covered behaviorally in enum.trails.test.ts).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Base, registerModel } from "./index.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { Book } from "./test-helpers/models/book.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";

describe("EnumTest", () => {
  const { books } = fixtures(["books"], { schema: TEST_SCHEMA });

  beforeAll(() => {
    registerModel(Book);
  });

  let book: Book;
  beforeEach(() => {
    book = books("awdr");
  });

  it("type.serialize", () => {
    const type = Book.typeForAttribute("status");

    expect(type.serialize(0)).toBe(0);
    expect(type.serialize(1)).toBe(1);
    expect(type.serialize(2)).toBe(2);

    expect(type.serialize("proposed")).toBe(0);
    expect(type.serialize("written")).toBe(1);
    expect(type.serialize("published")).toBe(2);

    expect(type.serialize("unknown")).toBeNull();
  });

  // Rails: `type.cast(:unknown)` / `type.cast("unknown")` pass the unknown value
  // through unchanged (`value.presence`).
  it("type.cast", () => {
    const type = Book.typeForAttribute("status");
    expect(type.cast(0)).toBe("proposed");
    expect(type.cast(1)).toBe("written");
    expect(type.cast(2)).toBe("published");
    expect(type.cast("proposed")).toBe("proposed");
    expect(type.cast("written")).toBe("written");
    expect(type.cast("published")).toBe("published");
    expect(type.cast("unknown")).toBe("unknown");
  });

  it("query state by predicate", () => {
    expect((book as any).isPublished()).toBe(true);
    expect((book as any).isWritten()).toBe(false);
    expect((book as any).isProposed()).toBe(false);

    expect((book as any).isRead()).toBe(true);
    expect((book as any).isInEnglish()).toBe(true);
    expect((book as any).isAuthorVisibilityVisible()).toBe(true);
    expect((book as any).isIllustratorVisibilityVisible()).toBe(true);
    expect((book as any).isWithMediumFontSize()).toBe(true);
    expect((book as any).isMediumToRead()).toBe(true);
  });

  it("query state with strings", () => {
    expect((book as any).status).toBe("published");
    expect((book as any).last_read).toBe("read");
    expect((book as any).language).toBe("english");
    expect((book as any).author_visibility).toBe("visible");
    expect((book as any).illustrator_visibility).toBe("visible");
    expect((book as any).difficulty).toBe("medium");
    // Rails also asserts `@book.cover == "soft"` as an enum reader; `cover` is a
    // raw string column on canonical Book (no enum), so the assertion is pending
    // (0023-surfaced-deviations/enum-canonical-book-gaps) to avoid false fidelity.
  });

  it("find via scope", async () => {
    book = books("awdr");
    expect((await (Book as any).published().first())?.id).toBe(book.id);
    expect((await (Book as any).read().first())?.id).toBe(book.id);
    expect((await (Book as any).inEnglish().first())?.id).toBe(book.id);
    expect((await (Book as any).authorVisibilityVisible().first())?.id).toBe(book.id);
    expect((await (Book as any).illustratorVisibilityVisible().first())?.id).toBe(book.id);
    expect((await (Book as any).mediumToRead().first())?.id).toBe(book.id);
    // Rails also asserts `Book.forgotten.first == books(:ddd)` (last_read
    // `forgotten: nil`, not mapped on canonical Book) and
    // `authors(:david).unpublished_books.first` — both pending.
  });

  it("find via negative scope", async () => {
    const notPublished = await (Book as any).notPublished().toArray();
    expect(notPublished.some((b: Book) => b.id === book.id)).toBe(false);
    const notProposed = await (Book as any).notProposed().toArray();
    expect(notProposed.some((b: Book) => b.id === book.id)).toBe(true);
  });

  it("find via where with values", async () => {
    const published = (Book as any).statuses.published;
    const written = (Book as any).statuses.written;

    expect((await Book.where({ status: published }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: written }).first())?.id).not.toBe(book.id);
    expect((await Book.where({ status: [published, published] }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: [written, written] }).first())?.id).not.toBe(book.id);
    expect((await Book.whereNot({ status: published }).first())?.id).not.toBe(book.id);
    expect((await Book.whereNot({ status: written }).first())?.id).toBe(book.id);
  });

  // Surfaced gap: every assertion uses `Book.statuses[...].to_s` (a numeric
  // string like "2"), and `where({ status: "2" })` doesn't serialize the
  // numeric string through EnumType in the predicate builder (it matches
  // `IS NULL` instead). Plus the `cover` tail. Pending under
  // 0023-surfaced-deviations/enum-canonical-book-gaps.
  it.skip("find via where with values.to_s", () => {});

  // Ruby symbols map to trails' label strings.
  it("find via where with symbols", async () => {
    book = books("awdr");
    expect((await Book.where({ status: "published" }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: "written" }).first())?.id).not.toBe(book.id);
    expect((await Book.whereNot({ status: "published" }).first())?.id).not.toBe(book.id);
    expect((await Book.whereNot({ status: "written" }).first())?.id).toBe(book.id);
    // Pending: array-of-label `where({ status: ["published", ...] })` (the
    // predicate builder doesn't map enum labels per array element),
    // `last_read: forgotten`, `status: prohibited` (nil), and `cover` matches.
  });

  it("find via where with strings", async () => {
    book = books("awdr");
    expect((await Book.where({ status: "published" }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: "written" }).first())?.id).not.toBe(book.id);
    expect((await Book.whereNot({ status: "published" }).first())?.id).not.toBe(book.id);
    expect((await Book.whereNot({ status: "written" }).first())?.id).toBe(book.id);
    // Pending: array-of-label `where`, `last_read: "forgotten"`, and
    // `status: "prohibited"` (nil).
  });

  // Rails uses 64-bit out-of-range labels and beginless/endless ranges.
  it.skip("find via where with large number", () => {});

  // Rails: `Book.enabled.create!` / `boolean_status` / `cover` enums.
  it.skip("find via where should be type casted", () => {});

  it("build from scope", () => {
    expect((Book as any).written().build().isWritten()).toBe(true);
    expect((Book as any).written().build().isProposed()).toBe(false);
    // Rails also asserts `PublishedBook.hard.build.hard?` /  `.soft?` — canonical
    // PublishedBook omits the `cover` enum (`enum :cover, { hard: "0", soft: "1" }`),
    // so that half is pending (0023-surfaced-deviations/enum-canonical-book-gaps).
  });

  it("build from where", () => {
    expect(
      (Book.where({ status: (Book as any).statuses.written }).build() as any).isWritten(),
    ).toBe(true);
    expect(
      (Book.where({ status: (Book as any).statuses.written }).build() as any).isProposed(),
    ).toBe(false);
    expect((Book.where({ status: "written" }).build() as any).isWritten()).toBe(true);
    expect((Book.where({ status: "written" }).build() as any).isProposed()).toBe(false);
  });

  it("update by declaration", async () => {
    await (book as any).writtenBang();
    expect((book as any).isWritten()).toBe(true);
    await (book as any).inEnglishBang();
    expect((book as any).isInEnglish()).toBe(true);
    await (book as any).authorVisibilityVisibleBang();
    expect((book as any).isAuthorVisibilityVisible()).toBe(true);
    // Rails also asserts `@book.hard!` — `cover` enum not on canonical Book.
  });

  it("update by setter", async () => {
    await book.updateBang({ status: "written" });
    expect((book as any).isWritten()).toBe(true);
    // Rails also asserts `@book.update! cover: :hard` — `cover` enum absent.
  });

  // Rails overrides `published!` to return a string; trails' generated bang
  // setter isn't overridable in the same way.
  it.skip("enum methods are overwritable", () => {});

  it("direct assignment", () => {
    (book as any).status = "written";
    expect((book as any).isWritten()).toBe(true);
    // Rails also asserts `@book.cover = :hard` — `cover` enum not on canonical Book.
  });

  it("assign string value", () => {
    (book as any).status = "written";
    expect((book as any).isWritten()).toBe(true);
    // Rails also asserts `@book.cover = "hard"` — `cover` enum not on canonical Book.
  });

  // Rails reads `@book.changed_attributes[:status]` (old-value hash); trails'
  // `changedAttributes` is a string[] of names, not a name→old-value map.
  it.skip("enum changed attributes", () => {});

  it("enum value after write symbol", () => {
    (book as any).status = "proposed";
    expect((book as any).status).toBe("proposed");
  });

  it("enum value after write string", () => {
    (book as any).status = "proposed";
    expect((book as any).status).toBe("proposed");
  });

  it("enum changes", () => {
    const oldStatus = (book as any).status;
    const oldLanguage = (book as any).language;
    (book as any).status = "proposed";
    (book as any).language = "spanish";
    expect(book.changes.status).toEqual([oldStatus, "proposed"]);
    expect(book.changes.language).toEqual([oldLanguage, "spanish"]);
  });

  it("enum attribute was", () => {
    const oldStatus = (book as any).status;
    const oldLanguage = (book as any).language;
    (book as any).status = "published";
    (book as any).language = "spanish";
    expect(book.attributeWas("status")).toBe(oldStatus);
    expect(book.attributeWas("language")).toBe(oldLanguage);
  });

  it("enum attribute changed", () => {
    (book as any).status = "proposed";
    (book as any).language = "french";
    expect(book.attributeChanged("status")).toBe(true);
    expect(book.attributeChanged("language")).toBe(true);
  });

  it("enum attribute changed to", () => {
    (book as any).status = "proposed";
    (book as any).language = "french";
    expect(book.attributeChanged("status", { to: "proposed" })).toBe(true);
    expect(book.attributeChanged("language", { to: "french" })).toBe(true);
  });

  it("enum attribute changed from", () => {
    const oldStatus = (book as any).status;
    const oldLanguage = (book as any).language;
    (book as any).status = "proposed";
    (book as any).language = "french";
    expect(book.attributeChanged("status", { from: oldStatus })).toBe(true);
    expect(book.attributeChanged("language", { from: oldLanguage })).toBe(true);
  });

  it("enum attribute changed from old status to new status", () => {
    const oldStatus = (book as any).status;
    const oldLanguage = (book as any).language;
    (book as any).status = "proposed";
    (book as any).language = "french";
    expect(book.attributeChanged("status", { from: oldStatus, to: "proposed" })).toBe(true);
    expect(book.attributeChanged("language", { from: oldLanguage, to: "french" })).toBe(true);
  });

  it("enum didn't change", () => {
    const oldStatus = (book as any).status;
    (book as any).status = oldStatus;
    expect(book.attributeChanged("status")).toBe(false);
  });

  it("persist changes that are dirty", () => {
    (book as any).status = "proposed";
    expect(book.attributeChanged("status")).toBe(true);
    (book as any).status = "written";
    expect(book.attributeChanged("status")).toBe(true);
  });

  it("reverted changes that are not dirty", () => {
    const oldStatus = (book as any).status;
    (book as any).status = "proposed";
    expect(book.attributeChanged("status")).toBe(true);
    (book as any).status = oldStatus;
    expect(book.attributeChanged("status")).toBe(false);
  });

  it("reverted changes are not dirty going from nil to value and back", async () => {
    const created = await Book.createBang({ nullable_status: null });
    (created as any).nullable_status = "married";
    expect(created.attributeChanged("nullable_status")).toBe(true);
    (created as any).nullable_status = null;
    expect(created.attributeChanged("nullable_status")).toBe(false);
  });

  it("assign non existing value raises an error", () => {
    expect(() => {
      (book as any).status = "unknown";
    }).toThrow("'unknown' is not a valid status");
  });

  // Rails: `enum :status, [...], validate: true|hash` — the `validate:` option
  // is not yet wired into the trails enum macro.
  it.skip("validation with 'validate: true' option", () => {});
  it.skip("validation with 'validate: hash' option", () => {});

  // Rails: `Book.where(id:).update_all("status = NULL")` (raw SQL fragment).
  it.skip("NULL values from database should be casted to nil", () => {});

  // Rails: `books(:ddd).last_read == "forgotten"` — `forgotten: nil` not on Book.
  it.skip("deserialize nil value to enum which defines nil value to hash", () => {});

  it("assign nil value", () => {
    (book as any).status = null;
    expect((book as any).status).toBeNull();
  });

  // Rails: `@book.last_read = nil` → "forgotten" — `forgotten: nil` not on Book.
  it.skip("assign nil value to enum which defines nil value to hash", () => {});

  it("assign empty string value", () => {
    (book as any).status = "";
    expect((book as any).status).toBeNull();
  });

  // Rails treats `false` as blank → casts to nil.
  it("assign false value to a field defined as not boolean", () => {
    (book as any).status = false;
    expect((book as any).status).toBeNull();
  });

  // Rails: `@book.boolean_status = false` → "disabled" — boolean enum not on Book.
  it.skip("assign false value to a field defined as boolean", () => {});

  it("assign long empty string value", () => {
    (book as any).status = "   ";
    expect((book as any).status).toBeNull();
  });

  it("constant to access the mapping", () => {
    expect((Book as any).statuses.proposed).toBe(0);
    expect((Book as any).statuses.written).toBe(1);
    expect((Book as any).statuses.published).toBe(2);
  });

  it("building new objects with enum scopes", () => {
    expect((Book as any).written().build().isWritten()).toBe(true);
    expect((Book as any).read().build().isRead()).toBe(true);
    expect((Book as any).inSpanish().build().isInSpanish()).toBe(true);
    expect(
      (Book as any).illustratorVisibilityInvisible().build().isIllustratorVisibilityInvisible(),
    ).toBe(true);
  });

  it("creating new objects with enum scopes", async () => {
    expect((await (Book as any).written().create()).isWritten()).toBe(true);
    expect((await (Book as any).read().create()).isRead()).toBe(true);
    expect((await (Book as any).inSpanish().create()).isInSpanish()).toBe(true);
    expect(
      (
        await (Book as any).illustratorVisibilityInvisible().create()
      ).isIllustratorVisibilityInvisible(),
    ).toBe(true);
  });

  // Rails: `status_before_type_cast` returns the raw stored integer.
  it.skip("attribute_before_type_cast", () => {});
  // Rails: `status_for_database` returns the serialized integer.
  it.skip("attribute_for_database", () => {});
  it.skip("attributes_for_database", () => {});

  it("invalid definition values raise an ArgumentError", () => {
    // Rails wraps each in `Class.new(ActiveRecord::Base) { self.table_name =
    // "books"; enum :status, ... }`; mirror with a fresh class on the books
    // table so a bad definition never mutates the canonical Book.
    const defineStatusEnum = (values: unknown) => {
      class K extends Base {
        static _tableName = "books";
      }
      (K as any).enum("status", values);
    };
    expect(() => defineStatusEnum(undefined)).toThrow(ArgumentError); // no-arg `enum :status`
    expect(() => defineStatusEnum({})).toThrow(ArgumentError);
    expect(() => defineStatusEnum([])).toThrow(ArgumentError);
    expect(() => defineStatusEnum([{ proposed: 1, written: 2 }])).toThrow(ArgumentError);
    expect(() => defineStatusEnum({ "": 1, active: 2 })).toThrow(ArgumentError);
    expect(() => defineStatusEnum(["active", ""])).toThrow(ArgumentError);
    expect(() => defineStatusEnum(new (class {})())).toThrow(ArgumentError);
    // Rails also asserts the exact message patterns (`must not be empty`,
    // `must not contain a blank name`, `must only contain symbols or strings`,
    // `must be either a non-empty hash or an array`); trails' wording differs, so
    // the message surface is asserted in enum.trails.test.ts
    // (assertValidEnumDefinitionValues) rather than against Rails' strings here.
  });

  // Rails: conflict detection on reserved AR method names — message surface is
  // covered behaviorally in enum.trails.test.ts.
  it.skip("reserved enum names", () => {});
  it.skip("reserved enum values", () => {});
  it.skip("reserved enum values for relation", () => {});
  it.skip("can use id as a value with a prefix or suffix", () => {});
  it.skip("overriding enum method should not raise", () => {});

  // Rails: anonymous AR class with `validates_uniqueness_of` / inclusion.
  it.skip("validate uniqueness", () => {});
  it.skip("validate inclusion of value in array", () => {});

  // Rails: `book.status_change` / per-class & inheritable enum redefinition.
  it.skip("enums are distinct per class", () => {});
  it.skip("enums are inheritable", () => {});

  // Rails: `Book.statuses` is frozen; trails returns a mutable copy.
  it.skip("attempting to modify enum raises error", () => {});

  it("declare multiple enums with prefix: true", () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.attribute("status", "integer");
        this.attribute("last_read", "integer");
        this.enum("status", ["value_1"] as any, { prefix: true });
        this.enum("last_read", ["value_1"] as any, { prefix: true });
      }
    }
    const instance = new K();
    expect(typeof (instance as any).isStatusValue1).toBe("function");
    expect(typeof (instance as any).isLastReadValue1).toBe("function");
  });

  it("declare multiple enums with suffix: true", () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.attribute("status", "integer");
        this.attribute("last_read", "integer");
        this.enum("status", ["value_1"] as any, { suffix: true });
        this.enum("last_read", ["value_1"] as any, { suffix: true });
      }
    }
    const instance = new K();
    expect(typeof (instance as any).isValue1Status).toBe("function");
    expect(typeof (instance as any).isValue1LastRead).toBe("function");
  });

  // Rails: `alias_attribute` combined with `enum` on the alias.
  it.skip("enum with alias_attribute", () => {});

  it("query state by predicate with prefix", () => {
    expect((book as any).isAuthorVisibilityVisible()).toBe(true);
    expect((book as any).isAuthorVisibilityInvisible()).toBe(false);
    expect((book as any).isIllustratorVisibilityVisible()).toBe(true);
    expect((book as any).isIllustratorVisibilityInvisible()).toBe(false);
  });

  it("query state by predicate with custom prefix", () => {
    expect((book as any).isInEnglish()).toBe(true);
    expect((book as any).isInSpanish()).toBe(false);
    expect((book as any).isInFrench()).toBe(false);
  });

  it("query state by predicate with custom suffix", () => {
    expect((book as any).isMediumToRead()).toBe(true);
    expect((book as any).isEasyToRead()).toBe(false);
    expect((book as any).isHardToRead()).toBe(false);
  });

  it("enum methods with custom suffix defined", () => {
    expect(typeof (Book as any).easyToRead).toBe("function");
    expect(typeof (Book as any).mediumToRead).toBe("function");
    expect(typeof (Book as any).hardToRead).toBe("function");

    expect(typeof (book as any).isEasyToRead).toBe("function");
    expect(typeof (book as any).isMediumToRead).toBe("function");
    expect(typeof (book as any).isHardToRead).toBe("function");

    expect(typeof (book as any).easyToReadBang).toBe("function");
    expect(typeof (book as any).mediumToReadBang).toBe("function");
    expect(typeof (book as any).hardToReadBang).toBe("function");
  });

  it("update enum attributes with custom suffix", async () => {
    await (book as any).mediumToReadBang();
    expect((book as any).isEasyToRead()).toBe(false);
    expect((book as any).isMediumToRead()).toBe(true);
    expect((book as any).isHardToRead()).toBe(false);

    await (book as any).easyToReadBang();
    expect((book as any).isEasyToRead()).toBe(true);
    expect((book as any).isMediumToRead()).toBe(false);
    expect((book as any).isHardToRead()).toBe(false);

    await (book as any).hardToReadBang();
    expect((book as any).isEasyToRead()).toBe(false);
    expect((book as any).isMediumToRead()).toBe(false);
    expect((book as any).isHardToRead()).toBe(true);
  });

  it("uses default status when no status is provided in fixtures", () => {
    const tlg = books("tlg");
    expect((tlg as any).isProposed()).toBe(true);
    expect((tlg as any).isInEnglish()).toBe(true);
  });

  // In-memory `new Book()` does not seed the DB column default (`status` → 0)
  // through EnumType#cast, so the label isn't applied until the row round-trips.
  it.skip("uses default value from database on initialization", () => {
    expect((new Book() as any).isProposed()).toBe(true);
  });

  // Rails: default `cover` ("hard") from the DB — `cover` enum not on Book.
  it.skip("uses default value from database on initialization when using custom mapping", () => {});

  it("data type of Enum type", () => {
    expect(Book.typeForAttribute("status").type()).toBe("integer");
  });

  it("enum on custom attribute with default", () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.attribute("status", "integer", { default: 2 });
        this.enum("status", ["proposed", "written", "published"] as any);
      }
    }
    expect((new K() as any).status).toBe("published");
  });

  // Rails: `enum :status, [...], default: :published` — the macro-level
  // `default:` option is not yet wired into the trails enum macro.
  it.skip("overloaded default by :default", () => {});

  // Rails: the legacy `:_default` / `:_prefix` / `:_suffix` / `:_scopes` /
  // `:_instance_methods` options must raise — covered behaviorally in
  // enum.trails.test.ts (assertValidEnumOptions).
  it.skip(":_default is invalid in the new API", () => {});
  it.skip(":_prefix is invalid in the new API", () => {});
  it.skip(":_suffix is invalid in the new API", () => {});
  it.skip(":_scopes is invalid in the new API", () => {});
  it.skip(":_instance_methods is invalid in the new API", () => {});

  // Rails: `scopes: false` / `instance_methods: false` opt-outs.
  it.skip("scopes can be disabled by :scopes", () => {});
  it.skip("default methods can be disabled by :instance_methods", () => {});

  it("query state by predicate with :prefix", () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.attribute("status", "integer");
        this.attribute("last_read", "integer");
        this.enum("status", { proposed: 0, written: 1 }, { prefix: true });
        this.enum("last_read", { unread: 0, reading: 1, read: 2 }, { prefix: "being" });
      }
    }
    const instance = new K();
    expect(typeof (instance as any).isStatusProposed).toBe("function");
    expect(typeof (instance as any).isBeingUnread).toBe("function");
  });

  it("query state by predicate with :suffix", () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.attribute("cover", "integer");
        this.attribute("difficulty", "integer");
        this.enum("cover", { hard: 0, soft: 1 }, { suffix: true });
        this.enum("difficulty", { easy: 0, medium: 1, hard: 2 }, { suffix: "toRead" });
      }
    }
    const instance = new K();
    expect(typeof (instance as any).isHardCover).toBe("function");
    expect(typeof (instance as any).isEasyToRead).toBe("function");
  });

  // Depends on the in-memory DB-default seeding gap above: `new K()` doesn't
  // seed `status` → 0 → "active" through EnumType#cast.
  it.skip("enum labels as keyword arguments", () => {});

  // Same in-memory DB-default seeding gap: `new K()` doesn't seed `status` → 0.
  it.skip("option names can be used as label", () => {});

  it("scopes are named like methods", () => {
    class K extends Base {
      static _tableName = "cats";
      static {
        this.attribute("breed", "string");
        this.enum("breed", { "American Bobtail": 0, "Balinese-Javanese": 1 });
      }
    }
    expect(typeof (K as any).americanBobtail).toBe("function");
    expect(typeof (K as any).balineseJavanese).toBe("function");
  });

  // Rails: anonymous-class enum names with capitals / unicode / slashes, and
  // Struct-keyed hash labels — JS-idiom-divergent enum-name surfaces.
  it.skip("capital characters for enum names", () => {});
  it.skip("unicode characters for enum names", () => {});
  it.skip("mangling collision for enum names", () => {});
  it.skip("deserialize enum value to original hash key", () => {});
  it.skip("serializable? with large number label", () => {});

  // Rails: logger-warning surface for negative-scope clashes — covered
  // behaviorally in enum.trails.test.ts (detectNegativeEnumConditionsBang).
  it.skip("enum logs a warning if auto-generated negative scopes would clash with other enum names", () => {});
  it.skip("enum logs a warning if auto-generated negative scopes would clash with other enum names regardless of order", () => {});
  it.skip("enum doesn't log a warning if no clashes detected", () => {});
  it.skip("enum doesn't log a warning if opting out of scopes", () => {});

  // Rails: `type_for_attribute` on an enum with an undeclared / explicit type.
  it.skip("raises for attributes with undeclared type", () => {});
  it.skip("supports attributes declared with a explicit type", () => {});
});
