import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/activesupport";
import { UnknownAttributeError } from "@blazetrails/activemodel";
import { Book } from "./test-helpers/models/book.js";
import { Company } from "./test-helpers/models/company.js";
import { Lion } from "./test-helpers/models/cat.js";

describe("constructing a model whose table has not reflected", () => {
  it("alias_attribute does not raise, and the alias resolves once the schema lands", async () => {
    expect(Company.columnsHash()["name"]).toBeUndefined();
    expect(() => new Company()).not.toThrow();
    expect(Book.columnsHash()["name"]).toBeUndefined();
    expect(() => new Book()).not.toThrow();

    await Book.loadSchema();

    const book = new Book({ name: "Agile Web Development with Rails" });
    expect((book as unknown as { title: string }).title).toBe("Agile Web Development with Rails");
    (book as unknown as { title: string }).title = "Rails Recipes";
    expect(book.readAttribute("name")).toBe("Rails Recipes");
  });

  it("default_scope attributes do not raise, and apply once the schema lands", async () => {
    expect(Lion.columnsHash()["is_vegetarian"]).toBeUndefined();
    expect(() => new Lion()).not.toThrow();

    await Lion.loadSchema();

    expect(new Lion().is_vegetarian).toBe(false);
  });

  it("alias_attribute still raises for an absent column on a reflected model", async () => {
    class BadAliasBook extends Book {}
    await BadAliasBook.loadSchema();
    new BadAliasBook();
    expect(() => BadAliasBook.aliasAttribute("subtitle", "no_such_column")).toThrow(ArgumentError);
    expect(() => BadAliasBook.aliasAttribute("subtitle", "no_such_column")).toThrow(
      "BadAliasBook model aliases `no_such_column`, but `no_such_column` is not an attribute.",
    );
  });

  it("default_scope still raises for an absent column on a reflected model", async () => {
    class BadScopeLion extends Lion {
      static {
        this.defaultScope(function (this: { where(attrs: Record<string, unknown>): unknown }) {
          return this.where({ no_such_column: 1 });
        } as never);
      }
    }
    await BadScopeLion.loadSchema();
    expect(() => new BadScopeLion()).toThrow(UnknownAttributeError);
    expect(() => new BadScopeLion()).toThrow(
      "unknown attribute 'no_such_column' for BadScopeLion.",
    );
  });
});
