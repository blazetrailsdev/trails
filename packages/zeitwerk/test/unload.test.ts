import { autoloadGet } from "../lib/core-ext/kernel.js";
import { Kernel, TopLevel, rbModRemoveConst } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Cref } from "../lib/cref.js";
import { NameError, SetupRequired } from "../lib/error.js";
import { Loader } from "../lib/loader.js";
import { Inceptions } from "../lib/registry/inceptions.js";
import { ExplicitNamespaces } from "../lib/registry/explicit-namespaces.js";
import {
  isRequired,
  newLoader,
  teardown,
  withFiles,
  withLoadPath,
  withSetup,
} from "./support/loader-test.js";

const get = (mod: object, cname: string) => autoloadGet(new Cref(mod, cname)) as Promise<object>;
const defined = (mod: object, cname: string) => new Cref(mod, cname).isDefined();

const USERS: [string, string][] = [
  ["user.ts", "export class User {}"],
  ["admin/root.ts", "export class Root {}"],
];

describe("TestUnload", () => {
  let loader: Loader;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
  });
  afterEach(teardown);

  for (const [name, namespace] of [
    ["Object", Object],
    ["Namespace", class Namespace {}],
  ] as const) {
    it(`unload removes all autoloaded constants (${name})`, async () => {
      await withSetup(loader, USERS, { namespace }, async () => {
        expect(await get(namespace, "User")).toBeTruthy();
        const admin = await get(namespace, "Admin");
        expect(await get(admin, "Root")).toBeTruthy();

        await loader.unload();

        expect(!defined(namespace, "User")).toBeTruthy();
        expect(!defined(namespace, "Admin")).toBeTruthy();
        expect(!defined(admin, "Root")).toBeTruthy();
      });
    });
  }

  it("unload removes autoloaded constants, even if #name is overridden", async () => {
    const files: [string, string][] = [
      ["x.ts", 'export class X { static name() { return "Y"; } }'],
    ];
    await withSetup(loader, files, {}, async () => {
      expect(await get(Object, "X")).toBeTruthy();
      await loader.unload();
      expect(!defined(Object, "X")).toBeTruthy();
    });
  });

  it("unload removes non-executed autoloads", async () => {
    await withSetup(loader, [["x.ts", "export const X = true;"]], {}, async () => {
      expect(defined(Object, "X")).toBeTruthy();
      await loader.unload();
      expect(!defined(Object, "X")).toBeTruthy();
    });
  });

  it("unload clears internal caches", async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    g.$Loader = Loader;
    g.$loader = null;
    const files: [string, string][] = [
      [
        "my_gem.ts",
        `const loader = new globalThis.$Loader();
        globalThis.$loader = loader;
        await loader.pushDir(import.meta.dirname);
        await loader.pushDir("rd1");
        await loader.pushDir("rd2");

        loader.enableReloading();
        await loader.setup();

        export class MyGem {}`,
      ],
      ["rd1/user.ts", "export class User {}"],
      ["rd1/api/v1/users-controller.ts", "export class UsersController {}"],
      ["rd1/admin/root.ts", "export class Root {}"],
      ["rd2/user.ts", "export class User {}"],
    ];
    try {
      await withFiles(files, async () => {
        await withLoadPath(".", async () => {
          await Kernel.require("my_gem");
        });
        const $loader = g.$loader as Loader;

        expect(await get(Object, "User")).toBeTruthy();
        const api = await get(Object, "Api");
        expect(await get(await get(api, "V1"), "UsersController")).toBeTruthy();

        expect(Object.keys($loader.autoloads).length !== 0).toBeTruthy();
        expect($loader.autoloadedDirs.length !== 0).toBeTruthy();
        expect(Object.keys($loader.toUnload).length !== 0).toBeTruthy();
        expect(!$loader.namespaceDirs.isEmpty()).toBeTruthy();
        expect(!$loader.inceptions.isEmpty()).toBeTruthy();

        await $loader.unload();

        expect(Object.keys($loader.autoloads).length === 0).toBeTruthy();
        expect($loader.autoloadedDirs.length === 0).toBeTruthy();
        expect(Object.keys($loader.toUnload).length === 0).toBeTruthy();
        expect($loader.namespaceDirs.isEmpty()).toBeTruthy();
        expect($loader.inceptions.isEmpty()).toBeTruthy();
      });
    } finally {
      delete g.$Loader;
      delete g.$loader;
    }
  });

  it("unload does not assume autoloaded constants are still there", async () => {
    await withSetup(loader, [["x.ts", "export const X = true;"]], {}, async () => {
      expect(await get(Object, "X")).toBeTruthy();
      expect(rbModRemoveConst(Object, "X")).toBeTruthy();
      await loader.unload();
    });
  });

  it("already existing namespaces are not reset", async () => {
    const files: [string, string][] = [
      ["app/models/active_storage/blob.ts", "export class Blob {}"],
    ];
    const ActiveStorage = {};
    (TopLevel as unknown as Record<string, unknown>).ActiveStorage = ActiveStorage;
    await withFiles(files, async () => {
      await loader.pushDir("app/models");
      await loader.setup();

      expect(await get(ActiveStorage, "Blob")).toBeTruthy();
      await loader.unload();
      expect((TopLevel as unknown as Record<string, unknown>).ActiveStorage).toBeTruthy();
    });
  });

  it("unload clears explicit namespaces associated", async () => {
    const files: [string, string][] = [
      ["a/m.ts", "export class M {}"],
      ["a/m/n.ts", "export const N = true;"],
      ["b/x.ts", "export class X {}"],
      ["b/x/y.ts", "export const Y = true;"],
    ];
    await withFiles(files, async () => {
      const la = await newLoader({ dirs: "a" });
      const crefM = new Cref(Object, "M");
      expect(ExplicitNamespaces.isRegistered(crefM) === la).toBeTruthy();

      const lb = await newLoader({ dirs: "b" });
      const crefX = new Cref(Object, "X");
      expect(ExplicitNamespaces.isRegistered(crefX) === lb).toBeTruthy();

      await la.unload();
      expect(ExplicitNamespaces.isRegistered(crefM)).toBeNull();
      expect(ExplicitNamespaces.isRegistered(crefX) === lb).toBeTruthy();
    });
  });

  it("unload clears the set of shadowed files", async () => {
    const files: [string, string][] = [
      ["a/m.ts", "export class M {}"],
      ["b/m.ts", "export class M {}"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir("a");
      await loader.pushDir("b");
      await loader.setup();

      expect(loader.shadowedFiles.size !== 0).toBeTruthy();
      await loader.unload();
      expect(loader.shadowedFiles.size === 0).toBeTruthy();
    });
  });

  it("unload clears associated inceptions", async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    g.$Loader = Loader;
    const files: [string, string][] = [];

    files.push([
      "gem1/my_gem1.ts",
      `const loader = new globalThis.$Loader();
      await loader.pushDir(import.meta.dirname);
      loader.enableReloading();
      await loader.setup();
      globalThis.$loader1 = loader;
      export class MyGem1 {}`,
    ]);

    files.push([
      "gem2/my_gem2.ts",
      `const loader = new globalThis.$Loader();
      await loader.pushDir(import.meta.dirname);
      await loader.setup();
      globalThis.$loader2 = loader;
      export class MyGem2 {}`,
    ]);

    try {
      await withFiles(files, async () => {
        await withLoadPath(".", async () => {
          await Kernel.require("gem1/my_gem1");
          await Kernel.require("gem2/my_gem2");
        });

        expect(await get(Object, "MyGem1")).toBeTruthy();
        expect(await get(Object, "MyGem2")).toBeTruthy();

        const cref1 = new Cref(Object, "MyGem1");
        const cref2 = new Cref(Object, "MyGem2");

        expect(Inceptions.isRegistered(cref1)).toBeTruthy();
        expect(Inceptions.isRegistered(cref2)).toBeTruthy();

        await (g.$loader1 as Loader).unload();

        expect(!Inceptions.isRegistered(cref1)).toBeTruthy();
        expect(Inceptions.isRegistered(cref2)).toBeTruthy();
      });
    } finally {
      delete g.$Loader;
      delete g.$loader1;
      delete g.$loader2;
    }
  });

  it("unload clears state even if the autoload failed and the exception was rescued", async () => {
    const files: [string, string][] = [["x.ts", "export const X_IS_NOT_DEFINED = true;"]];
    await withSetup(loader, files, {}, async () => {
      await get(Object, "X").then(
        () => expect.unreachable(),
        (error: unknown) => {
          if (!(error instanceof NameError)) throw error;
        },
      );

      await loader.unload();

      expect(!Object.keys(TopLevel).includes("X")).toBeTruthy();
      expect(!isRequired(...files)).toBeTruthy();
    });
  });

  it("raises if called before setup", async () => {
    await expect(loader.unload()).rejects.toThrow(SetupRequired);
  });
});
