import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/**
 * `@blazetrails/ruby-compat` exports `"./*"`, so every built module is an
 * entry point. A load cycle whose participant reads another's binding at load
 * time (`object.js` → `variable.js` → `include.js` reading `classpaths`)
 * throws a TDZ `ReferenceError` only when the cycle is entered at the wrong
 * module, and vitest enters through the barrel and masks it. So each module is
 * imported first, alone, by a plain `node` process.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(REPO_ROOT, "packages/ruby-compat/dist");

describe("ruby-compat entry modules", () => {
  it("imports every built module as the entry module", async () => {
    const files = (await readdir(DIST)).filter((f) => f.endsWith(".js"));
    expect(files.length).toBeGreaterThan(0);
    const failures: string[] = [];
    for (const f of files) {
      await promisify(execFile)(
        process.execPath,
        ["--input-type=module", "-e", `await import(${JSON.stringify(`./${f}`)})`],
        { cwd: DIST },
      ).catch((e: { stderr: string }) => {
        failures.push(`${f}: ${e.stderr.split("\n").find((l) => /Error/.test(l))}`);
      });
    }
    expect(failures).toEqual([]);
  }, 300_000);
});
