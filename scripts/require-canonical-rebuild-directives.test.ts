import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../packages/activerecord/src",
);

/**
 * Only-shrink. Each entry drops a canonical table inside a transactional
 * `fixtures([])` wrap on PostgreSQL, where the DDL rolls back with the test;
 * `blazetrails/require-canonical-rebuild` cannot see the transaction. A new
 * directive is a canonical table some file leaves dropped: fix the drop.
 */
const ALLOWED = ["migration/exclusion-constraint.test.ts", "migration/unique-constraint.test.ts"];

describe("require-canonical-rebuild inline disables", () => {
  it("are the two transactional constraint-test teardowns and nothing else", async () => {
    const found: string[] = [];
    for (const entry of await readdir(SRC, { recursive: true })) {
      if (!entry.endsWith(".ts")) continue;
      const source = await readFile(path.join(SRC, entry), "utf8");
      for (const line of source.split("\n")) {
        if (/eslint-disable.*blazetrails\/require-canonical-rebuild/.test(line)) found.push(entry);
      }
    }
    expect(found.sort()).toEqual(ALLOWED);
  });
});
