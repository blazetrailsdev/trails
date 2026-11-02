import { autoloadGet } from "./core-ext/kernel.js";
import { TopLevel, TypeError, rbModRemoveConst } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Cref } from "./cref.js";
import { NameError } from "./error.js";
import type { Loader } from "./loader.js";
import {
  assertAbspath,
  newLoader,
  teardown,
  withSetup as withLoaderSetup,
} from "./test-helpers/loader-test.js";

const X_FILES: [string, string][] = [["x.ts", "export const X = 1;"]];
const TYPO_FILES: [string, string][] = [["x.ts", "export const Y = 1;"]];
const isX = () => Object.hasOwn(TopLevel, "X");
const x = () => autoloadGet(new Cref(Object, "X"));

describe("TestOnUnload", () => {
  let loader: Loader;
  const withSetup = (files: [string, string?][], block: () => unknown) =>
    withLoaderSetup(loader, files, {}, block);

  beforeEach(() => {
    loader = newLoader();
    (globalThis as Record<string, unknown>).failedAutoloads = 0;
  });
  afterEach(teardown);

  it("on_unload checks its argument type", () => {
    expect(() => loader.onUnload(1 as never, () => {})).toThrow(TypeError);
    expect(() => loader.onUnload(Object as never, () => {})).toThrow(TypeError);
  });

  it("multiple on_unload on cpaths are called in order of definition", async () => {
    await withSetup(X_FILES, async () => {
      const calls: number[] = [];
      loader.onUnload("X", () => calls.push(1));
      loader.onUnload("X", () => calls.push(2));

      expect(await x()).toBeTruthy();
      await loader.reload();

      expect(calls).toEqual([1, 2]);
    });
  });

  it("on_unload blocks for cpaths get the expected arguments passed", async () => {
    await withSetup(X_FILES, async () => {
      let args: unknown[] = [];
      loader.onUnload("X", ((...a: unknown[]) => (args = a)) as never);

      expect(await x()).toBeTruthy();
      await loader.reload();

      expect(args[0]).toBe(1);
      assertAbspath("x.ts", args[1]);
    });
  });

  it("on_unload for cpaths is called before the constant is removed", async () => {
    await withSetup(X_FILES, async () => {
      let definedX = false;
      loader.onUnload("X", () => (definedX = isX()));

      expect(await x()).toBeTruthy();
      await loader.reload();

      expect(definedX).toBeTruthy();
    });
  });

  it("on_unload on cpaths is not called for other constants", async () => {
    const files: [string, string][] = [...X_FILES, ["y.ts", "export const Y = 1;"]];
    await withSetup(files, async () => {
      let onUnloadForY = false;
      loader.onUnload("Y", () => (onUnloadForY = true));

      expect(await x()).toBeTruthy();
      await loader.reload();

      expect(onUnloadForY).toBeFalsy();
    });
  });

  it("on_unload on cpaths is resilient to manually removed constants", async () => {
    await withSetup(X_FILES, async () => {
      let onUnloadForX = false;
      loader.onUnload("X", () => (onUnloadForX = true));

      expect(await x()).toBeTruthy();
      rbModRemoveConst(Object, "X");
      await loader.reload();

      expect(onUnloadForX).toBeFalsy();
    });
  });

  it("on_unload on cpaths is resilient to failed autoloads", async () => {
    await withSetup(TYPO_FILES, async () => {
      let onUnloadForX = false;
      loader.onUnload("X", () => (onUnloadForX = true));

      await expect(x()).rejects.toThrow(NameError);
      await loader.reload();

      expect(onUnloadForX).toBeFalsy();
    });
  });

  it("on_unload on cpaths does not trigger a failed autoload twice", async () => {
    await withSetup(
      [["x.ts", "globalThis.failedAutoloads += 1; export const Y = 1;"]],
      async () => {
        loader.onUnload("X", () => {});

        await expect(x()).rejects.toThrow(NameError);
        await loader.reload();

        expect((globalThis as Record<string, unknown>).failedAutoloads).toBe(1);
      },
    );
  });

  it("on_unload for :ANY is called with the expected arguments", async () => {
    await withSetup(X_FILES, async () => {
      const args: unknown[][] = [];
      loader.onUnload(((...a: unknown[]) => args.push(a)) as never);

      expect(await x()).toBeTruthy();
      await loader.reload();

      expect(args.length).toBe(1);
      expect(args[0][0]).toBe("X");
      expect(args[0][1]).toBe(1);
      assertAbspath("x.ts", args[0][2]);
    });
  });

  it("on_unload for :ANY is called before the constant is removed", async () => {
    await withSetup(X_FILES, async () => {
      let definedX = false;
      loader.onUnload(() => (definedX = isX()));

      expect(await x()).toBeTruthy();
      await loader.reload();

      expect(definedX).toBeTruthy();
    });
  });

  it("multiple on_unload for :ANY are called in order of definition", async () => {
    await withSetup(X_FILES, async () => {
      const calls: number[] = [];
      loader.onUnload(() => calls.push(1));
      loader.onUnload(() => calls.push(2));

      expect(await x()).toBeTruthy();
      await loader.reload();

      expect(calls).toEqual([1, 2]);
    });
  });

  it("if there are specific and :ANY on_unloads, the specific one runs first", async () => {
    await withSetup(X_FILES, async () => {
      const calls: number[] = [];
      loader.onUnload(() => calls.push(2));
      loader.onUnload("X", () => calls.push(1));

      expect(await x()).toBeTruthy();
      await loader.reload();

      expect(calls).toEqual([1, 2]);
    });
  });

  it("on_unload for :ANY is is resilient to manually removed constants", async () => {
    await withSetup(X_FILES, async () => {
      let onUnloadForX = false;
      loader.onUnload(() => (onUnloadForX = true));

      expect(await x()).toBeTruthy();
      rbModRemoveConst(Object, "X");
      await loader.reload();

      expect(onUnloadForX).toBeFalsy();
    });
  });

  it("on_unload for :ANY is is resilient to failed autoloads", async () => {
    await withSetup(TYPO_FILES, async () => {
      let onUnloadForX = false;
      loader.onUnload(() => (onUnloadForX = true));

      await expect(x()).rejects.toThrow(NameError);
      await loader.reload();

      expect(onUnloadForX).toBeFalsy();
    });
  });

  it("on_unload on :ANY does not trigger a failed autoload twice", async () => {
    await withSetup(
      [["x.ts", "globalThis.failedAutoloads += 1; export const Y = 1;"]],
      async () => {
        loader.onUnload(() => {});

        await expect(x()).rejects.toThrow(NameError);
        await loader.reload();

        expect((globalThis as Record<string, unknown>).failedAutoloads).toBe(1);
      },
    );
  });
});
