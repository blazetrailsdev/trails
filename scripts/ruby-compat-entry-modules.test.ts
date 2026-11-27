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
    const files = (await readdir(DIST, { recursive: true })).filter((f) => f.endsWith(".js"));
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

  it("serves the readers of include.js's load-time mixins only from include.js", async () => {
    const files = (await readdir(DIST, { recursive: true })).filter((f) => f.endsWith(".js"));
    const failures: string[] = [];
    for (const f of files) {
      const script = [
        `const ns = await import(${JSON.stringify(`./${f}`)});`,
        `const readers = ["rbModAncestors", "rbObjIsKindOf", "rbClassInheritedP"];`,
        `const seen = readers.filter((r) => r in ns).map((r) => [r, ns[r]]);`,
        `const inc = await import("./include.js");`,
        `for (const [r, fn] of seen) if (fn !== inc[r]) throw new Error(r + " is not include.js's");`,
      ].join("\n");
      await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script], {
        cwd: DIST,
      }).catch((e: { stderr: string }) => {
        failures.push(`${f}: ${e.stderr.split("\n").find((l) => /Error/.test(l))}`);
      });
    }
    expect(failures).toEqual([]);
  }, 300_000);

  it("seats Init_Rational / Init_Numeric work without include.js", async () => {
    const files = (await readdir(DIST, { recursive: true })).filter((f) => f.endsWith(".js"));
    const failures: string[] = [];
    for (const f of files) {
      const script = [
        `await import(${JSON.stringify(`./${f}`)});`,
        `const { rbFSend } = await import("./object.js");`,
        `const { rbCNumeric } = await import("./numeric-class.js");`,
        `const { Rational } = await import("./rational.js");`,
        `if (Object.getPrototypeOf(Rational) !== rbCNumeric) throw new Error("Rational is not a Numeric");`,
        `if (!(rbFSend(1, "toR") instanceof Rational)) throw new Error("Integer#to_r is unset");`,
      ].join("\n");
      await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script], {
        cwd: DIST,
      }).catch((e: { stderr: string }) => {
        failures.push(`${f}: ${e.stderr.split("\n").find((l) => /Error/.test(l))}`);
      });
    }
    expect(failures).toEqual([]);
  }, 300_000);
});
