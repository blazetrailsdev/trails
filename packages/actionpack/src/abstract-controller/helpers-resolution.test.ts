import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  allHelpersFromPath,
  defaultHelperModule,
  helper,
  helperModulesFromPaths,
  modulesForHelpers,
  type HelperMethodsModule,
  type HelpersClassMethods,
} from "./helpers.js";

const FooHelper: HelperMethodsModule = { foo: () => "FOO" };
const BarHelper: HelperMethodsModule = { bar: () => "BAR" };
const NamespacedHelper: HelperMethodsModule = { ns: () => "NS" };

const registry: Record<string, HelperMethodsModule> = {
  FooHelper,
  BarHelper,
  "Foo::BarHelper": NamespacedHelper,
};

const resolve = (name: string): HelperMethodsModule | undefined => registry[name];

describe("modulesForHelpers", () => {
  it("passes through already-resolved modules unchanged", () => {
    expect(modulesForHelpers([FooHelper], { resolve })).toEqual([FooHelper]);
  });

  it("resolves a string prefix (snake_case)", () => {
    expect(modulesForHelpers(["foo"], { resolve })).toEqual([FooHelper]);
  });

  it("resolves a string prefix (already camel-cased) without re-camelizing", () => {
    expect(modulesForHelpers(["Foo"], { resolve })).toEqual([FooHelper]);
  });

  it("resolves a symbol prefix", () => {
    expect(modulesForHelpers([Symbol("foo")], { resolve })).toEqual([FooHelper]);
  });

  it("translates `foo/bar` → `Foo::BarHelper`", () => {
    expect(modulesForHelpers(["foo/bar"], { resolve })).toEqual([NamespacedHelper]);
  });

  it("flattens nested arrays (Rails `args.flatten`)", () => {
    expect(modulesForHelpers(["foo", ["bar"]], { resolve })).toEqual([FooHelper, BarHelper]);
  });

  it("raises a NameError-shaped Error on an unknown name", () => {
    expect(() => modulesForHelpers(["missing"], { resolve })).toThrow(
      /uninitialized constant MissingHelper/,
    );
  });

  it("raises TypeError for non-string/symbol/module entries", () => {
    expect(() => modulesForHelpers([42 as unknown as string], { resolve })).toThrow(
      /must be a String, Symbol, or Module/,
    );
  });

  it("raises TypeError when an object has non-function values (not module-shaped)", () => {
    expect(() =>
      modulesForHelpers([{ x: 1 } as unknown as HelperMethodsModule], { resolve }),
    ).toThrow(/must be a String, Symbol, or Module/);
  });
});

describe("allHelpersFromPath", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "helpers-pr-b-"));
    mkdirSync(join(root, "nested"), { recursive: true });
    writeFileSync(join(root, "application_helper.ts"), "export const x = 1;");
    writeFileSync(join(root, "users_helper.ts"), "export const x = 1;");
    writeFileSync(join(root, "legacy_helper.rb"), "module LegacyHelper; end");
    writeFileSync(join(root, "nested", "admin_helper.ts"), "export const x = 1;");
    // not a helper file — should be ignored
    writeFileSync(join(root, "controller.ts"), "export const x = 1;");
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("returns sorted, de-duplicated names without the _helper suffix or extension", async () => {
    const names = await allHelpersFromPath(root);
    expect(names).toEqual(["application", "legacy", "nested/admin", "users"]);
  });

  it("accepts an array of paths and de-duplicates across them", async () => {
    expect(await allHelpersFromPath([root, root])).toEqual([
      "application",
      "legacy",
      "nested/admin",
      "users",
    ]);
  });

  it("sorts within each path, then concatenates across paths (Rails ordering)", async () => {
    const r1 = mkdtempSync(join(tmpdir(), "helpers-order-1-"));
    const r2 = mkdtempSync(join(tmpdir(), "helpers-order-2-"));
    writeFileSync(join(r1, "zebra_helper.ts"), "");
    writeFileSync(join(r1, "alpha_helper.ts"), "");
    writeFileSync(join(r2, "yak_helper.ts"), "");
    writeFileSync(join(r2, "bear_helper.ts"), "");
    try {
      expect(await allHelpersFromPath([r1, r2])).toEqual(["alpha", "zebra", "bear", "yak"]);
    } finally {
      rmSync(r1, { recursive: true, force: true });
      rmSync(r2, { recursive: true, force: true });
    }
  });
});

describe("helperModulesFromPaths", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "helpers-pr-b-modules-"));
    writeFileSync(join(root, "foo_helper.ts"), "export const x = 1;");
    writeFileSync(join(root, "bar_helper.ts"), "export const x = 1;");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("globs + resolves in one shot", async () => {
    const mods = await helperModulesFromPaths(root, { resolve });
    // sorted: bar, foo
    expect(mods).toEqual([BarHelper, FooHelper]);
  });
});

describe("defaultHelperModule", () => {
  it("strips the Controller suffix and includes the matching helper", () => {
    const cls: HelpersClassMethods = { name: "FooController" };
    defaultHelperModule(cls, { resolve });
    expect(cls._helpers!.foo.call({})).toBe("FOO");
  });

  it("swallows the NameError when the helper does not exist", () => {
    const cls: HelpersClassMethods = { name: "MissingController" };
    expect(() => defaultHelperModule(cls, { resolve })).not.toThrow();
    expect(cls._helpers).toBeUndefined();
  });

  it("re-raises unrelated resolver errors", () => {
    const throwing = () => {
      throw new Error("connection lost");
    };
    expect(() => defaultHelperModule({ name: "FooController" }, { resolve: throwing })).toThrow(
      /connection lost/,
    );
  });

  it("is a no-op on an anonymous class (no name)", () => {
    const cls: HelpersClassMethods = {};
    defaultHelperModule(cls, { resolve });
    expect(cls._helpers).toBeUndefined();
  });

  it("still tries to resolve when the class name lacks a Controller suffix (Rails delete_suffix is a no-op then)", () => {
    // Rails: `helper_prefix = name.delete_suffix("Controller")` returns
    // "Plain" unchanged, then `helper("Plain")` is called. PlainHelper
    // doesn't exist → NameError → swallowed.
    const cls: HelpersClassMethods = { name: "Plain" };
    defaultHelperModule(cls, { resolve });
    expect(cls._helpers).toBeUndefined();
  });

  it("only swallows the NameError matching this specific helper name", () => {
    const cls: HelpersClassMethods = { name: "FooController" };
    const surprising = (name: string): HelperMethodsModule | undefined => {
      if (name === "FooHelper") {
        // simulate: FooHelper file exists but references some other missing const
        throw new Error("uninitialized constant SomeOtherThing");
      }
      return undefined;
    };
    expect(() => defaultHelperModule(cls, { resolve: surprising })).toThrow(/SomeOtherThing/);
  });

  it("composes with helper(): subsequent helper(cls, X) layers on top", () => {
    const cls: HelpersClassMethods = { name: "FooController" };
    defaultHelperModule(cls, { resolve });
    helper(cls, BarHelper);
    expect(cls._helpers!.foo.call({})).toBe("FOO");
    expect(cls._helpers!.bar.call({})).toBe("BAR");
  });
});
