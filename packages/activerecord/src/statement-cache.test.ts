// Faithful port of vendor/rails/activerecord/test/cases/statement_cache_test.rb
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "./index.js";
import { StatementCache } from "./statement-cache.js";
import { Book } from "./test-helpers/models/book.js";
import { Liquid } from "./test-helpers/models/liquid.js";
import { Molecule } from "./test-helpers/models/molecule.js";
import { Electron } from "./test-helpers/models/electron.js";
import { NumericData } from "./test-helpers/models/numeric-data.js";
import { ClothingItem } from "./test-helpers/models/clothing-item.js";
import { RecordNotFound } from "./errors.js";
import { setupFixtures } from "./test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

registerModel("Book", Book);
registerModel("Liquid", Liquid);
registerModel("Molecule", Molecule);
registerModel("Electron", Electron);
registerModel("NumericData", NumericData);

setupFixtures();
useHandlerTransactionalFixtures();

beforeAll(async () => {
  await Promise.all([
    Book.loadSchema(),
    Liquid.loadSchema(),
    Molecule.loadSchema(),
    Electron.loadSchema(),
    NumericData.loadSchema(),
  ]);
});

describe("StatementCacheTest", () => {
  it("statement cache", async () => {
    await Book.create({ name: "my book" });
    await Book.create({ name: "my other book" });

    const cache = StatementCache.create(ClothingItem.leaseConnection(), (params) => {
      return Book.where({ name: params.bind() }) as any;
    });

    let b = await cache.execute(["my book"], ClothingItem.leaseConnection());
    expect(b[0].readAttribute("name")).toBe("my book");
    b = await cache.execute(["my other book"], ClothingItem.leaseConnection());
    expect(b[0].readAttribute("name")).toBe("my other book");
  });

  it("statement cache id", async () => {
    const b1 = await Book.create({ name: "my book" });
    const b2 = await Book.create({ name: "my other book" });

    const cache = StatementCache.create(ClothingItem.leaseConnection(), (params) => {
      return Book.where({ id: params.bind() }) as any;
    });

    let b = await cache.execute([b1.id], ClothingItem.leaseConnection());
    expect(b[0].readAttribute("name")).toBe(b1.readAttribute("name"));
    b = await cache.execute([b2.id], ClothingItem.leaseConnection());
    expect(b[0].readAttribute("name")).toBe(b2.readAttribute("name"));
  });

  it("find or create by", async () => {
    await Book.create({ name: "my book" });

    const a = await Book.findOrCreateBy({ name: "my book" });
    const b = await Book.findOrCreateBy({ name: "my other book" });

    expect(a.readAttribute("name")).toBe("my book");
    expect(b.readAttribute("name")).toBe("my other book");
  });

  it("statement cache with simple statement", async () => {
    const cache = StatementCache.create(ClothingItem.leaseConnection(), () => {
      return Book.where({ name: "my book" }).where("author_id > 3") as any;
    });

    await Book.create({ name: "my book", author_id: 4 });

    const books = await cache.execute([], ClothingItem.leaseConnection());
    expect(books[0].readAttribute("name")).toBe("my book");
  });

  it("statement cache with complex statement", async () => {
    const cache = StatementCache.create(ClothingItem.leaseConnection(), () => {
      return Liquid.joins({ molecules: "electrons" }).where({
        "molecules.name": "dioxane",
        "electrons.name": "lepton",
      }) as any;
    });

    const salty = await Liquid.create({ name: "salty" });
    const molecule = await (salty as any).molecules.create({ name: "dioxane" });
    await molecule.electrons.create({ name: "lepton" });

    const liquids = await cache.execute([], ClothingItem.leaseConnection());
    expect(liquids[0].readAttribute("name")).toBe("salty");
  });

  it("statement cache with strictly cast attribute", async () => {
    const row = await NumericData.create({ temperature: 1.5 });
    expect((await NumericData.findBy({ temperature: 1.5 }))!.id).toBe(row.id);
  });

  it("statement cache values differ", async () => {
    const cache = StatementCache.create(ClothingItem.leaseConnection(), () => {
      return Book.where({ name: "my book" }) as any;
    });

    for (let i = 0; i < 3; i++) await Book.create({ name: "my book" });

    const firstBooks = await cache.execute([], ClothingItem.leaseConnection());

    for (let i = 0; i < 3; i++) await Book.create({ name: "my book" });

    const additionalBooks = await cache.execute([], ClothingItem.leaseConnection());
    expect(firstBooks.map((b) => b.id)).not.toEqual(additionalBooks.map((b) => b.id));
  });

  it("unprepared statements dont share a cache with prepared statements", async () => {
    await Book.create({ name: "my book" });
    await Book.create({ name: "my other book" });

    const book = await Book.findBy({ name: "my book" });
    const otherBook = await Book.leaseConnection().unpreparedStatement(() => {
      return Book.findBy({ name: "my other book" });
    });

    expect(book!.id).not.toBe(otherBook!.id);
  });

  it("find by does not use statement cache if table name is changed", async () => {
    const liquid = await Liquid.create({ name: "salty" });

    await Liquid.findBy({ name: liquid.readAttribute("name") }); // warming the statement cache.

    // changing the table name should change the query that is not cached.
    Liquid.tableName = "birds";
    try {
      expect(await Liquid.findBy({ name: liquid.readAttribute("name") })).toBeNull();
    } finally {
      Liquid.tableName = "liquid";
    }
  });

  it("find does not use statement cache if table name is changed", async () => {
    const liquid = await Liquid.create({ name: "salty" });

    await Liquid.find(liquid.id); // warming the statement cache.

    // changing the table name should change the query that is not cached.
    Liquid.tableName = "birds";
    try {
      await expect(Liquid.find(liquid.id)).rejects.toBeInstanceOf(RecordNotFound);
    } finally {
      Liquid.tableName = "liquid";
    }
  });

  it("find association does not use statement cache if table name is changed", async () => {
    const salty = await Liquid.create({ name: "salty" });
    const molecule = await (salty as any).molecules.create({ name: "dioxane" });

    expect((await molecule.association("liquid").loadTarget())!.id).toBe(salty.id);

    Liquid.tableName = "birds";
    try {
      expect(await molecule.association("liquid").forceReloadReader()).toBeNull();
    } finally {
      Liquid.tableName = "liquid";
    }
  });
});
