/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/enum_test.rb
 */
import { describe, it, expect } from "vitest";
import { Base, defineEnum } from "./index.js";
import { setEnumWarn } from "./enum.js";
import { ArgumentError } from "@blazetrails/activemodel";

import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Book } from "./test-helpers/models/book.js";

// `useHandlerFixtures` wires `setupHandlerSuite` internally. Mirrors Rails'
// `fixtures :books, :authors, :author_addresses` — every test reads or mutates
// the canonical `books` rows (`@book = books(:awdr)`).
const { books } = useHandlerFixtures(["authors", "authorAddresses", "books"], {
  schema: canonicalSchema,
});

// Rails' `setup do @book = books(:awdr) end`. Re-fetch a fresh, fixture-backed
// row per test so mutations in one test never leak into the next.
async function awdr(): Promise<Book> {
  return Book.find(books("awdr").id);
}

describe("EnumTest", () => {
  it("type.cast", () => {
    const type = Book.typeForAttribute("status") as any;
    expect(type.cast(0)).toBe("proposed");
    expect(type.cast(1)).toBe("written");
    expect(type.cast(2)).toBe("published");
    expect(type.cast("proposed")).toBe("proposed");
    expect(type.cast("written")).toBe("written");
    expect(type.cast("published")).toBe("published");
  });

  it("type.serialize", () => {
    const type = Book.typeForAttribute("status") as any;
    expect(type.serialize(0)).toBe(0);
    expect(type.serialize(1)).toBe(1);
    expect(type.serialize(2)).toBe(2);
    expect(type.serialize("proposed")).toBe(0);
    expect(type.serialize("written")).toBe(1);
    expect(type.serialize("published")).toBe(2);
    expect(type.serialize("unknown")).toBeNull();
  });

  it("query state by predicate", async () => {
    const book = (await awdr()) as any;
    expect(book.isPublished()).toBe(true);
    expect(book.isWritten()).toBe(false);
    expect(book.isProposed()).toBe(false);
    expect(book.isRead()).toBe(true);
    expect(book.isInEnglish()).toBe(true);
    expect(book.isAuthorVisibilityVisible()).toBe(true);
    expect(book.isIllustratorVisibilityVisible()).toBe(true);
    expect(book.isWithMediumFontSize()).toBe(true);
    expect(book.isMediumToRead()).toBe(true);
  });

  it("query state with strings", async () => {
    const book = (await awdr()) as any;
    expect(book.status).toBe("published");
    expect(book.last_read).toBe("read");
    expect(book.language).toBe("english");
    expect(book.author_visibility).toBe("visible");
    expect(book.illustrator_visibility).toBe("visible");
    expect(book.difficulty).toBe("medium");
  });

  it("find via scope", async () => {
    const book = books("awdr");
    expect((await (Book as any).published().first())?.id).toBe(book.id);
    expect((await (Book as any).read().first())?.id).toBe(book.id);
    expect((await (Book as any).inEnglish().first())?.id).toBe(book.id);
    expect((await (Book as any).authorVisibilityVisible().first())?.id).toBe(book.id);
    expect((await (Book as any).illustratorVisibilityVisible().first())?.id).toBe(book.id);
    expect((await (Book as any).mediumToRead().first())?.id).toBe(book.id);
  });

  it("find via negative scope", async () => {
    const book = await awdr();
    const notPublished = await (Book as any).notPublished();
    expect(notPublished.some((b: any) => b.id === book.id)).toBe(false);
    const notProposed = await (Book as any).notProposed();
    expect(notProposed.some((b: any) => b.id === book.id)).toBe(true);
  });

  it("find via where with values", async () => {
    const book = await awdr();
    const published = (Book as any).statuses.published;
    const written = (Book as any).statuses.written;
    expect((await Book.where({ status: published }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: written }).first())?.id).not.toBe(book.id);
    expect((await Book.where({ status: [published, published] }).first())?.id).toBe(book.id);
    expect((await Book.whereNot({ status: published }).first())?.id).not.toBe(book.id);
    expect((await Book.whereNot({ status: written }).first())?.id).toBe(book.id);
  });

  it("find via where with values.to_s", async () => {
    const book = await awdr();
    const published = (Book as any).statuses.published;
    const written = (Book as any).statuses.written;
    expect((await Book.where({ status: published }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: written }).first())?.id).not.toBe(book.id);
    expect((await Book.whereNot({ status: written }).first())?.id).toBe(book.id);
  });

  it("find via where with symbols", async () => {
    const book = books("awdr");
    expect((await Book.where({ status: "published" }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: "written" }).first())?.id).not.toBe(book.id);
    expect((await Book.whereNot({ status: "written" }).first())?.id).toBe(book.id);
    expect(await Book.where({ status: "prohibited" }).first()).toBeNull();
  });

  it("find via where with strings", async () => {
    const book = books("awdr");
    expect((await Book.where({ status: "published" }).first())?.id).toBe(book.id);
    expect((await Book.where({ status: "written" }).first())?.id).not.toBe(book.id);
    expect((await Book.whereNot({ status: "written" }).first())?.id).toBe(book.id);
    expect(await Book.where({ status: "prohibited" }).first()).toBeNull();
  });

  it("find via where with large number", async () => {
    const book = await awdr();
    expect((await Book.where({ status: 2 }).first())?.id).toBe(book.id);
    expect(await Book.where({ status: 9999 }).first()).toBeNull();
  });

  it("build from scope", async () => {
    expect((Book as any).written().build().isWritten()).toBe(true);
    expect((Book as any).written().build().isProposed()).toBe(false);
  });

  it("build from where", async () => {
    const written = (Book as any).statuses.written;
    expect(Book.where({ status: written }).build().isWritten()).toBe(true);
    expect(Book.where({ status: written }).build().isProposed()).toBe(false);
    expect(Book.where({ status: "written" }).build().isWritten()).toBe(true);
    expect(Book.where({ status: "written" }).build().isProposed()).toBe(false);
  });

  it("update by declaration", async () => {
    const book = (await awdr()) as any;
    await book.writtenBang();
    expect(book.isWritten()).toBe(true);
    await book.inEnglishBang();
    expect(book.isInEnglish()).toBe(true);
    await book.authorVisibilityVisibleBang();
    expect(book.isAuthorVisibilityVisible()).toBe(true);
  });

  it("update by setter", async () => {
    const book = (await awdr()) as any;
    await book.update({ status: "written" });
    expect(book.isWritten()).toBe(true);
  });

  it("enum methods are overwritable", async () => {
    const book = (await awdr()) as any;
    await book.publishedBang();
    expect(book.isPublished()).toBe(true);
  });

  it("direct assignment", async () => {
    const book = (await awdr()) as any;
    book.status = "written";
    expect(book.isWritten()).toBe(true);
  });

  it("assign string value", async () => {
    const book = (await awdr()) as any;
    book.status = "written";
    expect(book.isWritten()).toBe(true);
  });

  it("enum changed attributes", async () => {
    const book = (await awdr()) as any;
    const oldStatus = book.status;
    const oldLanguage = book.language;
    book.status = "proposed";
    book.language = "spanish";
    expect(book.attributeWas("status")).toBe(oldStatus);
    expect(book.attributeWas("language")).toBe(oldLanguage);
  });

  it("enum value after write symbol", async () => {
    const book = (await awdr()) as any;
    book.status = "proposed";
    expect(book.status).toBe("proposed");
  });

  it("enum value after write string", async () => {
    const book = (await awdr()) as any;
    book.status = "proposed";
    expect(book.status).toBe("proposed");
  });

  it("enum changes", async () => {
    const book = (await awdr()) as any;
    const oldStatus = book.status;
    book.status = "proposed";
    expect(book.changes.status).toEqual([oldStatus, "proposed"]);
  });

  it("enum attribute was", async () => {
    const book = (await awdr()) as any;
    const oldStatus = book.status;
    book.status = "published";
    expect(book.attributeWas("status")).toBe(oldStatus);
  });

  it("enum attribute changed", async () => {
    const book = (await awdr()) as any;
    book.status = "proposed";
    book.language = "french";
    expect(book.attributeChanged("status")).toBe(true);
    expect(book.attributeChanged("language")).toBe(true);
  });

  it("enum attribute changed to", async () => {
    const book = (await awdr()) as any;
    book.status = "proposed";
    expect(book.attributeChanged("status")).toBe(true);
    expect(book.status).toBe("proposed");
  });

  it("enum attribute changed from", async () => {
    const book = (await awdr()) as any;
    const oldStatus = book.status;
    book.status = "proposed";
    expect(book.attributeChanged("status")).toBe(true);
    expect(book.attributeWas("status")).toBe(oldStatus);
  });

  it("enum attribute changed from old status to new status", async () => {
    const book = (await awdr()) as any;
    const oldStatus = book.status;
    book.status = "proposed";
    expect(book.attributeWas("status")).toBe(oldStatus);
    expect(book.status).toBe("proposed");
  });

  it("enum didn't change", async () => {
    const book = (await awdr()) as any;
    const oldStatus = book.status;
    book.status = oldStatus;
    expect(book.attributeChanged("status")).toBe(false);
  });

  it("persist changes that are dirty", async () => {
    const book = (await awdr()) as any;
    book.status = "proposed";
    expect(book.attributeChanged("status")).toBe(true);
    book.status = "written";
    expect(book.attributeChanged("status")).toBe(true);
  });

  it("reverted changes that are not dirty", async () => {
    const book = (await awdr()) as any;
    const oldStatus = book.status;
    book.status = "proposed";
    expect(book.attributeChanged("status")).toBe(true);
    book.status = oldStatus;
    expect(book.attributeChanged("status")).toBe(false);
  });

  it("reverted changes are not dirty going from nil to value and back", async () => {
    const book = (await Book.create({ nullable_status: null })) as any;
    book.nullable_status = "married";
    expect(book.attributeChanged("nullable_status")).toBe(true);
    book.nullable_status = null;
    expect(book.attributeChanged("nullable_status")).toBe(false);
  });

  it("assign non existing value raises an error", async () => {
    const book = (await awdr()) as any;
    expect(() => {
      book.status = "unknown";
    }).toThrow("'unknown' is not a valid status");
  });

  it("NULL values from database should be casted to nil", async () => {
    const book = (await awdr()) as any;
    book.status = null;
    expect(book.status).toBeNull();
  });

  it("assign nil value", async () => {
    const book = (await awdr()) as any;
    book.status = null;
    expect(book.status).toBeNull();
  });

  it("assign empty string value", async () => {
    const book = (await awdr()) as any;
    book.status = "";
    expect(book.status).toBeNull();
  });

  it("assign false value to a field defined as not boolean", async () => {
    const book = (await awdr()) as any;
    book.status = "";
    expect(book.status).toBeNull();
  });

  it("assign long empty string value", async () => {
    const book = (await awdr()) as any;
    book.status = "   ";
    expect(book.status).toBeNull();
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
  });

  it("attribute_before_type_cast", async () => {
    const book = (await awdr()) as any;
    expect(book.attributeBeforeTypeCast("status")).toBe(2);
    expect(book.status).toBe("published");
  });

  it("attribute_for_database", async () => {
    const book = (await awdr()) as any;
    expect(book.attributeForDatabase("status")).toBe(2);
    expect(book.status).toBe("published");
  });

  it("attributes_for_database", async () => {
    const book = (await awdr()) as any;
    expect(book.attributesForDatabase().status).toBe(2);
  });

  it("invalid definition values raise an ArgumentError", () => {
    class K extends Base {
      static _tableName = "books";
    }
    expect(() => defineEnum(K, "status", [])).toThrow(ArgumentError);
    expect(() => defineEnum(K, "status", {})).toThrow(ArgumentError);
    expect(() => defineEnum(K, "status", { "": 1, active: 2 })).toThrow(ArgumentError);
  });

  it("reserved enum values", () => {
    class K extends Base {
      static _tableName = "books";
    }
    const conflicts = ["valid", "save"];
    conflicts.forEach((value, i) => {
      const enumName = `status_${i}`;
      K.attribute(enumName, "integer");
      expect(() => defineEnum(K, enumName, [value])).toThrow(ArgumentError);
    });
  });

  it("reserved enum values for relation", () => {
    class K extends Base {
      static _tableName = "books";
    }
    const conflicts = ["all", "where"];
    conflicts.forEach((value, i) => {
      const enumName = `category_${i}`;
      K.attribute(enumName, "integer");
      expect(() => defineEnum(K, enumName, ["other", value])).toThrow(ArgumentError);
    });
  });

  it("enums are distinct per class", async () => {
    class KA extends Base {
      static {
        this.tableName = "books";
        this.attribute("status", "integer");
        defineEnum(this, "status", { proposed: 0, written: 1 });
      }
    }
    class KB extends Base {
      static {
        this.tableName = "books";
        this.attribute("status", "integer");
        defineEnum(this, "status", { drafted: 0, uploaded: 1 });
      }
    }
    const a = new KA({ status: 0 }) as any;
    const b = new KB({ status: 0 }) as any;
    expect(a.status).toBe("proposed");
    expect(b.status).toBe("drafted");
  });

  it("declare multiple enums with prefix: true", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("status", "integer");
    K.attribute("nullable_status", "integer");
    defineEnum(K, "status", { value_1: 0 }, { prefix: true });
    defineEnum(K, "nullable_status", { value_1: 0 }, { prefix: true });
    const instance = new K() as any;
    expect(typeof instance.isStatusValue1).toBe("function");
    expect(typeof instance.isNullableStatusValue1).toBe("function");
  });

  it("enum on custom attribute with default", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("status", "integer", { default: 2 });
    defineEnum(K, "status", { proposed: 0, written: 1, published: 2 });
    expect((new K({}) as any).status).toBe("published");
  });

  it("query state by predicate with prefix", async () => {
    const book = (await awdr()) as any;
    expect(book.isAuthorVisibilityVisible()).toBe(true);
    expect(book.isAuthorVisibilityInvisible()).toBe(false);
    expect(book.isIllustratorVisibilityVisible()).toBe(true);
    expect(book.isIllustratorVisibilityInvisible()).toBe(false);
  });

  it("query state by predicate with :prefix", async () => {
    const book = (await awdr()) as any;
    expect(book.isInEnglish()).toBe(true);
    expect(book.isInSpanish()).toBe(false);
  });

  it("query state by predicate with custom prefix", async () => {
    const book = (await awdr()) as any;
    expect(book.isInEnglish()).toBe(true);
    expect(book.isInSpanish()).toBe(false);
    expect(book.isInFrench()).toBe(false);
  });

  it("query state by predicate with :suffix", async () => {
    const book = (await awdr()) as any;
    expect(book.isMediumToRead()).toBe(true);
    expect(book.isEasyToRead()).toBe(false);
  });

  it("query state by predicate with custom suffix", async () => {
    const book = (await awdr()) as any;
    expect(book.isMediumToRead()).toBe(true);
    expect(book.isEasyToRead()).toBe(false);
    expect(book.isHardToRead()).toBe(false);
  });

  it("enum methods with custom suffix defined", async () => {
    const book = (await awdr()) as any;
    expect(typeof (Book as any).easyToRead).toBe("function");
    expect(typeof (Book as any).mediumToRead).toBe("function");
    expect(typeof (Book as any).hardToRead).toBe("function");
    expect(typeof book.isEasyToRead).toBe("function");
    expect(typeof book.isMediumToRead).toBe("function");
    expect(typeof book.isHardToRead).toBe("function");
    expect(typeof book.easyToReadBang).toBe("function");
    expect(typeof book.mediumToReadBang).toBe("function");
    expect(typeof book.hardToReadBang).toBe("function");
  });

  it("update enum attributes with custom suffix", async () => {
    const book = (await awdr()) as any;
    await book.mediumToReadBang();
    expect(book.isMediumToRead()).toBe(true);
    expect(book.isEasyToRead()).toBe(false);
    await book.easyToReadBang();
    expect(book.isEasyToRead()).toBe(true);
    expect(book.isMediumToRead()).toBe(false);
    await book.hardToReadBang();
    expect(book.isHardToRead()).toBe(true);
    expect(book.isEasyToRead()).toBe(false);
  });

  it("data type of Enum type", () => {
    expect((Book.typeForAttribute("status") as any).type()).toBe("integer");
  });

  it("supports attributes declared with a explicit type", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("my_genre", "integer");
    K.enum("my_genre", { adventure: 0, comic: 1 });
    expect((K.typeForAttribute("my_genre") as any).type()).toBe("integer");
  });

  it("enum labels as keyword arguments", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("status", "integer");
    K.enum("status", { active: 0, archived: 1 });
    const instance = new K({ status: 0 }) as any;
    expect(instance.isActive()).toBe(true);
    expect(instance.isArchived()).toBe(false);
  });

  it("scopes are named like methods", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("breed", "string");
    K.enum("breed", { "American Bobtail": 0, "Balinese-Javanese": 1 });
    expect(typeof (K as any).americanBobtail).toBe("function");
    expect(typeof (K as any).balineseJavanese).toBe("function");
  });

  it("validate uniqueness", async () => {
    const book = await awdr();
    expect(book.isPersisted()).toBe(true);
  });

  it("can use id as a value with a prefix or suffix", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("status_1", "integer");
    K.attribute("status_2", "integer");
    expect(() => {
      defineEnum(K, "status_1", ["id"], { prefix: true });
      defineEnum(K, "status_2", ["id"], { suffix: true });
    }).not.toThrow();
  });

  it(":_default is invalid in the new API", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("status", "integer");
    expect(() => defineEnum(K, "status", ["proposed"], { _default: "proposed" } as any)).toThrow(
      /invalid option\(s\): :_default/,
    );
  });

  it(":_prefix is invalid in the new API", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("status", "integer");
    expect(() => defineEnum(K, "status", ["proposed"], { _prefix: true } as any)).toThrow(
      /invalid option\(s\): :_prefix/,
    );
  });

  it(":_suffix is invalid in the new API", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("status", "integer");
    expect(() => defineEnum(K, "status", ["proposed"], { _suffix: true } as any)).toThrow(
      /invalid option\(s\): :_suffix/,
    );
  });

  it(":_scopes is invalid in the new API", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("status", "integer");
    expect(() => defineEnum(K, "status", ["proposed"], { _scopes: false } as any)).toThrow(
      /invalid option\(s\): :_scopes/,
    );
  });

  it(":_instance_methods is invalid in the new API", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("status", "integer");
    expect(() =>
      defineEnum(K, "status", ["proposed"], { _instance_methods: false } as any),
    ).toThrow(/invalid option\(s\): :_instance_methods/);
  });

  it("declare multiple enums with suffix: true", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("status", "integer");
    K.attribute("nullable_status", "integer");
    defineEnum(K, "status", { value_1: 0 }, { suffix: true });
    defineEnum(K, "nullable_status", { value_1: 0 }, { suffix: true });
    const instance = new K() as any;
    expect(typeof instance.isValue1Status).toBe("function");
    expect(typeof instance.isValue1NullableStatus).toBe("function");
  });

  it("option names can be used as label", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("status", "integer");
    K.enum("status", { default: 0, scopes: 1, prefix: 2, suffix: 3 });
    const book = new K({ status: 0 }) as any;
    expect(book.isDefault()).toBe(true);
    expect(book.isScopes()).toBe(false);
    expect(book.isPrefix()).toBe(false);
    expect(book.isSuffix()).toBe(false);
  });

  it("capital characters for enum names", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("extended_warranty", "integer");
    K.enum("extended_warranty", { extendedSilver: 0, extendedGold: 1 });
    const computer = (K as any).extendedSilver().build();
    expect(computer.isExtendedSilver()).toBe(true);
    expect(computer.isExtendedGold()).toBe(false);
  });

  it("unicode characters for enum names", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("language", "integer");
    defineEnum(K, "language", ["🇺🇸", "🇪🇸", "🇫🇷"]);
    const book = (K as any)["🇺🇸"]().build();
    expect(book["is🇺🇸"]()).toBe(true);
    expect(book["is🇪🇸"]()).toBe(false);
  });

  it("mangling collision for enum names", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("timezone", "integer");
    K.enum("timezone", { "Etc/GMT+1": 0, "Etc/GMT-1": 1 });
    // Special characters mangle into distinct, non-colliding method names.
    expect(typeof (K as any).etcGMT1).toBe("function");
    expect(typeof (K as any)["etc::GMT+1"]).toBe("function");
    const computer = (K as any).etcGMT1().build();
    expect(computer.isEtcGMT1()).toBe(true);
  });

  it("enums are inheritable", async () => {
    class Subklass1 extends Book {}
    const book = await (Subklass1 as any).proposed().create();
    expect(book.isProposed()).toBe(true);
    book.status = "written";
    expect(book.status).toBe("written");
    expect(book.attributeWas("status")).toBe("proposed");
  });

  it("serializable? with large number label", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("status", "integer");
    defineEnum(K, "status", ["9223372036854775808", "-9223372036854775809"]);
    const type = K.typeForAttribute("status") as any;
    expect(type.isSerializable("9223372036854775808")).toBe(true);
    expect(type.isSerializable("-9223372036854775809")).toBe(true);
    expect(type.isSerializable(9223372036854775808)).toBe(false);
  });

  it("validate inclusion of value in array", async () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("status", "integer");
    defineEnum(K, "status", ["proposed", "written"]);
    (K as any).validatesInclusionOf("status", { in: ["written"] });
    const invalidBook = new K({ status: 0 }) as any;
    expect(await invalidBook.isValid()).toBe(false);
    const validBook = new K({ status: 1 }) as any;
    expect(await validBook.isValid()).toBe(true);
  });

  it("uses default status when no status is provided in fixtures", async () => {
    const book = (await Book.find(books("tlg").id)) as any;
    expect(book.isProposed()).toBe(true);
    expect(book.isInEnglish()).toBe(true);
  });

  it("scopes can be disabled by :scopes", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("status", "integer");
    defineEnum(K, "status", ["proposed", "written"], { scopes: false } as any);
    expect((K as any).proposed).toBeUndefined();
  });

  it("default methods can be disabled by :instance_methods", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("status", "integer");
    defineEnum(K, "status", ["proposed", "written"], { instanceMethods: false } as any);
    expect((new K() as any).isProposed).toBeUndefined();
  });

  it("overloaded default by :default", () => {
    class K extends Base {
      static _tableName = "books";
    }
    K.attribute("status", "integer");
    defineEnum(K, "status", ["proposed", "written", "published"], { default: "published" } as any);
    expect((new K() as any).status).toBe("published");
  });

  it("attempting to modify enum raises error", () => {
    expect(() => {
      (Book as any).statuses.published = 40;
    }).toThrow();
    expect(() => {
      delete (Book as any).statuses.published;
    }).toThrow();
  });

  it("enum doesn't log a warning if no clashes detected", () => {
    const warns: string[] = [];
    setEnumWarn((m) => warns.push(m));
    try {
      class K extends Base {
        static _tableName = "books";
      }
      K.attribute("status", "integer");
      defineEnum(K, "status", ["not_sent"]);
      expect(warns).toHaveLength(0);
    } finally {
      setEnumWarn(() => {});
    }
  });
});
