import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { Base, registerModel, Range } from "./index.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { Book } from "./test-helpers/models/book.js";
import { fixtures } from "./test-fixtures.js";

describe("EnumTest", () => {
  const { books } = fixtures(["books"]);

  beforeAll(() => {
    registerModel(Book);
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

    expect(type.serialize("proposed")).toBe(0);
    expect(type.serialize("written")).toBe(1);
    expect(type.serialize("published")).toBe(2);

    expect(type.serialize("unknown")).toBeNull();
  });

  it("type.cast", () => {
    const type = Book.typeForAttribute("status")!;
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
  });

  it("find via scope", async () => {
    book = books("awdr");
    expect((await (Book as any).published().first())?.id).toBe(book.id);
    expect((await (Book as any).read().first())?.id).toBe(book.id);
    expect((await (Book as any).inEnglish().first())?.id).toBe(book.id);
    expect((await (Book as any).authorVisibilityVisible().first())?.id).toBe(book.id);
    expect((await (Book as any).illustratorVisibilityVisible().first())?.id).toBe(book.id);
    expect((await (Book as any).mediumToRead().first())?.id).toBe(book.id);
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
    expect(created.isEnabled()).toBe(true);

    const enabled = String((Book as any).boolean_statuses.enabled);
    expect((await Book.where({ boolean_status: enabled }).last())?.id).toBe(created.id);
    expect((await Book.where({ cover: "soft" }).first())?.id).toBe(books("awdr").id);
    expect((await Book.where().not({ cover: "hard" }).first())?.id).toBe(books("awdr").id);
  });

  it("build from scope", () => {
    expect((Book as any).written().build().isWritten()).toBe(true);
    expect((Book as any).written().build().isProposed()).toBe(false);
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
  });

  it("update by setter", async () => {
    await book.updateBang({ status: "written" });
    expect((book as any).isWritten()).toBe(true);
  });

  it("enum methods are overwritable", async () => {
    expect(await (book as any).publishedBang()).toBe("do publish work...");
    expect((book as any).isPublished()).toBe(true);
  });

  it("direct assignment", () => {
    (book as any).status = "written";
    expect((book as any).isWritten()).toBe(true);
  });

  it("assign string value", () => {
    (book as any).status = "written";
    expect((book as any).isWritten()).toBe(true);
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

  it("validation with 'validate: true' option", async () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.enum("status", ["proposed", "written"], { validate: true });
      }
    }

    let validBook = new K({ status: "proposed" } as any);
    expect(await (validBook as any).isValid()).toBe(true);

    validBook = new K({ status: "written" } as any);
    expect(await (validBook as any).isValid()).toBe(true);

    let invalidBook = new K({ status: null } as any);
    expect(await (invalidBook as any).isValid()).toBe(false);

    invalidBook = new K({ status: "unknown" } as any);
    expect(await (invalidBook as any).isValid()).toBe(false);
  });

  it("validation with 'validate: hash' option", async () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.enum("status", ["proposed", "written"], { validate: { allowNil: true } });
      }
    }

    let validBook = new K({ status: "proposed" } as any);
    expect(await (validBook as any).isValid()).toBe(true);

    validBook = new K({ status: "written" } as any);
    expect(await (validBook as any).isValid()).toBe(true);

    validBook = new K({ status: null } as any);
    expect(await (validBook as any).isValid()).toBe(true);

    const invalidBook = new K({ status: "unknown" } as any);
    expect(await (invalidBook as any).isValid()).toBe(false);
  });

  it("NULL values from database should be casted to nil", async () => {
    await Book.where({ id: book.id }).updateAll("status = NULL");
    await book.reload();
    expect((book as any).status).toBeNull();
    expect((book as any).isPublished()).toBe(false);
    expect((book as any).isWritten()).toBe(false);
    expect((book as any).isProposed()).toBe(false);
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

  it("invalid definition values raise an ArgumentError", () => {
    const defineStatusEnum = (values: unknown) => {
      class K extends Base {
        static _tableName = "books";
      }
      (K as any).enum("status", values);
    };
    expect(() => defineStatusEnum(undefined)).toThrow(ArgumentError);
    expect(() => defineStatusEnum({})).toThrow(ArgumentError);
    expect(() => defineStatusEnum([])).toThrow(ArgumentError);
    expect(() => defineStatusEnum([{ proposed: 1, written: 2 }])).toThrow(ArgumentError);
    expect(() => defineStatusEnum({ "": 1, active: 2 })).toThrow(ArgumentError);
    expect(() => defineStatusEnum(["active", ""])).toThrow(ArgumentError);
    expect(() => defineStatusEnum(new (class {})())).toThrow(ArgumentError);
  });

  it("reserved enum names", () => {
    class Klass extends Base {
      static _tableName = "books";
      static {
        this.enum("status", ["proposed", "written", "published"]);
      }
    }

    const conflicts = ["column", "logger", "attributes"];
    conflicts.forEach((name, i) => {
      expect(() => (Klass as any).enum(name, [`value_${i}`])).toThrow(
        new RegExp(`You tried to define an enum named "${name}" on the model`),
      );
    });
  });
  it("reserved enum values", () => {
    class Klass extends Base {
      static _tableName = "books";
      static {
        this.enum("status", ["proposed", "written", "published"]);
      }
    }

    const conflicts = ["new", "valid", "save", "proposed", "id"];
    conflicts.forEach((value, i) => {
      expect(() => (Klass as any).enum(`status_${i}`, [value])).toThrow(
        /You tried to define an enum named .* on the model/,
      );
    });
  });
  it("reserved enum values for relation", () => {
    const relationMethodSamples = ["records", "scoping", "scope_for_create"];
    relationMethodSamples.forEach((value) => {
      expect(() => {
        class Klass extends Base {
          static _tableName = "books";
        }
        (Klass as any).enum("category", ["other", value]);
      }).toThrow(/You tried to define an enum named .* on the model/);
    });
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
    expect(await book.isValid()).toBe(true);
    book.status = "proposed";
    expect(await book.isValid()).toBe(false);
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
    expect(await invalidBook.isValid()).toBe(false);
    const validBook = new Klass({ status: "written" }) as any;
    expect(await validBook.isValid()).toBe(true);
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

  it("attempting to modify enum raises error", () => {
    expect(() => {
      (Book as any).statuses["bad_enum"] = 40;
    }).toThrow(TypeError);

    expect(() => {
      delete (Book as any).statuses["published"];
    }).toThrow(TypeError);
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
    expect(typeof (instance as any).isStatusValue1).toBe("function");
    expect(typeof (instance as any).isLastReadValue1).toBe("function");
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
    expect(typeof (instance as any).isValue1Status).toBe("function");
    expect(typeof (instance as any).isValue1LastRead).toBe("function");
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
    expect(record.isProposed()).toBe(true);
    expect(record.aliased_status).toBe("proposed");

    record = await (Klass as any).find(record.id);
    expect(record.isProposed()).toBe(true);
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

  it("uses default value from database on initialization", () => {
    expect((new Book() as any).isProposed()).toBe(true);
  });

  it("uses default value from database on initialization when using custom mapping", () => {
    expect((new Book() as any).isHard()).toBe(true);
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

  it(":_default is invalid in the new API", () => {
    expect(() => {
      class Klass extends Base {
        static _tableName = "books";
        static {
          this.enum("status", ["proposed", "written", "published"], {
            _default: "published",
          } as any);
        }
      }
      void Klass;
    }).toThrow(/invalid option\(s\): :_default/);
  });

  it(":_prefix is invalid in the new API", () => {
    expect(() => {
      class Klass extends Base {
        static _tableName = "books";
        static {
          this.enum("status", ["proposed", "written", "published"], { _prefix: true } as any);
        }
      }
      void Klass;
    }).toThrow(/invalid option\(s\): :_prefix/);
  });

  it(":_suffix is invalid in the new API", () => {
    expect(() => {
      class Klass extends Base {
        static _tableName = "books";
        static {
          this.enum("status", ["proposed", "written", "published"], { _suffix: true } as any);
        }
      }
      void Klass;
    }).toThrow(/invalid option\(s\): :_suffix/);
  });

  it(":_scopes is invalid in the new API", () => {
    expect(() => {
      class Klass extends Base {
        static _tableName = "books";
        static {
          this.enum("status", ["proposed", "written", "published"], { _scopes: false } as any);
        }
      }
      void Klass;
    }).toThrow(/invalid option\(s\): :_scopes/);
  });

  it(":_instance_methods is invalid in the new API", () => {
    expect(() => {
      class Klass extends Base {
        static _tableName = "books";
        static {
          this.enum("status", ["proposed", "written", "published"], {
            _instance_methods: false,
          } as any);
        }
      }
      void Klass;
    }).toThrow(/invalid option\(s\): :_instance_methods/);
  });

  it("scopes can be disabled by :scopes", () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.attribute("status", "integer");
        this.enum("status", ["proposed", "written"], { scopes: false });
      }
    }
    expect((K as any).proposed).toBeUndefined();
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
    expect((instance as any).isProposed).toBeUndefined();
    expect((instance as any).proposedBang).toBeUndefined();
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

  it("enum labels as keyword arguments", () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.enum("status", { active: 0, archived: 1 });
      }
    }
    const book = new K();
    expect((book as any).isActive()).toBe(true);
    expect((book as any).isArchived()).toBe(false);
  });

  it("option names can be used as label", () => {
    class K extends Base {
      static _tableName = "books";
      static {
        this.enum("status", { default: 0, scopes: 1, prefix: 2, suffix: 3 });
      }
    }
    const book = new K();
    expect((book as any).isDefault()).toBe(true);
    expect((book as any).isScopes()).toBe(false);
    expect((book as any).isPrefix()).toBe(false);
    expect((book as any).isSuffix()).toBe(false);
  });

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

  it("capital characters for enum names", () => {
    class Klass extends Base {
      static _tableName = "computers";
      static {
        this.enum("extendedWarranty", ["extendedSilver", "extendedGold"]);
      }
    }
    const computer = (Klass as any).extendedSilver().build();
    expect(computer.isExtendedSilver()).toBe(true);
    expect(computer.isExtendedGold()).toBe(false);
  });

  it("unicode characters for enum names", () => {
    class Klass extends Base {
      static _tableName = "books";
      static {
        this.enum("language", ["🇺🇸", "🇪🇸", "🇫🇷"]);
      }
    }
    const book = (Klass as any)["🇺🇸"]().build();
    expect(book["is🇺🇸"]()).toBe(true);
    expect(book["is🇪🇸"]()).toBe(false);
  });

  it("mangling collision for enum names", () => {
    class Klass extends Base {
      static _tableName = "computers";
      static {
        this.enum("timezone", ["Etc/GMT+1", "Etc/GMT-1"]);
      }
    }
    const computer = (Klass as any)["etc::GMT+1"]().build();
    expect(computer["isEtc/GMT+1"]()).toBe(true);
    expect(computer["isEtc/GMT-1"]()).toBe(false);
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
    expect((b as any).isProposed()).toBe(true);
    expect((b as any).isWritten()).toBe(false);
  });
  it("serializable? with large number label", async () => {
    class Klass extends Base {
      static _tableName = "books";
      static {
        this.enum("status", ["9223372036854775808", "-9223372036854775809"]);
      }
    }
    const type = (Klass as any).typeForAttribute("status")!;

    expect(type.isSerializable("9223372036854775808")).toBe(true);
    expect(type.isSerializable("-9223372036854775809")).toBe(true);

    expect(type.isSerializable(9223372036854775808n)).toBe(false);
    expect(type.isSerializable(-9223372036854775809n)).toBe(false);

    const book1 = await Klass.createBang({ status: "9223372036854775808" });
    const book2 = await Klass.createBang({ status: "-9223372036854775809" });

    expect((book1 as any).statusForDatabase).toBe(0);
    expect((book2 as any).statusForDatabase).toBe(1);

    expect((await Klass.where({ status: "9223372036854775808" }).last())?.id).toBe(book1.id);
    expect((await Klass.where({ status: "-9223372036854775809" }).last())?.id).toBe(book2.id);
  });

  it("enum logs a warning if auto-generated negative scopes would clash with other enum names", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      class K extends Base {
        static _tableName = "books";
        static {
          this.attribute("status", "integer");
          this.enum("status", { sent: 0, notSent: 1 });
        }
      }
      void K;
      expect(spy).toHaveBeenCalledWith(expect.stringMatching(/negative scope 'notSent'/));
    } finally {
      spy.mockRestore();
    }
  });

  it("enum logs a warning if auto-generated negative scopes would clash with other enum names regardless of order", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      class K extends Base {
        static _tableName = "books";
        static {
          this.attribute("status", "integer");
          this.enum("status", { notSent: 0, sent: 1 });
        }
      }
      void K;
      expect(spy).toHaveBeenCalledWith(expect.stringMatching(/negative scope 'notSent'/));
    } finally {
      spy.mockRestore();
    }
  });

  it("enum doesn't log a warning if no clashes detected", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      class Klass extends Base {
        static _tableName = "books";
        static {
          this.attribute("status", "integer");
          this.enum("status", ["notSent"]);
        }
      }
      void Klass;
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("enum doesn't log a warning if opting out of scopes", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      class K extends Base {
        static _tableName = "books";
        static {
          this.attribute("status", "integer");
          this.enum("status", { sent: 0, notSent: 1 }, { scopes: false });
        }
      }
      void K;
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("raises for attributes with undeclared type", () => {
    class Klass extends Book {
      static {
        this.enum("typeless_genre", ["adventure", "comic"]);
      }
    }

    expect(() => (Klass as any).typeForAttribute("typeless_genre")).toThrow(
      /Undeclared attribute type for enum 'typeless_genre' in/,
    );
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
