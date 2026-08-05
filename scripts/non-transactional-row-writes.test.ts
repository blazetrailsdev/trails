import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  diffRatchet,
  findOffenders,
  hasTransactionalWiring,
  isOffender,
  loadRatchet,
  RATCHET_PATH,
  reachesSharedConnection,
  rowWritesAtItScope,
  TEST_ROOT,
} from "./non-transactional-row-writes.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * `encryption/encryptable-record.test.ts` as it stood before #5719 gave it the
 * Rails shape: no transactional wrap, and two cases writing the same `books`
 * row. The second one's `findBy({ name: "dune" })` read the first one's leftover
 * on all three lanes. This is the regression test for the lint itself.
 */
const PRE_5719_ENCRYPTABLE_RECORD = `
describe("ActiveRecord::Encryption::EncryptableRecordTest", () => {
  beforeEach(() => {
    configureEncryption();
  });

  it("by default, it's case sensitive", async () => {
    const Book = makeEncryptedBook(await freshAdapter());
    await Book.create({ name: "Dune" });
    expect(await Book.findBy({ name: "Dune" })).not.toBeNull();
    expect(await Book.findBy({ name: "dune" })).toBeNull();
  });

  it("when using downcase: true it ignores case since everything will be downcase", async () => {
    const Book = makeEncryptedBookWithDowncaseName(await freshAdapter());
    await Book.create({ name: "Dune" });
    expect(await Book.findBy({ name: "dune" })).not.toBeNull();
  });
});
`;

/** The same file after #5719. */
const POST_5719_ENCRYPTABLE_RECORD = PRE_5719_ENCRYPTABLE_RECORD.replace(
  "  beforeEach(() => {",
  "  withTransactionalFixtures(() => txnAdapter);\n\n  beforeEach(() => {",
);

describe("non-transactional row writes", () => {
  it("flags encryptable-record.test.ts at its pre-#5719 state", () => {
    expect(isOffender(PRE_5719_ENCRYPTABLE_RECORD)).toBe(true);
    expect(rowWritesAtItScope(PRE_5719_ENCRYPTABLE_RECORD).map((w) => w.pattern)).toEqual([
      ".create(",
      ".create(",
    ]);
  });

  it("clears the same file once it rides withTransactionalFixtures", () => {
    expect(hasTransactionalWiring(POST_5719_ENCRYPTABLE_RECORD)).toBe(true);
    expect(isOffender(POST_5719_ENCRYPTABLE_RECORD)).toBe(false);
  });

  it("clears a file wired by fixtures() or useTransactionalTests()", () => {
    for (const call of ["fixtures({ books: Book });", "useTransactionalTests(() => adapter);"]) {
      const src = `describe("x", () => {\n  ${call}\n  it("writes", async () => {\n    await Book.create({ name: "Dune" });\n  });\n});\n`;
      expect(isOffender(src)).toBe(false);
    }
  });

  it("ignores writes outside it() scope", () => {
    const src = `describe("x", () => {
  beforeEach(async () => {
    await Book.create({ name: "Dune" });
  });

  it("reads", async () => {
    expect(await Book.count()).toBe(1);
  });
});
`;
    expect(rowWritesAtItScope(src)).toEqual([]);
    expect(isOffender(src)).toBe(false);
  });

  it("ignores a write that is commented out or quoted", () => {
    const src = `describe("x", () => {
  it("builds sql", () => {
    // await Book.create({ name: "Dune" });
    expect(sql).toBe("INSERT INTO books (name) VALUES ('Dune')");
  });
});
`;
    expect(rowWritesAtItScope(src)).toEqual([]);
  });

  it("catches a write in a brace-less arrow body", () => {
    const src = `describe("x", () => {
  const adapter = Base.connection;

  it("writes", async () => Book.create({ name: "Dune" }));
});
`;
    expect(rowWritesAtItScope(src).map((w) => w.pattern)).toEqual([".create("]);
    expect(isOffender(src)).toBe(true);
  });

  it("does not mistake a brace before the arrow for the test body", () => {
    const src = `describe("x", () => {
  it("reads", async ({ adapter }) => {
    expect(await Book.count()).toBe(0);
  });

  beforeEach(async () => {
    await Book.create({ name: "Dune" });
  });
});
`;
    expect(rowWritesAtItScope(src)).toEqual([]);
  });

  it("catches a raw INSERT INTO in a template literal", () => {
    const src = `describe("x", () => {
  it("inserts", async () => {
    await adapter.execute(\`INSERT INTO books (name) VALUES ('Dune')\`);
  });
});
`;
    expect(rowWritesAtItScope(src).map((w) => w.pattern)).toEqual(["INSERT INTO"]);
  });

  it("catches a write in an it.each table body", () => {
    const src = `describe("x", () => {
  const adapter = Base.connection;

  it.each([{ name: "Dune" }, { name: "Emma" }])("writes %s", async (row) => {
    await Book.create({ name: row.name });
  });
});
`;
    expect(rowWritesAtItScope(src).map((w) => w.pattern)).toEqual([".create("]);
    expect(isOffender(src)).toBe(true);
  });

  it("does not attribute a write inside the it.each table itself", () => {
    const src = `describe("x", () => {
  const rows = [{ name: "Dune" }];
  it.each(rows)("reads %s", async (row) => {
    expect(await Book.count()).toBe(0);
  });

  beforeEach(async () => {
    await Book.create({ name: "Dune" });
  });
});
`;
    expect(rowWritesAtItScope(src)).toEqual([]);
  });

  it("catches a write in a test.each body split across lines", () => {
    const src = `describe("x", () => {
  test.each([1, 2])(
    "writes %i",
    async (n) => await Book.create({ name: String(n) }),
  );
});
`;
    expect(rowWritesAtItScope(src).map((w) => w.pattern)).toEqual([".create("]);
  });

  it("clears a file whose writes never reach the shared connection", () => {
    const src = `describe("x", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  it("inserts", async () => {
    await adapter.execute(\`INSERT INTO books (name) VALUES ('Dune')\`);
  });
});
`;
    expect(rowWritesAtItScope(src).map((w) => w.pattern)).toEqual(["INSERT INTO"]);
    expect(reachesSharedConnection(src)).toBe(false);
    expect(isOffender(src)).toBe(false);
  });

  it("clears a file wired by setupAdapterSuite", () => {
    const src = `describe("x", () => {
  const suite = setupAdapterSuite({ factory: () => new BetterSQLite3Adapter(":memory:") });

  it("inserts", async () => {
    await Base.connection.execute(\`INSERT INTO widgets (id) VALUES (1)\`);
  });
});
`;
    expect(hasTransactionalWiring(src)).toBe(true);
    expect(isOffender(src)).toBe(false);
  });

  it("catches a write in an it.each tagged-template table body", () => {
    const src = [
      'describe("x", () => {',
      "  const adapter = Base.connection;",
      "",
      "  it.each`",
      "    name      | count",
      '    ${"Dune"} | ${1}',
      '  `("writes $name", async ({ name }) => {',
      "    await Book.create({ name });",
      "  });",
      "});",
      "",
    ].join("\n");
    expect(rowWritesAtItScope(src).map((w) => w.pattern)).toEqual([".create("]);
    expect(isOffender(src)).toBe(true);
  });

  it("does not shift paren depth for parens inside a template literal", () => {
    const src = [
      'describe("x", () => {',
      "  it.each`",
      "    name",
      "    ${String(1)} )))",
      '  `("reads $name", async () => {',
      "    expect(await Book.count()).toBe(0);",
      "  });",
      "",
      '  it("writes", async () => {',
      '    await Book.create({ name: "Dune" });',
      "  });",
      "});",
      "",
    ].join("\n");
    expect(rowWritesAtItScope(src).map((w) => w.line)).toEqual([10]);
  });

  it("does not grow past the seeded ratchet", async () => {
    const offenders = await findOffenders(path.join(REPO_ROOT, TEST_ROOT));
    const relative = offenders.map((file) => path.relative(REPO_ROOT, file));
    const { added, stale } = diffRatchet(
      relative,
      await loadRatchet(path.join(REPO_ROOT, RATCHET_PATH)),
    );
    expect(added).toEqual([]);
    expect(stale).toEqual([]);
  });
});
