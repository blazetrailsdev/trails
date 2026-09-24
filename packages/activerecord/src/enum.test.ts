import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Base, registerModel, Range } from "./index.js";
import { ArgumentError, RuntimeError } from "@blazetrails/activemodel";
import { assertRespondTo, assertRaises, assertEmpty, Logger } from "@blazetrails/activesupport";
import { Book, PublishedBook } from "./test-helpers/models/book.js";
import { Author } from "./test-helpers/models/author.js";
import { fixtures } from "./test-fixtures.js";

class MockLogger extends Logger {
  private _logged: Record<string, string[]> = { warn: [] };

  constructor() {
    super(null);
  }

  logged(level: string): string[] {
    return this._logged[level] ?? [];
  }

  override warn(message?: string | (() => string)): boolean {
    this._logged.warn.push(typeof message === "function" ? message() : (message ?? ""));
    return true;
  }
}

describe("EnumTest", () => {
  const { books, authors } = fixtures(["books", "authors", "authorAddresses"]);

  beforeAll(() => {
    registerModel(Book);
    registerModel(PublishedBook);
    registerModel(Author);
  });

  let book: Book;
  beforeEach(() => {
    book = books("awdr");
  });

  it("type.serialize", () => {
    const type = Book.typeForAttribute("status")!;

    expect(type.serialize(0)).toBe(0);
    expect(type.serialize(1)).toBe(1);
    expect(type.serialize(2)).toBe(2);

    expect(type.serialize(":proposed")).toBe(0);
    expect(type.serialize(":written")).toBe(1);
    expect(type.serialize(":published")).toBe(2);

    expect(type.serialize("proposed")).toBe(0);
    expect(type.serialize("written")).toBe(1);
    expect(type.serialize("published")).toBe(2);

    expect(type.serialize(":unknown")).toBeNull();
    expect(type.serialize("unknown")).toBeNull();
  });

  it("type.cast", () => {
    const type = Book.typeForAttribute("status")!;
    expect(type.cast(0)).toBe("proposed");
    expect(type.cast(1)).toBe("written");
    expect(type.cast(2)).toBe("published");
    expect(type.cast(":proposed")).toBe("proposed");
    expect(type.cast(":written")).toBe("written");
    expect(type.cast(":published")).toBe("published");
    expect(type.cast("proposed")).toBe("proposed");
    expect(type.cast("written")).toBe("written");
    expect(type.cast("published")).toBe("published");
    expect(type.cast(":unknown")).toBe(":unknown");
    expect(type.cast("unknown")).toBe("unknown");
  });

  it("query state by predicate", () => {
    expect((book as any).isPublished()).toBeTruthy();
    expect((book as any).isWritten()).toBeFalsy();
    expect((book as any).isProposed()).toBeFalsy();

    expect((book as any).isRead()).toBeTruthy();
    expect((book as any).isInEnglish()).toBeTruthy();
    expect((book as any).isAuthorVisibilityVisible()).toBeTruthy();
    expect((book as any).isIllustratorVisibilityVisible()).toBeTruthy();
    expect((book as any).isWithMediumFontSize()).toBeTruthy();
    expect((book as any).isMediumToRead()).toBeTruthy();
  });

  it("query state with strings", () => {
    expect((book as any).status).toBe("published");
    expect((book as any).last_read).toBe("read");
    expect((book as any).language).toBe("english");
    expect((book as any).author_visibility).toBe("visible");
    expect((book as any).illustrator_visibility).toBe("visible");
    expect((book as any).difficulty).toBe("medium");
    expect((book as any).cover).toBe("soft");
  });

  it("find via scope", async () => {
    book = books("awdr");
    expect((await (Book as any).published().first())?.id).toBe(book.id);
    expect((await (Book as any).read().first())?.id).toBe(book.id);
    expect((await (Book as any).inEnglish().first())?.id).toBe(book.id);
    expect((await (Book as any).authorVisibilityVisible().first())?.id).toBe(book.id);
    expect((await (Book as any).illustratorVisibilityVisible().first())?.id).toBe(book.id);
    expect((await (Book as any).mediumToRead().first())?.id).toBe(book.id);
    expect((await (Book as any).forgotten().first())?.id).toBe(books("ddd").id);
    expect((await authors("david").unpublishedBooks.first())?.id).toBe(books("rfr").id);
  });

  it("find via negative scope", async () => {
    const notPublished = await (Book as any).notPublished().toArray();
    expect(notPublished.every((b: Book) => b.id !== book.id)).toBeTruthy();
    const notProposed = await (Book as any).notProposed().toArray();
    expect(notProposed.some((b: Book) => b.id === book.id)).toBeTruthy();
  });

  it("find via where with values", async () => {
    const published = (Book as any).statuses.published;
    const written = (Book as any).statuses.written;

    expect((await Book.where({ status: published }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: written }).first())?.id).not.toBe(book.id);
    expect((await Book.where({ status: [published, published] }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: [written, written] }).first())?.id).not.toBe(book.id);
    expect((await Book.where().not({ status: published }).first())?.id).not.toBe(book.id);
    expect((await Book.where().not({ status: written }).first())?.id).toBe(book.id);
  });

  it("find via where with values.to_s", async () => {
    book = books("awdr");
    const published = String((Book as any).statuses.published);
    const written = String((Book as any).statuses.written);

    expect((await Book.where({ status: published }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: written }).first())?.id).not.toBe(book.id);
    expect((await Book.where({ status: [published, published] }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: [written, written] }).first())?.id).not.toBe(book.id);
    expect((await Book.where().not({ status: published }).first())?.id).not.toBe(book.id);
    expect((await Book.where().not({ status: written }).first())?.id).toBe(book.id);
    expect((await Book.where({ cover: (Book as any).covers.soft }).first())?.id).toBe(book.id);
  });

  it("find via where with symbols", async () => {
    book = books("awdr");
    expect((await Book.where({ status: "published" }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: "written" }).first())?.id).not.toBe(book.id);
    expect((await Book.where({ status: ["published", "published"] }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: ["written", "written"] }).first())?.id).not.toBe(book.id);
    expect((await Book.where().not({ status: "published" }).first())?.id).not.toBe(book.id);
    expect((await Book.where().not({ status: "written" }).first())?.id).toBe(book.id);
    expect((await Book.where({ last_read: "forgotten" }).first())?.id).toBe(books("ddd").id);
    expect(await Book.where({ status: "prohibited" }).first()).toBeNull();
    expect((await Book.where({ cover: "soft" }).first())?.id).toBe(book.id);
    expect((await Book.where().not({ cover: "hard" }).first())?.id).toBe(book.id);
  });

  it("find via where with strings", async () => {
    book = books("awdr");
    expect((await Book.where({ status: "published" }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: "written" }).first())?.id).not.toBe(book.id);
    expect((await Book.where({ status: ["published", "published"] }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: ["written", "written"] }).first())?.id).not.toBe(book.id);
    expect((await Book.where().not({ status: "published" }).first())?.id).not.toBe(book.id);
    expect((await Book.where().not({ status: "written" }).first())?.id).toBe(book.id);
    expect((await Book.where({ last_read: "forgotten" }).first())?.id).toBe(books("ddd").id);
    expect(await Book.where({ status: "prohibited" }).first()).toBeNull();
  });

  it("find via where with large number", async () => {
    book = books("awdr");
    const big = 9223372036854775808n;
    expect((await Book.where({ status: [2, big] }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: ["2", "9223372036854775808"] }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: new Range<unknown>(2, big) }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: new Range("2", "9223372036854775808") }).first())?.id).toBe(
      book.id,
    );
  });

  it("find via where should be type casted", async () => {
    const created = await (Book as any).enabled().create();
    expect(created.isEnabled()).toBeTruthy();

    const enabled = String((Book as any).boolean_statuses.enabled);
    expect((await Book.where({ boolean_status: enabled }).last())?.id).toBe(created.id);
    expect((await Book.where({ cover: "soft" }).first())?.id).toBe(books("awdr").id);
    expect((await Book.where().not({ cover: "hard" }).first())?.id).toBe(books("awdr").id);
  });

  it("build from scope", () => {
    expect((Book as any).written().build().isWritten()).toBeTruthy();
    expect((Book as any).written().build().isProposed()).toBeFalsy();
    expect((PublishedBook as any).hard().build().isHard()).toBeTruthy();
    expect((PublishedBook as any).hard().build().isSoft()).toBeFalsy();
  });

  it("build from where", () => {
    expect(
      (Book.where({ status: (Book as any).statuses.written }).build() as any).isWritten(),
    ).toBeTruthy();
    expect(
      (Book.where({ status: (Book as any).statuses.written }).build() as any).isProposed(),
    ).toBeFalsy();
    expect((Book.where({ status: ":written" }).build() as any).isWritten()).toBeTruthy();
    expect((Book.where({ status: ":written" }).build() as any).isProposed()).toBeFalsy();
    expect((Book.where({ status: "written" }).build() as any).isWritten()).toBeTruthy();
    expect((Book.where({ status: "written" }).build() as any).isProposed()).toBeFalsy();
  });

  it("update by declaration", async () => {
    await (book as any).writtenBang();
    expect((book as any).isWritten()).toBeTruthy();
    await (book as any).inEnglishBang();
    expect((book as any).isInEnglish()).toBeTruthy();
    await (book as any).authorVisibilityVisibleBang();
    expect((book as any).isAuthorVisibilityVisible()).toBeTruthy();
    await (book as any).hardBang();
    expect((book as any).isHard()).toBeTruthy();
  });

  it("update by setter", async () => {
    await book.updateBang({ status: "written" });
    expect((book as any).isWritten()).toBeTruthy();
    await book.updateBang({ cover: "hard" });
    expect((book as any).isHard()).toBeTruthy();
  });

  it("enum methods are overwritable", async () => {
    expect(await (book as any).publishedBang()).toBe("do publish work...");
    expect((book as any).isPublished()).toBeTruthy();
  });

  it("direct assignment", () => {
    (book as any).status = "written";
    expect((book as any).isWritten()).toBeTruthy();
    (book as any).cover = "hard";
    expect((book as any).isHard()).toBeTruthy();
  });

  it("assign string value", () => {
    (book as any).status = "written";
    expect((book as any).isWritten()).toBeTruthy();
    (book as any).cover = "hard";
    expect((book as any).isHard()).toBeTruthy();
  });

  it("enum changed attributes", () => {
    const oldStatus = (book as any).status;
    const oldLanguage = (book as any).language;
    (book as any).status = "proposed";
    (book as any).language = "spanish";
    expect(book.changedAttributes["status"]).toBe(oldStatus);
    expect(book.changedAttributes["language"]).toBe(oldLanguage);
  });

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
    expect(book.attributeChanged("status")).toBeTruthy();
    expect(book.attributeChanged("language")).toBeTruthy();
  });

  it("enum attribute changed to", () => {
    (book as any).status = "proposed";
    (book as any).language = "french";
    expect(book.attributeChanged("status", { to: "proposed" })).toBeTruthy();
    expect(book.attributeChanged("language", { to: "french" })).toBeTruthy();
  });

  it("enum attribute changed from", () => {
    const oldStatus = (book as any).status;
    const oldLanguage = (book as any).language;
    (book as any).status = "proposed";
    (book as any).language = "french";
    expect(book.attributeChanged("status", { from: oldStatus })).toBeTruthy();
    expect(book.attributeChanged("language", { from: oldLanguage })).toBeTruthy();
  });

  it("enum attribute changed from old status to new status", () => {
    const oldStatus = (book as any).status;
    const oldLanguage = (book as any).language;
    (book as any).status = "proposed";
    (book as any).language = "french";
    expect(book.attributeChanged("status", { from: oldStatus, to: "proposed" })).toBeTruthy();
    expect(book.attributeChanged("language", { from: oldLanguage, to: "french" })).toBeTruthy();
  });

  it("enum didn't change", () => {
    const oldStatus = (book as any).status;
    (book as any).status = oldStatus;
    expect(book.attributeChanged("status")).toBeFalsy();
  });

  it("persist changes that are dirty", () => {
    (book as any).status = "proposed";
    expect(book.attributeChanged("status")).toBeTruthy();
    (book as any).status = "written";
    expect(book.attributeChanged("status")).toBeTruthy();
  });

  it("reverted changes that are not dirty", () => {
    const oldStatus = (book as any).status;
    (book as any).status = "proposed";
    expect(book.attributeChanged("status")).toBeTruthy();
    (book as any).status = oldStatus;
    expect(book.attributeChanged("status")).toBeFalsy();
  });

  it("reverted changes are not dirty going from nil to value and back", async () => {
    const created = await Book.createBang({ nullable_status: null });
    (created as any).nullable_status = "married";
    expect(created.attributeChanged("nullable_status")).toBeTruthy();
    (created as any).nullable_status = null;
    expect(created.attributeChanged("nullable_status")).toBeFalsy();
  });

  it("assign non existing value raises an error", async () => {
    const e = await assertRaises([ArgumentError], {}, () => {
      (book as any).status = "unknown";
    });
    expect(e.message).toEqual("'unknown' is not a valid status");
  });

  it("validation with 'validate: true' option", async () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.enum("status", ["proposed", "written"], { validate: true });
      }
    }

    let validBook = new K({ status: "proposed" } as any);
    expect(await (validBook as any).isValid()).toBeTruthy();

    validBook = new K({ status: "written" } as any);
    expect(await (validBook as any).isValid()).toBeTruthy();

    let invalidBook = new K({ status: null } as any);
    expect(await (invalidBook as any).isValid()).toBeFalsy();

    invalidBook = new K({ status: "unknown" } as any);
    expect(await (invalidBook as any).isValid()).toBeFalsy();
  });

  it("validation with 'validate: hash' option", async () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.enum("status", ["proposed", "written"], { validate: { allowNil: true } });
      }
    }

    let validBook = new K({ status: "proposed" } as any);
    expect(await (validBook as any).isValid()).toBeTruthy();

    validBook = new K({ status: "written" } as any);
    expect(await (validBook as any).isValid()).toBeTruthy();

    validBook = new K({ status: null } as any);
    expect(await (validBook as any).isValid()).toBeTruthy();

    const invalidBook = new K({ status: "unknown" } as any);
    expect(await (invalidBook as any).isValid()).toBeFalsy();
  });

  it("NULL values from database should be casted to nil", async () => {
    await Book.where({ id: book.id }).updateAll("status = NULL");
    await book.reload();
    expect((book as any).status).toBeNull();
  });

  it("deserialize nil value to enum which defines nil value to hash", () => {
    expect((books("ddd") as any).last_read).toBe("forgotten");
  });

  it("assign nil value", () => {
    (book as any).status = null;
    expect((book as any).status).toBeNull();
  });

  it("assign nil value to enum which defines nil value to hash", () => {
    (book as any).last_read = null;
    expect((book as any).last_read).toBe("forgotten");
  });

  it("assign empty string value", () => {
    (book as any).status = "";
    expect((book as any).status).toBeNull();
  });

  it("assign false value to a field defined as not boolean", () => {
    (book as any).status = false;
    expect((book as any).status).toBeNull();
  });

  it("assign false value to a field defined as boolean", () => {
    (book as any).boolean_status = false;
    expect((book as any).boolean_status).toBe("disabled");
  });

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
    expect((Book as any).written().build().isWritten()).toBeTruthy();
    expect((Book as any).read().build().isRead()).toBeTruthy();
    expect((Book as any).inSpanish().build().isInSpanish()).toBeTruthy();
    expect(
      (Book as any).illustratorVisibilityInvisible().build().isIllustratorVisibilityInvisible(),
    ).toBeTruthy();
  });

  it("creating new objects with enum scopes", async () => {
    expect((await (Book as any).written().create()).isWritten()).toBeTruthy();
    expect((await (Book as any).read().create()).isRead()).toBeTruthy();
    expect((await (Book as any).inSpanish().create()).isInSpanish()).toBeTruthy();
    expect(
      (
        await (Book as any).illustratorVisibilityInvisible().create()
      ).isIllustratorVisibilityInvisible(),
    ).toBeTruthy();
  });

  it("attribute_before_type_cast", () => {
    expect((book as any).statusBeforeTypeCast).toBe(2);
    expect((book as any).status).toBe("published");

    (book as any).status = "published";

    expect((book as any).statusBeforeTypeCast).toBe("published");
    expect((book as any).status).toBe("published");
  });
  it("attribute_for_database", () => {
    expect((book as any).statusForDatabase).toBe(2);
    expect((book as any).status).toBe("published");

    (book as any).status = "published";

    expect((book as any).statusForDatabase).toBe(2);
    expect((book as any).status).toBe("published");
  });
  it("attributes_for_database", () => {
    expect((book as any).attributesForDatabase().status).toBe(2);

    (book as any).status = "published";

    expect((book as any).attributesForDatabase().status).toBe(2);
  });

  it("invalid definition values raise an ArgumentError", async () => {
    const defineStatusEnum = (values: unknown) => {
      class K extends Base {
        static _tableName = "books";
      }
      (K as any).enum("status", values);
    };

    let e = await assertRaises([ArgumentError], {}, () => defineStatusEnum(undefined));
    expect(e.message).toMatch(/must not be empty\.$/);

    e = await assertRaises([ArgumentError], {}, () => defineStatusEnum({}));
    expect(e.message).toMatch(/must not be empty\.$/);

    e = await assertRaises([ArgumentError], {}, () => defineStatusEnum([]));
    expect(e.message).toMatch(/must not be empty\.$/);

    e = await assertRaises([ArgumentError], {}, () =>
      defineStatusEnum([{ proposed: 1, written: 2, published: 3 }]),
    );
    expect(e.message).toMatch(
      /^Enum values \[\{"proposed"=>1, "written"=>2, "published"=>3\}\] must only contain symbols or strings\.$/,
    );

    e = await assertRaises([ArgumentError], {}, () => defineStatusEnum({ "": 1, active: 2 }));
    expect(e.message).toMatch(/must not contain a blank name\.$/);

    e = await assertRaises([ArgumentError], {}, () => defineStatusEnum(["active", ""]));
    expect(e.message).toMatch(/must not contain a blank name\.$/);

    e = await assertRaises([ArgumentError], {}, () => defineStatusEnum(new (class {})()));
    expect(e.message).toMatch(/must be either a non-empty hash or an array\.$/);
  });

  it("reserved enum names", async () => {
    class Klass extends Base {
      static _tableName = "books";
      static {
        this.enum("status", ["proposed", "written", "published"]);
      }
    }

    const conflicts = ["column", "logger", "attributes"];
    for (const [i, name] of conflicts.entries()) {
      const e = await assertRaises([ArgumentError], {}, () =>
        (Klass as any).enum(name, [`value_${i}`]),
      );
      expect(e.message).toMatch(
        new RegExp(`You tried to define an enum named "${name}" on the model`),
      );
    }
  });
  it("reserved enum values", async () => {
    class Klass extends Base {
      static _tableName = "books";
      static {
        this.enum("status", ["proposed", "written", "published"]);
      }
    }

    const conflicts = ["new", "valid", "save", "proposed", "id"];
    for (const [i, value] of conflicts.entries()) {
      const e = await assertRaises([ArgumentError], {}, () =>
        (Klass as any).enum(`status_${i}`, [value]),
      );
      expect(e.message).toMatch(/You tried to define an enum named .* on the model/);
    }
  });
  it("reserved enum values for relation", async () => {
    const relationMethodSamples = ["records", "scoping", "scope_for_create"];
    for (const value of relationMethodSamples) {
      const e = await assertRaises([ArgumentError], {}, () => {
        class Klass extends Base {
          static _tableName = "books";
        }
        (Klass as any).enum("category", ["other", value]);
      });
      expect(e.message).toMatch(/You tried to define an enum named .* on the model/);
    }
  });
  it("can use id as a value with a prefix or suffix", () => {
    expect(() => {
      class Klass extends Base {
        static _tableName = "books";
        static {
          this.enum("status_1", ["id"], { prefix: true });
          this.enum("status_2", ["id"], { suffix: true });
        }
      }
      void Klass;
    }).not.toThrow();
  });
  it("overriding enum method should not raise", () => {
    expect(() => {
      class Klass extends Base {
        static _tableName = "books";
        publishedBang() {
          return "do publish work...";
        }
        static {
          this.enum("status", ["proposed", "written", "published"]);
        }
        writtenBang() {
          return "do written work...";
        }
      }
      new Klass();
    }).not.toThrow();
  });

  it("validate uniqueness", async () => {
    class Klass extends Base {
      static _tableName = "books";
      static {
        this.enum("status", ["proposed", "written"]);
        this.validatesUniquenessOf("status");
      }
    }
    registerModel(Klass);
    await (Klass as any).deleteAll();
    await Klass.createBang({ status: "proposed" });
    const book = new Klass({ status: "written" }) as any;
    expect(await book.isValid()).toBeTruthy();
    book.status = "proposed";
    expect(await book.isValid()).toBeFalsy();
  });

  it("validate inclusion of value in array", async () => {
    class Klass extends Base {
      static _tableName = "books";
      static {
        this.enum("status", ["proposed", "written"]);
        this.validatesInclusionOf("status", { in: ["written"] });
      }
    }
    const invalidBook = new Klass({ status: "proposed" }) as any;
    expect(await invalidBook.isValid()).toBeFalsy();
    const validBook = new Klass({ status: "written" }) as any;
    expect(await validBook.isValid()).toBeTruthy();
  });

  it("enums are distinct per class", async () => {
    class Klass1 extends Base {
      static _tableName = "books";
      static {
        this.enum("status", ["proposed", "written"]);
      }
    }
    class Klass2 extends Base {
      static _tableName = "books";
      static {
        this.enum("status", ["drafted", "uploaded"]);
      }
    }

    const book1 = await (Klass1 as any).proposed().createBang();
    book1.status = "written";
    expect(book1.statusChange).toEqual(["proposed", "written"]);

    const book2 = await (Klass2 as any).drafted().createBang();
    book2.status = "uploaded";
    expect(book2.statusChange).toEqual(["drafted", "uploaded"]);
  });

  it("enums are inheritable", async () => {
    class Subklass1 extends Book {}
    class Subklass2 extends Book {
      static {
        this.enum("status", ["drafted", "uploaded"]);
      }
    }

    const book1 = await (Subklass1 as any).proposed().createBang();
    book1.status = "written";
    expect(book1.statusChange).toEqual(["proposed", "written"]);

    const book2 = await (Subklass2 as any).drafted().createBang();
    book2.status = "uploaded";
    expect(book2.statusChange).toEqual(["drafted", "uploaded"]);
  });

  it("attempting to modify enum raises error", async () => {
    let e = await assertRaises([TypeError], {}, () => {
      (Book as any).statuses["bad_enum"] = 40;
    });
    expect(e.message).toMatch(/Cannot add property bad_enum, object is not extensible/);

    e = await assertRaises([TypeError], {}, () => {
      delete (Book as any).statuses["published"];
    });
    expect(e.message).toMatch(/Cannot delete property 'published'/);
  });

  it("declare multiple enums with prefix: true", () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.attribute("status", "integer");
        this.attribute("last_read", "integer");
        this.enum("status", ["value_1"], { prefix: true });
        this.enum("last_read", ["value_1"], { prefix: true });
      }
    }
    const instance = new K();
    assertRespondTo(instance, "isStatusValue1");
    assertRespondTo(instance, "isLastReadValue1");
  });

  it("declare multiple enums with suffix: true", () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.attribute("status", "integer");
        this.attribute("last_read", "integer");
        this.enum("status", ["value_1"], { suffix: true });
        this.enum("last_read", ["value_1"], { suffix: true });
      }
    }
    const instance = new K();
    assertRespondTo(instance, "isValue1Status");
    assertRespondTo(instance, "isValue1LastRead");
  });

  it("enum with alias_attribute", async () => {
    class Klass extends Base {
      static _tableName = "books";
      static {
        this.aliasAttribute("aliased_status", "status");
        this.enum("aliased_status", ["proposed", "written", "published"]);
      }
    }
    registerModel(Klass);

    let record: any = await (Klass as any).proposed().create();
    expect(record.isProposed()).toBeTruthy();
    expect(record.aliased_status).toBe("proposed");

    record = await (Klass as any).find(record.id);
    expect(record.isProposed()).toBeTruthy();
    expect(record.aliased_status).toBe("proposed");
  });

  it("enum declared before alias_attribute raises on first use", async () => {
    class Klass extends Base {
      static _tableName = "books";
      static {
        this.enum("aliased_status", ["proposed", "written", "published"]);
        this.aliasAttribute("aliased_status", "status");
      }
    }
    registerModel(Klass);

    await expect((Klass as any).create({ status: "written" })).rejects.toThrow(
      /Undeclared attribute type for enum 'aliased_status' in Klass/,
    );
    expect(() => (Klass as any).typeForAttribute("aliased_status")).toThrow(
      /Undeclared attribute type for enum 'aliased_status' in Klass/,
    );
    expect(() => new (Klass as any)().isProposed()).toThrow(
      /Undeclared attribute type for enum 'aliased_status' in Klass/,
    );
  });

  it("column-backed enum whose name is later aliased does not raise", () => {
    class Klass extends Base {
      static _tableName = "books";
      static {
        this.enum("nullable_status", ["single", "married"]);
        this.aliasAttribute("nullable_status", "status");
      }
    }
    registerModel(Klass);

    expect(() => (Klass as any).typeForAttribute("nullable_status")).not.toThrow();
    expect(() => new (Klass as any)().isSingle()).not.toThrow();
  });

  it("enum on abstract parent resolves against concrete subclass columns", () => {
    class AbstractParent extends Base {
      static {
        this._abstractClass = true;
        this.enum("typeless_genre", ["adventure", "comic"]);
      }
    }
    class Concrete extends AbstractParent {
      static _tableName = "books";
    }
    registerModel(Concrete);

    expect(() => (Concrete as any).typeForAttribute("typeless_genre")).toThrow(
      /Undeclared attribute type for enum 'typeless_genre' in AbstractParent/,
    );
  });

  it("enum on abstract parent raises through subclass materialization", () => {
    class AbstractParent extends Base {
      static {
        this._abstractClass = true;
        this.enum("typeless_genre", ["adventure", "comic"]);
      }
    }
    class Concrete extends AbstractParent {
      static _tableName = "books";
    }
    registerModel(Concrete);

    expect(() => (Concrete as any)._defaultAttributes()).toThrow(
      /Undeclared attribute type for enum 'typeless_genre' in AbstractParent/,
    );
    expect(() => new (Concrete as any)({})).toThrow(
      /Undeclared attribute type for enum 'typeless_genre' in AbstractParent/,
    );
  });

  it("query state by predicate with prefix", () => {
    expect((book as any).isAuthorVisibilityVisible()).toBeTruthy();
    expect((book as any).isAuthorVisibilityInvisible()).toBeFalsy();
    expect((book as any).isIllustratorVisibilityVisible()).toBeTruthy();
    expect((book as any).isIllustratorVisibilityInvisible()).toBeFalsy();
  });

  it("query state by predicate with custom prefix", () => {
    expect((book as any).isInEnglish()).toBeTruthy();
    expect((book as any).isInSpanish()).toBeFalsy();
    expect((book as any).isInFrench()).toBeFalsy();
  });

  it("query state by predicate with custom suffix", () => {
    expect((book as any).isMediumToRead()).toBeTruthy();
    expect((book as any).isEasyToRead()).toBeFalsy();
    expect((book as any).isHardToRead()).toBeFalsy();
  });

  it("enum methods with custom suffix defined", () => {
    assertRespondTo(Book, "easyToRead");
    assertRespondTo(Book, "mediumToRead");
    assertRespondTo(Book, "hardToRead");

    assertRespondTo(book, "isEasyToRead");
    assertRespondTo(book, "isMediumToRead");
    assertRespondTo(book, "isHardToRead");

    assertRespondTo(book, "easyToReadBang");
    assertRespondTo(book, "mediumToReadBang");
    assertRespondTo(book, "hardToReadBang");
  });

  it("update enum attributes with custom suffix", async () => {
    await (book as any).mediumToReadBang();
    expect((book as any).isEasyToRead()).toBeFalsy();
    expect((book as any).isMediumToRead()).toBeTruthy();
    expect((book as any).isHardToRead()).toBeFalsy();

    await (book as any).easyToReadBang();
    expect((book as any).isEasyToRead()).toBeTruthy();
    expect((book as any).isMediumToRead()).toBeFalsy();
    expect((book as any).isHardToRead()).toBeFalsy();

    await (book as any).hardToReadBang();
    expect((book as any).isEasyToRead()).toBeFalsy();
    expect((book as any).isMediumToRead()).toBeFalsy();
    expect((book as any).isHardToRead()).toBeTruthy();
  });

  it("uses default status when no status is provided in fixtures", () => {
    const tlg = books("tlg");
    expect((tlg as any).isProposed()).toBeTruthy();
    expect((tlg as any).isInEnglish()).toBeTruthy();
  });

  it("uses default value from database on initialization", () => {
    expect((new Book() as any).isProposed()).toBeTruthy();
  });

  it("uses default value from database on initialization when using custom mapping", () => {
    expect((new Book() as any).isHard()).toBeTruthy();
  });

  it("data type of Enum type", () => {
    expect(Book.typeForAttribute("status")!.type()).toBe("integer");
  });

  it("enum on custom attribute with default", () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.attribute("status", "integer", { default: 2 });
        this.enum("status", ["proposed", "written", "published"]);
      }
    }
    expect((new K() as any).status).toBe("published");
  });

  it("overloaded default by :default", () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.enum("status", ["proposed", "written", "published"], {
          default: "published",
        });
      }
    }
    expect((new K() as any).status).toBe("published");
  });

  it(":_default is invalid in the new API", async () => {
    const error = await assertRaises([ArgumentError], {}, () => {
      class Klass extends Base {
        static _tableName = "books";
        static {
          this.enum("status", ["proposed", "written", "published"], {
            _default: "published",
          } as any);
        }
      }
      void Klass;
    });
    expect(error.message).toMatch(/invalid option\(s\): :_default/);
  });

  it(":_prefix is invalid in the new API", async () => {
    const error = await assertRaises([ArgumentError], {}, () => {
      class Klass extends Base {
        static _tableName = "books";
        static {
          this.enum("status", ["proposed", "written", "published"], { _prefix: true } as any);
        }
      }
      void Klass;
    });
    expect(error.message).toMatch(/invalid option\(s\): :_prefix/);
  });

  it(":_suffix is invalid in the new API", async () => {
    const error = await assertRaises([ArgumentError], {}, () => {
      class Klass extends Base {
        static _tableName = "books";
        static {
          this.enum("status", ["proposed", "written", "published"], { _suffix: true } as any);
        }
      }
      void Klass;
    });
    expect(error.message).toMatch(/invalid option\(s\): :_suffix/);
  });

  it(":_scopes is invalid in the new API", async () => {
    const error = await assertRaises([ArgumentError], {}, () => {
      class Klass extends Base {
        static _tableName = "books";
        static {
          this.enum("status", ["proposed", "written", "published"], { _scopes: false } as any);
        }
      }
      void Klass;
    });
    expect(error.message).toMatch(/invalid option\(s\): :_scopes/);
  });

  it(":_instance_methods is invalid in the new API", async () => {
    const error = await assertRaises([ArgumentError], {}, () => {
      class Klass extends Base {
        static _tableName = "books";
        static {
          this.enum("status", ["proposed", "written", "published"], {
            _instance_methods: false,
          } as any);
        }
      }
      void Klass;
    });
    expect(error.message).toMatch(/invalid option\(s\): :_instance_methods/);
  });

  it("scopes can be disabled by :scopes", () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.attribute("status", "integer");
        this.enum("status", ["proposed", "written"], { scopes: false });
      }
    }
    expect(() => (K as any).proposed()).toThrow(TypeError);
  });

  it("default methods can be disabled by :instance_methods", () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.attribute("status", "integer");
        this.enum("status", ["proposed", "written"], { instanceMethods: false });
      }
    }
    const instance = new K();
    expect(() => (instance as any).isProposed()).toThrow(TypeError);
    expect(() => (instance as any).proposedBang()).toThrow(TypeError);
  });

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
    assertRespondTo(instance, "isStatusProposed");
    assertRespondTo(instance, "isBeingUnread");
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
    assertRespondTo(instance, "isHardCover");
    assertRespondTo(instance, "isEasyToRead");
  });

  it("enum labels as keyword arguments", () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.enum("status", { active: 0, archived: 1 });
      }
    }
    const book = new K();
    expect((book as any).isActive()).toBeTruthy();
    expect((book as any).isArchived()).toBeFalsy();
  });

  it("option names can be used as label", () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.enum("status", { default: 0, scopes: 1, prefix: 2, suffix: 3 });
      }
    }
    const book = new K();
    expect((book as any).isDefault()).toBeTruthy();
    expect((book as any).isScopes()).toBeFalsy();
    expect((book as any).isPrefix()).toBeFalsy();
    expect((book as any).isSuffix()).toBeFalsy();
  });

  it("scopes are named like methods", () => {
    class K extends Base {
      static _tableName = "cats";
      static {
        this.attribute("breed", "string");
        this.enum("breed", { "American Bobtail": 0, "Balinese-Javanese": 1 });
      }
    }
    assertRespondTo(K, "americanBobtail");
    assertRespondTo(K, "balineseJavanese");
  });

  it("capital characters for enum names", () => {
    class Klass extends Base {
      static _tableName = "computers";
      static {
        this.enum("extendedWarranty", ["extendedSilver", "extendedGold"]);
      }
    }
    const computer = (Klass as any).extendedSilver().build();
    expect(computer.isExtendedSilver()).toBeTruthy();
    expect(computer.isExtendedGold()).toBeFalsy();
  });

  it("unicode characters for enum names", () => {
    class Klass extends Base {
      static _tableName = "books";
      static {
        this.enum("language", ["🇺🇸", "🇪🇸", "🇫🇷"]);
      }
    }
    const book = (Klass as any)["🇺🇸"]().build();
    expect(book["is🇺🇸"]()).toBeTruthy();
    expect(book["is🇪🇸"]()).toBeFalsy();
  });

  it("mangling collision for enum names", () => {
    class Klass extends Base {
      static _tableName = "computers";
      static {
        this.enum("timezone", ["Etc/GMT+1", "Etc/GMT-1"]);
      }
    }
    const computer = (Klass as any)["etc::Gmt+1"]().build();
    expect(computer["isEtc/GMT+1"]()).toBeTruthy();
    expect(computer["isEtc/GMT-1"]()).toBeFalsy();
  });

  it("deserialize enum value to original hash key", async () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.attribute("status", "integer");
        this.enum("status", { proposed: 0, written: 1 });
      }
    }
    registerModel(K);
    const b = await K.create({ status: 0 });
    expect((b as any).status).toBe("proposed");
    expect((b as any).isProposed()).toBeTruthy();
    expect((b as any).isWritten()).toBeFalsy();
  });
  it("serializable? with large number label", async () => {
    class Klass extends Base {
      static _tableName = "books";
      static {
        this.enum("status", ["9223372036854775808", "-9223372036854775809"]);
      }
    }
    const type = (Klass as any).typeForAttribute("status")!;

    expect(type.isSerializable("9223372036854775808")).toBeTruthy();
    expect(type.isSerializable("-9223372036854775809")).toBeTruthy();

    expect(type.isSerializable(9223372036854775808n)).toBeFalsy();
    expect(type.isSerializable(-9223372036854775809n)).toBeFalsy();

    const book1 = await Klass.createBang({ status: "9223372036854775808" });
    const book2 = await Klass.createBang({ status: "-9223372036854775809" });

    expect((book1 as any).statusForDatabase).toBe(0);
    expect((book2 as any).statusForDatabase).toBe(1);

    expect((await Klass.where({ status: "9223372036854775808" }).last())?.id).toBe(book1.id);
    expect((await Klass.where({ status: "-9223372036854775809" }).last())?.id).toBe(book2.id);
  });

  it("enum logs a warning if auto-generated negative scopes would clash with other enum names", () => {
    const oldLogger = Base.logger;
    const logger = new MockLogger();

    Base.logger = logger;

    const expectedMessage1 =
      "Enum element 'not_sent' in Book uses the prefix 'not_'." +
      " This has caused a conflict with auto generated negative scopes." +
      " Avoid using enum elements starting with 'not' where the positive form is also an element.";

    try {
      class Klass extends Base {
        static get name() {
          return "Book";
        }
        static {
          this.attribute("status", "integer");
          this.enum("status", ["sent", "not_sent"]);
        }
      }
      void Klass;

      expect(logger.logged("warn")).toContain(expectedMessage1);
    } finally {
      Base.logger = oldLogger;
    }
  });

  it("enum logs a warning if auto-generated negative scopes would clash with other enum names regardless of order", () => {
    const oldLogger = Base.logger;
    const logger = new MockLogger();

    Base.logger = logger;

    const expectedMessage1 =
      "Enum element 'not_sent' in Book uses the prefix 'not_'." +
      " This has caused a conflict with auto generated negative scopes." +
      " Avoid using enum elements starting with 'not' where the positive form is also an element.";

    try {
      class Klass extends Base {
        static get name() {
          return "Book";
        }
        static {
          this.attribute("status", "integer");
          this.enum("status", ["not_sent", "sent"]);
        }
      }
      void Klass;

      expect(logger.logged("warn")).toContain(expectedMessage1);
    } finally {
      Base.logger = oldLogger;
    }
  });

  it("enum doesn't log a warning if no clashes detected", () => {
    const oldLogger = Base.logger;
    const logger = new MockLogger();

    Base.logger = logger;

    try {
      class Klass extends Base {
        static get name() {
          return "Book";
        }
        static {
          this.attribute("status", "integer");
          this.enum("status", ["not_sent"]);
        }
      }
      void Klass;

      assertEmpty(logger.logged("warn"));
    } finally {
      Base.logger = oldLogger;
    }
  });

  it("enum doesn't log a warning if opting out of scopes", () => {
    const oldLogger = Base.logger;
    const logger = new MockLogger();

    Base.logger = logger;

    try {
      class Klass extends Base {
        static get name() {
          return "Book";
        }
        static {
          this.attribute("status", "integer");
          this.enum("status", ["not_sent", "sent"], { scopes: false });
        }
      }
      void Klass;

      assertEmpty(logger.logged("warn"));
    } finally {
      Base.logger = oldLogger;
    }
  });

  it("raises for attributes with undeclared type", async () => {
    class Klass extends Book {
      static {
        this.enum("typeless_genre", ["adventure", "comic"]);
      }
    }

    const error = await assertRaises([RuntimeError], {}, () =>
      (Klass as any).typeForAttribute("typeless_genre"),
    );
    expect(error.message).toMatch("Undeclared attribute type for enum 'typeless_genre' in Klass");
  });
  it("supports attributes declared with a explicit type", () => {
    class Klass extends Book {
      static {
        this.attribute("my_genre", "integer");
        this.enum("my_genre", ["adventure", "comic"]);
      }
    }

    expect((Klass as any).typeForAttribute("my_genre").type()).toBe("integer");
  });
});
