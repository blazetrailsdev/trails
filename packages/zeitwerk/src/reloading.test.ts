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

async function loadAll(mod: object): Promise<[object, object, number[]]> {
  const y = await get(mod, "Y");
  const z = await get(mod, "Z");
  return [y, z, [await get(mod, "X"), await get(y, "A"), await get(z, "A")]];
}

describe("TestReloading", () => {
  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
    (globalThis as Record<string, unknown>).testEagerLoadAfterReload = 0;
  });
  afterEach(teardown);

  async function assertReloads(mod: object): Promise<void> {
    const [y, z, values] = await loadAll(mod);
    expect(values).toEqual([1, 1, 1]);

    File.write("x.ts", "export const X = 2;");
    File.write("y/a.ts", "export const A = 2;");
    File.write("z/a.ts", "export const A = 2;");

    await loader.reload();

    const [y2, z2, values2] = await loadAll(mod);
    expect(values2).toEqual([2, 2, 2]);
    expect(y2).not.toBe(y);
    expect(z2).not.toBe(z);
    expect(await get(mod, "X")).toBe(2);
  }

  it("enabling reloading after setup raises", async () => {
    const other = new Loader();
    await other.setup();
    expect(() => other.enableReloading()).toThrow(
      new ZeitwerkError("cannot enable reloading after setup"),
    );
  });

  it("enabling reloading is idempotent, even after setup", async () => {
    expect(loader.isReloadingEnabled()).toBeTruthy();
    await loader.setup();
    loader.enableReloading();
    expect(loader.isReloadingEnabled()).toBeTruthy();
  });

  it("reloading works if the flag is set (Object)", async () => {
    await withSetup(loader, FILES, {}, () => assertReloads(Object));
  });

  it("reloading works if the flag is set (Namespace)", async () => {
    class Namespace {}
    await withSetup(loader, FILES, { namespace: Namespace }, () => assertReloads(Namespace));
  });

  // PERMANENT-SKIP: `Registry::Inceptions` has no port (RFC 0213 § "What is ported").
  it.skip("reloading namespaces that are inceptions in other projects", () => {});

  it("reloading raises if the flag is not set", async () => {
    const other = new Loader();
    await other.setup();
    await expect(other.reload()).rejects.toThrow(ReloadingDisabledError);
    await expect(other.reload()).rejects.toThrow(
      "can't reload, please call loader.enable_reloading before setup",
    );
  });

  it("if reloading is disabled, autoloading metadata shrinks while autoloading (performance test)", async () => {
    await withFiles(FILES, async () => {
      const other = await setupLoader(".", { enableReloading: false });

      expect(Object.keys(other.autoloads)).not.toHaveLength(0);

      await loadAll(Object);

      expect(Object.keys(other.autoloads)).toHaveLength(0);
      expect(Object.keys(other.toUnload)).toHaveLength(0);
    });
  });

  it("if reloading is disabled, autoloading metadata shrinks while eager loading (performance test)", async () => {
    await withFiles(FILES, async () => {
      const other = await setupLoader(".", { enableReloading: false });

      expect(Object.keys(other.autoloads)).not.toHaveLength(0);
      expect(Object.keys(Registry.autoloads)).not.toHaveLength(0);

      await other.eagerLoad();

      expect(Object.keys(other.autoloads)).toHaveLength(0);
      expect(Object.keys(Registry.autoloads)).toHaveLength(0);
      expect(Object.keys(other.toUnload)).toHaveLength(0);
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

        expect(Object.keys(TopLevel)).not.toContain("X");
        expect(cref.isDefined()).toBe(false);
        expect(cref.isAutoload()).toBeNull();

        await loader.reload();
        File.write("x.ts", "export const X = true;");

        expect(cref.isDefined()).toBe(true);
        expect(cref.isAutoload()).toBeTruthy();

        expect(await autoloadGet(cref)).toBe(true);
      });
    });
  }

  it("raises if called before setup", async () => {
    await expect(loader.reload()).rejects.toThrow(SetupRequired);
  });
});
