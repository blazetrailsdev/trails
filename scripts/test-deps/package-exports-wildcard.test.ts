// Guard: a package whose `exports` end in a `./*` wildcard must resolve a
// subpath spelled with its `.js` extension, the spelling every explicit entry
// uses. `./*` alone binds `*` to `foo.js` and maps it to `dist/foo.js.js` /
// `dist/foo.js.d.ts`; the `./*.js` pattern ahead of it binds the stem. Checked
// against the built `dist/`, not a tsconfig `paths` alias.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-5";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PACKAGES = path.join(ROOT, "packages");

const wildcardPackages = readdirSync(PACKAGES).filter((dir) => {
  const file = path.join(PACKAGES, dir, "package.json");
  if (!existsSync(file)) return false;
  const exports = JSON.parse(readFileSync(file, "utf8")).exports;
  return exports != null && typeof exports === "object" && "./*" in exports;
});

function firstModule(dist: string): string | undefined {
  return readdirSync(dist)
    .filter((f) => f.endsWith(".js") && f !== "index.js" && existsSync(path.join(dist, f)))
    .sort()[0];
}

function resolveTypes(specifier: string): string | undefined {
  return ts.resolveModuleName(
    specifier,
    path.join(ROOT, "index.mts"),
    {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
    },
    ts.sys,
  ).resolvedModule?.resolvedFileName;
}

describe("package exports `./*` wildcard", () => {
  it("resolves @blazetrails/activerecord/connection-adapters/abstract-mysql-adapter.js", () => {
    const specifier = "@blazetrails/activerecord/connection-adapters/abstract-mysql-adapter.js";
    const require = createRequire(path.join(ROOT, "index.js"));
    expect(require.resolve(specifier)).toMatch(
      /dist\/connection-adapters\/abstract-mysql-adapter\.js$/,
    );
    expect(resolveTypes(specifier)).toMatch(/abstract-mysql-adapter\.d\.ts$/);
  });

  it.each(wildcardPackages)("%s resolves a .js subpath through its wildcard", (dir) => {
    const pkg = JSON.parse(readFileSync(path.join(PACKAGES, dir, "package.json"), "utf8"));
    const dist = path.join(PACKAGES, dir, "dist");
    const file = existsSync(dist) ? firstModule(dist) : undefined;
    expect(file, `${dir} has no built dist/`).toBeDefined();
    const specifier = `${pkg.name}/${file}`;
    const require = createRequire(path.join(PACKAGES, dir, "package.json"));
    expect(require.resolve(specifier)).toBe(path.join(dist, file!));
  });
});
