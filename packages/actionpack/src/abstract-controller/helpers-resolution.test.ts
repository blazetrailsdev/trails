import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ArgumentError,
  extend,
  include,
  Module,
  registerConstant,
  unregisterConstant,
} from "@blazetrails/ruby-compat";

import { Helpers, Resolution, type HelperMethodsModule, type HelpersClass } from "./helpers.js";

const { modulesForHelpers, allHelpersFromPath } = Resolution;

const FooHelper = new Module().include({ foo: () => "FOO" });
const BarHelper = new Module().include({ bar: () => "BAR" });
const NamespacedHelper = new Module().include({ ns: () => "NS" });

type Probe = Record<string, () => unknown>;

const registry: Record<string, HelperMethodsModule> = {
  FooHelper,
  BarHelper,
  "Foo::BarHelper": NamespacedHelper,
};

beforeAll(() => {
  for (const [name, mod] of Object.entries(registry)) registerConstant(name, mod);
});
afterAll(() => {
  for (const [name, mod] of Object.entries(registry)) unregisterConstant(name, mod);
});

function controller(name: string): HelpersClass {
  const klass = { [name]: class {} }[name];
  include(klass, Helpers);
  return klass as unknown as HelpersClass;
}

describe("modulesForHelpers", () => {
  it("passes through already-resolved modules unchanged", () => {
    expect(modulesForHelpers([FooHelper])).toEqual([FooHelper]);
  });

  it("resolves a string prefix (snake_case)", () => {
    expect(modulesForHelpers(["foo"])).toEqual([FooHelper]);
  });

  it("resolves a string prefix (already camel-cased) without re-camelizing", () => {
    expect(modulesForHelpers(["Foo"])).toEqual([FooHelper]);
  });

  it("resolves a symbol prefix", () => {
    expect(modulesForHelpers([":foo"])).toEqual([FooHelper]);
  });

  it("translates `foo/bar` → `Foo::BarHelper`", () => {
    expect(modulesForHelpers(["foo/bar"])).toEqual([NamespacedHelper]);
  });

  it("flattens nested arrays (Rails `args.flatten`)", () => {
    expect(modulesForHelpers(["foo", ["bar"]])).toEqual([FooHelper, BarHelper]);
  });

  it("raises a NameError-shaped Error on an unknown name", () => {
    expect(() => modulesForHelpers(["missing"])).toThrow(/uninitialized constant MissingHelper/);
  });

  it("raises TypeError for non-string/symbol/module entries", () => {
    expect(() => modulesForHelpers([42 as unknown as string])).toThrow(
      /must be a String, Symbol, or Module/,
    );
  });

  it("raises ArgumentError for a Hash, which is not a Module", () => {
    const hash = { foo: () => "FOO" } as unknown as HelperMethodsModule;
    expect(() => modulesForHelpers([hash])).toThrow(ArgumentError);
    expect(() => modulesForHelpers([{} as HelperMethodsModule])).toThrow(
      "helper must be a String, Symbol, or Module",
    );
  });
});

describe("modulesForHelpers (when Module)", () => {
  it("passes a class module through", () => {
    class ClassHelper {
      shout(): string {
        return "SHOUT";
      }
    }
    const mod = ClassHelper as unknown as HelperMethodsModule;
    expect(modulesForHelpers([mod])).toEqual([mod]);
  });

  it("passes a helpers module derived from another through", () => {
    const derived = Object.create(FooHelper) as HelperMethodsModule;
    expect(modulesForHelpers([derived])).toEqual([derived]);
  });

  it("raises ArgumentError for an object that is not a module", () => {
    class NotAModule {}
    for (const value of [new NotAModule(), new Map(), 42]) {
      expect(() => modulesForHelpers([value as unknown as string])).toThrow(ArgumentError);
    }
  });
});

describe("allHelpersFromPath", () => {
  let root: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "helpers-pr-b-"));
    mkdirSync(join(root, "nested"), { recursive: true });
    writeFileSync(join(root, "application_helper.ts"), "export const x = 1;");
    writeFileSync(join(root, "users_helper.ts"), "export const x = 1;");
    writeFileSync(join(root, "legacy_helper.rb"), "module LegacyHelper; end");
    writeFileSync(join(root, "nested", "admin_helper.ts"), "export const x = 1;");
    writeFileSync(join(root, "controller.ts"), "export const x = 1;");
    await allHelpersFromPath(root);
  }, 15_000);

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

  it("finds the kebab-case spelling a trails app writes", async () => {
    const r = mkdtempSync(join(tmpdir(), "helpers-kebab-"));
    mkdirSync(join(r, "nested"), { recursive: true });
    writeFileSync(join(r, "application-helper.ts"), "export const x = 1;");
    writeFileSync(join(r, "markdown-helper.js"), "export const x = 1;");
    writeFileSync(join(r, "just-me-helper.ts"), "export const x = 1;");
    writeFileSync(join(r, "nested", "admin-helper.ts"), "export const x = 1;");
    writeFileSync(join(r, "application-controller.ts"), "export const x = 1;");
    try {
      expect(await allHelpersFromPath(r)).toEqual([
        "application",
        "just_me",
        "markdown",
        "nested/admin",
      ]);
    } finally {
      rmSync(r, { recursive: true, force: true });
    }
  }, 15_000);

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
    const mods = await Resolution.helperModulesFromPaths(root);
    expect(mods).toEqual([BarHelper, FooHelper]);
  });
});

describe("defaultHelperModuleBang", () => {
  it("strips the Controller suffix and includes the matching helper", () => {
    const cls = controller("FooController");
    cls.defaultHelperModuleBang();
    expect((extend({}, cls._helpers!) as Probe).foo()).toBe("FOO");
  });

  it("swallows the NameError when the helper does not exist", () => {
    const cls = controller("MissingController");
    expect(() => cls.defaultHelperModuleBang()).not.toThrow();
    expect(cls._helpers!.instanceMethods()).toEqual([]);
  });

  it("still tries to resolve when the class name lacks a Controller suffix (Rails delete_suffix is a no-op then)", () => {
    const cls = controller("Plain");
    cls.defaultHelperModuleBang();
    expect(cls._helpers!.instanceMethods()).toEqual([]);
  });

  it("composes with helper(): subsequent helper(cls, X) layers on top", () => {
    const cls = controller("FooController");
    cls.defaultHelperModuleBang();
    cls.helper(BarHelper);
    expect((extend({}, cls._helpers!) as Probe).foo()).toBe("FOO");
    expect((extend({}, cls._helpers!) as Probe).bar()).toBe("BAR");
  });
});
