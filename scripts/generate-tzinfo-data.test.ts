import { describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import { generate } from "./generate-tzinfo-data.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(REPO_ROOT, "vendor", "tzinfo", "v2.0.6", "test", "tzinfo-data2");
const COMMITTED = path.join(REPO_ROOT, "packages", "tzinfo", "test", "tzinfo-data2");

async function tsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)))
    .sort();
}

describe("generate-tzinfo-data", () => {
  it("reproduces the committed tzinfo-data2 fixtures", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "tzinfo-data2-"));
    try {
      await generate(SRC, out, "tzinfo-data2");
      const generated = await tsFiles(out);
      expect(generated).toEqual(await tsFiles(COMMITTED));
      for (const rel of generated) {
        const target = path.join(COMMITTED, rel);
        const options = await prettier.resolveConfig(target);
        const formatted = await prettier.format(await readFile(path.join(out, rel), "utf8"), {
          ...options,
          filepath: target,
        });
        expect(formatted, rel).toBe(await readFile(target, "utf8"));
      }
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 60_000);
});
