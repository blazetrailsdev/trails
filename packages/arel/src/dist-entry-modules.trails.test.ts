import { describe, it, expect } from "vitest";
import { readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

async function distModules(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await distModules(full)));
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

function loadAsEntryModule(module: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "node",
      ["--input-type=module", "-e", `await import(${JSON.stringify(module)});`],
      (error) =>
        resolve(error ? `${module}: ${error.message.split("\n")[1] ?? error.message}` : null),
    );
  });
}

/**
 * Every built module must load when it is the ESM *entry* module — the check
 * CLAUDE.md's "Call-time constant resolution" section mandates, because a
 * vitest run enters the package's funnel module first and masks a cycle. Two
 * modules failed it before this file existed: `nodes/index.js` and
 * `visitors/postgresql.js` both threw `Cannot access 'TableAlias' before
 * initialization`, because a visitor's `static {}` block read `Nodes.*` at
 * module-eval time while `nodes/index.js` was still evaluating.
 *
 * One `node` subprocess per module is load-bearing twice over: vitest's module
 * runner has its own cycle semantics, and within a single process only the
 * first import is an entry module — every later one reuses the graph the first
 * one built, which is exactly what hides the failure.
 */
describe("arel dist modules", () => {
  it("each load as an ESM entry module", async () => {
    const modules = (await distModules(distDir)).filter((f) => !f.endsWith(".test.js"));
    expect(modules.length).toBeGreaterThan(50);

    const failures: string[] = [];
    const queue = [...modules];
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
          const failure = await loadAsEntryModule(next);
          if (failure) failures.push(failure);
        }
      }),
    );

    expect(failures).toEqual([]);
  }, 180_000);
});
