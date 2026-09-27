import { describe, it, expect } from "vitest";
import { EnumType } from "./enum.js";
import { Book } from "./test-helpers/models/book.js";
import { Company } from "./test-helpers/models/company.js";

describe("enum on a model whose table has not reflected", () => {
  it("reads its type without raising, and resolves the column once the schema lands", async () => {
    expect(Company.columnsHash()["status"]).toBeUndefined();
    expect(() => Company.typeForAttribute("status")).not.toThrow();

    await Company.loadSchema();

    const type = Company.typeForAttribute("status");
    expect(type).toBeInstanceOf(EnumType);
    expect((type as EnumType).subtype.type()).toBe("integer");
  });

  it("constructs without raising", () => {
    expect(Book.columnsHash()["status"]).toBeUndefined();
    expect(() => new Book()).not.toThrow();
  });
});
