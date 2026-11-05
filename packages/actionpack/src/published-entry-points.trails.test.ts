import { getFs, getPath } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";

const FORBIDDEN_PACKAGES = new Set(["vite", "vitest"]);
const SPECIFIER =
  /^\s*(?:import|export)\b(?!\s+type\b)[^;]*?from\s+"([^"]+)"|^\s*import\s+"([^"]+)"|(?<!typeof\s+)\bimport\(\s*"([^"]+)"\s*\)/gm;

const FORBIDDEN_CONSTANT = /\bconst\s+\w+\s*=\s*"(vite|vitest)"/g;

const packageRoot = getPath().resolve(import.meta.dirname, "..");

async function entryPoints(): Promise<string[]> {
  const pkg = JSON.parse(
    await getFs().readFile(getPath().join(packageRoot, "package.json"), "utf8"),
  ) as { exports: Record<string, string | { default: string }> };
  return Object.values(pkg.exports)
    .map((target) => (typeof target === "string" ? target : target.default))
    .filter((target) => target.startsWith("./dist/"))
    .map((target) =>
      getPath().join(packageRoot, target.replace(/^\.\/dist\//, "src/").replace(/\.js$/, ".ts")),
    );
}

async function bareSpecifiersFrom(entries: string[]): Promise<Set<string>> {
  const files = new Set<string>();
  const bare = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const source = await getFs().readFile(file, "utf8");
    for (const [, from, sideEffect, dynamic] of source.matchAll(SPECIFIER)) {
      const specifier = from ?? sideEffect ?? dynamic;
      if (specifier.startsWith(".")) {
        const relative = getPath().resolve(getPath().dirname(file), specifier);
        queue.push(relative.replace(/\.js$/, ".ts"));
      } else if (!specifier.startsWith("@blazetrails/")) {
        bare.add(specifier.split("/")[0]);
      }
    }
    for (const [, name] of source.matchAll(FORBIDDEN_CONSTANT)) bare.add(name);
  }
  expect(files.size).toBeGreaterThan(50);
  return bare;
}

describe("published entry points", () => {
  it("reach neither vite nor vitest", async () => {
    const entries = await entryPoints();
    expect(entries.map((entry) => getPath().basename(entry))).toEqual([
      "index.ts",
      "system-testing.ts",
    ]);

    const bare = await bareSpecifiersFrom(entries);

    expect([...bare].filter((name) => FORBIDDEN_PACKAGES.has(name))).toEqual([]);
  });
});
