import { autoloadGet } from "./core-ext/kernel.js";
import { File, FileUtils, TopLevel } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Cref } from "./cref.js";
import {
  Error as ZeitwerkError,
  NameError,
  ReloadingDisabledError,
  SetupRequired,
} from "./error.js";
import { Loader } from "./loader.js";
import { Registry } from "./registry.js";
import {
  newLoader,
  setupLoader,
  teardown,
  withFiles,
  withSetup,
} from "./test-helpers/loader-test.js";

const get = (mod: object, cname: string) => autoloadGet(new Cref(mod, cname)) as Promise<never>;

const FILES: [string, string][] = [
  ["x.ts", "export const X = 1;"],
  ["y.ts", "export class Y {}"],
  ["y/a.ts", "export const A = 1;"],
  ["z/a.ts", "export const A = 1;"],
];

describe("TestReloading", () => {
  let loader: Loader;

  async function reloads(mod: object): Promise<void> {
    const y = await get(mod, "Y");
    const z = await get(mod, "Z");
    expect(await get(mod, "X")).toEqual(1);
    expect(await get(y, "A")).toEqual(1);
    expect(await get(z, "A")).toEqual(1);

    File.write("x.ts", "export const X = 2;");
    File.write("y/a.ts", "export const A = 2;");
    File.write("z/a.ts", "export const A = 2;");

    await loader.reload();

    const y2 = await get(mod, "Y");
    const z2 = await get(mod, "Z");
    expect(await get(mod, "X")).toEqual(2);
    expect(await get(y2, "A")).toEqual(2);
    expect(await get(z2, "A")).toEqual(2);
    expect(y2 !== y).toBeTruthy();
    expect(z2 !== z).toBeTruthy();
    expect(await get(mod, "X")).toEqual(2);
  }

  beforeEach(() => {
    loader = newLoader();
    (globalThis as Record<string, unknown>).testEagerLoadAfterReload = 0;
  });
  afterEach(teardown);

  it("enabling reloading after setup raises", async () => {
    const other = new Loader();
    await other.setup();
    expect(() => other.enableReloading()).toThrow(ZeitwerkError);
    let message = "";
    try {
      other.enableReloading();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toEqual("cannot enable reloading after setup");
  });

  it("enabling reloading is idempotent, even after setup", async () => {
    expect(loader.isReloadingEnabled()).toBeTruthy();
    await loader.setup();
    loader.enableReloading();
    expect(loader.isReloadingEnabled()).toBeTruthy();
  });

  it("reloading works if the flag is set (Object)", async () => {
    await withSetup(loader, FILES, {}, async () => {
      await reloads(Object);
    });
  });

  it("reloading works if the flag is set (Namespace)", async () => {
    class Namespace {}
    await withSetup(loader, FILES, { namespace: Namespace }, async () => {
      const namespace = Namespace;
      await reloads(Namespace);
      expect(namespace === Namespace).toBeTruthy();
    });
  });

  // PERMANENT-SKIP: `Registry::Inceptions` has no port (RFC 0213 § "What is ported").
  it.skip("reloading namespaces that are inceptions in other projects", () => {});

  it("reloading raises if the flag is not set", async () => {
    const other = new Loader();
    await other.setup();
    await expect(other.reload()).rejects.toThrow(ReloadingDisabledError);
    const error = (await other.reload().catch((e: unknown) => e)) as Error;
    expect(error.message).toEqual("can't reload, please call loader.enable_reloading before setup");
  });

  it("if reloading is disabled, autoloading metadata shrinks while autoloading (performance test)", async () => {
    await withFiles(FILES, async () => {
      const other = await setupLoader(".", { enableReloading: false });

      expect(Object.keys(other.autoloads).length !== 0).toBeTruthy();

      const y = await get(Object, "Y");
      const z = await get(Object, "Z");
      expect(await get(Object, "X")).toEqual(1);
      expect(await get(y, "A")).toEqual(1);
      expect(await get(z, "A")).toEqual(1);

      expect(Object.keys(other.autoloads).length === 0).toBeTruthy();
      expect(Object.keys(other.toUnload).length === 0).toBeTruthy();
    });
  });

  it("if reloading is disabled, autoloading metadata shrinks while eager loading (performance test)", async () => {
    await withFiles(FILES, async () => {
      const other = await setupLoader(".", { enableReloading: false });

      expect(Object.keys(other.autoloads).length !== 0).toBeTruthy();
      expect(Object.keys(Registry.autoloads).length !== 0).toBeTruthy();

      await other.eagerLoad();

      expect(Object.keys(other.autoloads).length === 0).toBeTruthy();
      expect(Object.keys(Registry.autoloads).length === 0).toBeTruthy();
      expect(Object.keys(other.toUnload).length === 0).toBeTruthy();
    });
  });

  it("reloading supports deleted root directories", async () => {
    const files: [string, string][] = [
      ["rd1/x.ts", "export const X = 1;"],
      ["rd2/y.ts", "export const Y = 1;"],
    ];
    await withSetup(loader, files, {}, async () => {
      expect(await get(Object, "X")).toBeTruthy();
      expect(await get(Object, "Y")).toBeTruthy();

      FileUtils.rmRf("rd2");
      await loader.reload();

      expect(await get(Object, "X")).toBeTruthy();
    });
  });

  it("you can eager load again after reloading", async () => {
    const files: [string, string][] = [
      ["x.ts", "globalThis.testEagerLoadAfterReload += 1; export const X = 1;"],
    ];
    await withSetup(loader, files, {}, async () => {
      const count = () => (globalThis as Record<string, unknown>).testEagerLoadAfterReload;

      await loader.eagerLoad();
      expect(count()).toBe(1);

      await loader.reload();

      await loader.eagerLoad();
      expect(count()).toBe(2);
    });
  });

  for (const [name, callbacks] of [
    ["w/o", false],
    ["w/", true],
  ] as const) {
    it(`reload recovers from name errors (${name} on_unload callbacks)`, async () => {
      await withSetup(loader, [["x.ts", "export const Y = 1;"]], {}, async () => {
        if (callbacks) loader.onUnload(() => {});
        const cref = new Cref(Object, "X");
        await expect(autoloadGet(cref)).rejects.toThrow(NameError);

        expect(!Object.keys(TopLevel).includes("X")).toBeTruthy();
        expect(!cref.isDefined()).toBeTruthy();
        expect(!cref.isAutoload()).toBeTruthy();

        await loader.reload();
        File.write("x.ts", "export const X = true;");

        expect(Object.keys(loader.autoloads).length !== 0).toBeTruthy();
        expect(cref.isDefined()).toBeTruthy();
        expect(cref.isAutoload()).toBeTruthy();

        expect(await autoloadGet(cref)).toBeTruthy();
      });
    });
  }

  it("raises if called before setup", async () => {
    await expect(loader.reload()).rejects.toThrow(SetupRequired);
  });
});
