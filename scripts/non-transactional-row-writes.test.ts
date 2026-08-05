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

  it("catches a raw INSERT INTO in a template literal", () => {
    const src = `describe("x", () => {
  it("inserts", async () => {
    await adapter.execute(\`INSERT INTO books (name) VALUES ('Dune')\`);
  });
});
`;
    expect(rowWritesAtItScope(src).map((w) => w.pattern)).toEqual(["INSERT INTO"]);
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
