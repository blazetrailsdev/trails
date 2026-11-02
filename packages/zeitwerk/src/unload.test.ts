import { autoloadGet } from "./core-ext/kernel.js";
import { TopLevel, rbModRemoveConst } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Cref } from "./cref.js";
import { NameError, SetupRequired } from "./error.js";
import type { Loader } from "./loader.js";
import { ExplicitNamespaces } from "./registry/explicit-namespaces.js";
import {
  isRequired,
  newLoader,
  setupLoader,
  teardown,
  withFiles,
  withSetup,
} from "./test-helpers/loader-test.js";

const get = (mod: object, cname: string) => autoloadGet(new Cref(mod, cname)) as Promise<object>;
const defined = (mod: object, cname: string) => new Cref(mod, cname).isDefined();

const USERS: [string, string][] = [
  ["user.ts", "export class User {}"],
  ["admin/root.ts", "export class Root {}"],
];

describe("TestUnload", () => {
  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
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
    const files: [string, string][] = [
      ["rd1/user.ts", "export class User {}"],
      ["rd1/api/v1/users-controller.ts", "export class UsersController {}"],
      ["rd1/admin/root.ts", "export class Root {}"],
      ["rd2/user.ts", "export class User {}"],
    ];
    await withSetup(loader, files, {}, async () => {
      expect(await get(Object, "User")).toBeTruthy();
      const api = await get(Object, "Api");
      expect(await get(await get(api, "V1"), "UsersController")).toBeTruthy();

      expect(Object.keys(loader.autoloads).length !== 0).toBeTruthy();
      expect(loader.autoloadedDirs.length !== 0).toBeTruthy();
      expect(Object.keys(loader.toUnload).length !== 0).toBeTruthy();
      expect(!loader.namespaceDirs.isEmpty()).toBeTruthy();

      await loader.unload();

      expect(Object.keys(loader.autoloads).length === 0).toBeTruthy();
      expect(loader.autoloadedDirs.length === 0).toBeTruthy();
      expect(Object.keys(loader.toUnload).length === 0).toBeTruthy();
      expect(loader.namespaceDirs.isEmpty()).toBeTruthy();
    });
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
      const la = await setupLoader("a");
      const crefM = new Cref(Object, "M");
      expect(ExplicitNamespaces.isRegistered(crefM) === la).toBeTruthy();

      const lb = await setupLoader("b");
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

  // PERMANENT-SKIP: `Registry::Inceptions` has no port (RFC 0213 § "What is ported").
  it.skip("unload clears associated inceptions", () => {});

  it("unload clears state even if the autoload failed and the exception was rescued", async () => {
    const files: [string, string][] = [["x.ts", "export const X_IS_NOT_DEFINED = true;"]];
    await withSetup(loader, files, {}, async () => {
      await get(Object, "X").catch((error: unknown) => {
        if (!(error instanceof NameError)) throw error;
      });

      await loader.unload();

      expect(!Object.keys(TopLevel).includes("X")).toBeTruthy();
      expect(!isRequired(...files)).toBeTruthy();
    });
  });

  it("raises if called before setup", async () => {
    await expect(loader.unload()).rejects.toThrow(SetupRequired);
  });
});
