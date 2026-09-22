import { describe, expect, it } from "vitest";
import type { ApiManifest, ClassInfo, MethodInfo } from "../parity/types.js";
import { isStdlibMixinGap, stdlibMixinRows } from "./stdlib-mixin-surface.js";

const method = (name: string): MethodInfo => ({ name, visibility: "public", params: [] });

function entity(name: string, file: string, methods: string[], includes: string[] = []): ClassInfo {
  return {
    name,
    file,
    includes,
    extends: [],
    instanceMethods: methods.map(method),
    classMethods: [],
  };
}

function manifest(classes: Record<string, ClassInfo>): ApiManifest {
  return { packages: { activemodel: { classes, modules: {} } } } as unknown as ApiManifest;
}

describe("stdlibMixinRows", () => {
  const ruby = manifest({
    "ActiveModel::Errors": entity("Errors", "errors.rb", ["each", "add"], ["Enumerable"]),
    "ActiveModel::Version": entity("Version", "version.rb", ["<=>"], ["Comparable"]),
    "ActiveModel::Lazy": entity("Lazy", "lazy.rb", ["size"], ["Enumerable"]),
  });

  it("lists an iterable class that does not mix Enumerable in", () => {
    const ts = manifest({
      Errors: entity("Errors", "errors.ts", ["[Symbol.iterator]", "add"]),
    });
    const [errors] = stdlibMixinRows(ruby, ts).filter((r) => r.mixin === "Enumerable");
    expect(errors).toMatchObject({
      rubyFqn: "ActiveModel::Errors",
      tsFile: "errors.ts",
      tsClass: "Errors",
      answersContract: true,
      mixesIn: false,
    });
    expect(isStdlibMixinGap(errors)).toBe(true);
  });

  it("does not list a class assigning ruby-compat's Comparable operators", () => {
    const ts = manifest({
      Version: entity("Version", "version.ts", ["compareTo", "lessThan", "isBetween"]),
    });
    const [version] = stdlibMixinRows(ruby, ts).filter((r) => r.mixin === "Comparable");
    expect(version).toMatchObject({ answersContract: true, mixesIn: true });
    expect(isStdlibMixinGap(version)).toBe(false);
  });

  it("emits one row per class, and none for an includer without the contract method", () => {
    const rows = stdlibMixinRows(ruby, manifest({}));
    expect(rows.map((r) => r.rubyFqn)).toEqual(["ActiveModel::Errors", "ActiveModel::Version"]);
  });
});
