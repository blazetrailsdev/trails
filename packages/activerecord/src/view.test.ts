import { describe, expect, beforeAll, afterAll } from "vitest";
import { Base } from "./index.js";
import type { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import { fixtures } from "./test-fixtures.js";
import { adapterType } from "./test-adapter.js";
import { describeIfSupports, itIfSupports } from "./support/supports.js";
import { dumpTableSchema } from "./support/schema-dumping-helper.js";

function conn(): AbstractAdapter {
  return Base.connection as unknown as AbstractAdapter;
}

async function createView(name: string, sql: string): Promise<void> {
  await conn().executeMutation(`CREATE VIEW ${conn().quoteTableName(name)} AS ${sql}`);
}
async function dropView(name: string): Promise<void> {
  if (await conn().viewExists(name)) {
    await conn().executeMutation(`DROP VIEW ${conn().quoteTableName(name)}`);
  }
}

describeIfSupports("views", "ViewWithPrimaryKeyTest", () => {
  const { books } = fixtures(["books", "authors"]);

  class Ebook extends Base {
    static override _tableName = "ebooks'";
    static override _primaryKey = "id";
  }

  beforeAll(async () => {
    await dropView("ebooks'");
    await createView("ebooks'", `SELECT id, name, cover, status FROM books WHERE format = 'ebook'`);
    await Ebook.loadSchema();
  });

  afterAll(async () => {
    await dropView("ebooks'");
  });

  itIfSupports("views", "reading", async () => {
    const ebookRecords = await Ebook.all();
    expect(ebookRecords.map((b: any) => b.id)).toEqual([books("rfr").id]);
    expect(ebookRecords.map((b: any) => b.name)).toEqual(["Ruby for Rails"]);
  });

  itIfSupports("views", "views", async () => {
    expect(await conn().views()).toEqual([Ebook._tableName]);
  });

  itIfSupports("views", "view exists", async () => {
    expect(await conn().viewExists(Ebook._tableName)).toBe(true);
  });

  itIfSupports("views", "table exists", async () => {
    expect(await conn().tableExists(Ebook._tableName)).toBe(false);
  });

  itIfSupports("views", "views ara valid data sources", async () => {
    expect(await conn().dataSourceExists(Ebook._tableName)).toBe(true);
  });

  itIfSupports("views", "column definitions", async () => {
    expect(Ebook.columns().map((c: any) => [c.name, c.type])).toEqual([
      ["id", "integer"],
      ["name", "string"],
      ["cover", "string"],
      ["status", "integer"],
    ]);
  });

  itIfSupports("views", "attributes", async () => {
    const ebook = await Ebook.first();
    const ebookAttrs = (ebook as any).attributes;
    expect({ ...ebookAttrs, id: Number(ebookAttrs.id) }).toEqual({
      id: 2,
      name: "Ruby for Rails",
      cover: "hard",
      status: 0,
    });
  });

  itIfSupports("views", "does not assume id column as primary key", async () => {
    class Model extends Base {
      static override _tableName = "ebooks'";
    }
    await Model.loadSchema();
    expect(Model.primaryKey).toBeNull();
  });

  itIfSupports("views", "does not dump view as table", async () => {
    const schema = await dumpTableSchema(conn() as any, "ebooks'");
    expect(schema).not.toMatch(/ctx\.createTable\("ebooks'"/);
  });
});

describeIfSupports("views", "ViewWithoutPrimaryKeyTest", () => {
  const { books } = fixtures(["books", "authors"], {
    useTransactionalTests: false,
  });

  class Paperback extends Base {
    static override _tableName = "paperbacks";
  }

  beforeAll(async () => {
    await dropView("paperbacks");
    await createView("paperbacks", `SELECT name, status FROM books WHERE format = 'paperback'`);
    await Paperback.loadSchema();
  });

  afterAll(async () => {
    await dropView("paperbacks");
  });

  itIfSupports("views", "reading", async () => {
    const records = await Paperback.all();
    expect(records.map((b: any) => b.name)).toEqual([books("awdr").name]);
  });

  itIfSupports("views", "views", async () => {
    expect(await conn().views()).toEqual([Paperback._tableName]);
  });

  itIfSupports("views", "view exists", async () => {
    expect(await conn().viewExists(Paperback._tableName)).toBe(true);
  });

  itIfSupports("views", "table exists", async () => {
    expect(await conn().tableExists(Paperback._tableName)).toBe(false);
  });

  itIfSupports("views", "column definitions", async () => {
    expect(Paperback.columns().map((c: any) => [c.name, c.type])).toEqual([
      ["name", "string"],
      ["status", "integer"],
    ]);
  });

  itIfSupports("views", "attributes", async () => {
    const record = await Paperback.first();
    expect((record as any).attributes).toEqual({
      name: "Agile Web Development with Rails",
      status: 2,
    });
  });

  itIfSupports("views", "does not have a primary key", () => {
    expect(Paperback.primaryKey).toBeNull();
  });

  itIfSupports("views", "does not dump view as table", async () => {
    const schema = await dumpTableSchema(conn() as any, "paperbacks");
    expect(schema).not.toMatch(/ctx\.createTable\("paperbacks"/);
  });
});

describe("UpdateableViewTest", () => {
  const { books } = fixtures(["books", "authors"], {
    useTransactionalTests: false,
  });

  class PrintedBook extends Base {
    static override _tableName = "printed_books";
    static override _primaryKey = "id";
  }

  beforeAll(async () => {
    if (adapterType === "sqlite") return;
    await dropView("printed_books");
    await createView(
      "printed_books",
      `SELECT id, name, status, format FROM books WHERE format = 'paperback'`,
    );
    await PrintedBook.loadSchema();
  });

  afterAll(async () => {
    if (adapterType === "sqlite") return;
    await dropView("printed_books");
  });

  itIfSupports.skipIf(adapterType === "sqlite")("views", "update record", async () => {
    const book = await PrintedBook.find(books("awdr").id);
    (book as any).name = "AWDwR";
    await (book as any).saveBang();
    await (book as any).reload();
    expect((book as any).name).toBe("AWDwR");
  });

  itIfSupports.skipIf(adapterType === "sqlite")("views", "insert record", async () => {
    await PrintedBook.createBang({ name: "Rails in Action", status: 0, format: "paperback" });
    const newBook = await PrintedBook.last();
    expect((newBook as any).name).toBe("Rails in Action");
  });

  itIfSupports.skipIf(adapterType !== "postgres")(
    "insert_returning,views",
    "insert record populates primary key",
    async () => {
      const book = await PrintedBook.createBang({
        name: "Rails in Action",
        status: 0,
        format: "paperback",
      });
      expect((book as any).id).not.toBeNull();
      expect((book as any).id).toBeGreaterThan(0);
    },
  );

  itIfSupports.skipIf(adapterType === "sqlite")(
    "views",
    "update record to fail view conditions",
    async () => {
      const book = await PrintedBook.find(books("awdr").id);
      (book as any).format = "ebook";
      await (book as any).saveBang();
      await expect((book as any).reload()).rejects.toThrow();
    },
  );
});
