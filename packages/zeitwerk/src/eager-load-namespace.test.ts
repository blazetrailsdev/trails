import { constSet } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Error as ZeitwerkError, SetupRequired } from "./error.js";
import { Loader } from "./loader.js";
import {
  get,
  isRequired,
  newLoader,
  teardown,
  withFiles,
  withSetup,
} from "./test-helpers/loader-test.js";

type Files = [string, string][];
const anonymous = () => (() => class {})();

describe("TestEagerLoadNamespaceWithObjectRootNamespace", () => {
  class TestEagerLoadNamespaceWithObjectRootNamespace {}
  let loader: Loader;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
  });
  afterEach(teardown);

  it("eager loads everything", async () => {
    const files: Files = [
      ["x.ts", "export const X = 1"],
      ["m/x.ts", "export const X = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadNamespace(Object);

      expect(isRequired(...files)).toBe(true);
    });
  });

  it("shortcircuits if eager loaded", async () => {
    await withSetup(loader, [], {}, async () => {
      await loader.eagerLoad();

      loader.actualEagerLoadDir = () => {
        throw new globalThis.Error();
      };

      await expect(loader.eagerLoadNamespace(Object)).resolves.toBeUndefined();
    });
  });

  it("does not assume the namespace has a name", async () => {
    const files: Files = [["x.ts", "export const X = 1"]];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadNamespace(anonymous());

      expect(isRequired(files[0])).toBe(false);
    });
  });

  it("eager loads everything (multiple root directories)", async () => {
    const files: Files = [
      ["rd1/x.ts", "export const X = 1"],
      ["rd1/m/x.ts", "export const X = 1"],
      ["rd2/y.ts", "export const Y = 1"],
      ["rd2/m/y.ts", "export const Y = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadNamespace(Object);

      expect(isRequired(...files)).toBe(true);
    });
  });

  it("supports collapsed directories", async () => {
    const files: Files = [
      ["rd1/collapsed/m/x.ts", "export const X = 1"],
      ["rd2/y.ts", "export const Y = 1"],
      ["rd2/m/y.ts", "export const Y = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadNamespace(await get(Object, "M"));
      expect(isRequired(files[0])).toBe(true);
      expect(isRequired(files[1])).toBe(false);
      expect(isRequired(files[2])).toBe(true);
    });
  });

  it("eager loads everything (nested root directories)", async () => {
    const files: Files = [
      ["x.ts", "export const X = 1"],
      ["m/x.ts", "export const X = 1"],
      ["nested/y.ts", "export const Y = 1"],
      ["nested/m/y.ts", "export const Y = 1"],
    ];
    await withSetup(loader, files, { dirs: [".", "nested"] }, async () => {
      await loader.eagerLoadNamespace(Object);

      expect(isRequired(...files)).toBe(true);
    });
  });

  it("eager loads a managed namespace", async () => {
    const files: Files = [
      ["x.ts", "export const X = 1"],
      ["m/x.ts", "export const X = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadNamespace(await get(Object, "M"));

      expect(isRequired(files[0])).toBe(false);
      expect(isRequired(files[1])).toBe(true);
    });
  });

  it("eager loading a non-managed namespace does not raise", async () => {
    const files: Files = [["x.ts", "export const X = 1"]];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadNamespace(TestEagerLoadNamespaceWithObjectRootNamespace);

      expect(isRequired(files[0])).toBe(false);
    });
  });

  it("does not eager load ignored files", async () => {
    const files: Files = [
      ["x.ts", "export const X = 1"],
      ["ignored.ts", "IGNORED"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadNamespace(Object);

      expect(isRequired(files[0])).toBe(true);
      expect(isRequired(files[1])).toBe(false);
    });
  });

  it("does not eager load shadowed files", async () => {
    const files: Files = [
      ["rd1/x.ts", "export const X = 1"],
      ["rd2/x.ts", "export const X = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadNamespace(Object);

      expect(isRequired(files[0])).toBe(true);
      expect(isRequired(files[1])).toBe(false);
    });
  });

  it("skips root directories which are excluded from eager loading (Object)", async () => {
    const files: Files = [
      ["rd1/a.ts", "export const A = 1"],
      ["rd2/b.ts", "export const B = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.doNotEagerLoad("rd1");
      await loader.eagerLoadNamespace(Object);

      expect(isRequired(files[0])).toBe(false);
      expect(isRequired(files[1])).toBe(true);
    });
  });

  it("skips directories which are excluded from eager loading (namespace, ancestor)", async () => {
    const files: Files = [
      ["rd1/m/a.ts", "export const A = 1"],
      ["rd2/m/b.ts", "export const B = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.doNotEagerLoad("rd1/m");
      await loader.eagerLoadNamespace(Object);

      expect(isRequired(files[0])).toBe(false);
      expect(isRequired(files[1])).toBe(true);
    });
  });

  it("skips directories which are excluded from eager loading (namespace, self)", async () => {
    const files: Files = [
      ["rd1/m/a.ts", "export const A = 1"],
      ["rd2/m/b.ts", "export const B = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.doNotEagerLoad("rd1/m");
      await loader.eagerLoadNamespace(await get(Object, "M"));

      expect(isRequired(files[0])).toBe(false);
      expect(isRequired(files[1])).toBe(true);
    });
  });

  it("skips directories which are excluded from eager loading (namespace, descendant)", async () => {
    const files: Files = [
      ["rd1/m/n/a.ts", "export const A = 1"],
      ["rd2/m/n/b.ts", "export const B = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.doNotEagerLoad("rd1/m");
      await loader.eagerLoadNamespace(await get(await get(Object, "M"), "N"));

      expect(isRequired(files[0])).toBe(false);
      expect(isRequired(files[1])).toBe(true);
    });
  });

  it("does not eager load namespaces from other loaders", async () => {
    const files: Files = [
      ["a/m/x.ts", "export const X = 1"],
      ["b/m/y.ts", "export const Y = 1"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir("a");
      await loader.setup();

      await (await newLoader({ dirs: "b" })).eagerLoadNamespace(await get(Object, "M"));

      expect(isRequired(files[0])).toBe(false);
      expect(isRequired(files[1])).toBe(true);
    });
  });

  it("raises if the argument is not a class or module object", async () => {
    await withSetup(loader, [], {}, async () => {
      const name = TestEagerLoadNamespaceWithObjectRootNamespace.name;
      const e = await loader.eagerLoadNamespace(name as never).catch((error: unknown) => error);
      expect(e).toBeInstanceOf(ZeitwerkError);
      expect((e as ZeitwerkError).message).toBe(`"${name}" is not a class or module object`);
    });
  });

  it("raises if the argument is not a class or module object, even if eager loaded", async () => {
    await withSetup(loader, [], {}, async () => {
      await loader.eagerLoad();
      const name = TestEagerLoadNamespaceWithObjectRootNamespace.name;
      const e = await loader.eagerLoadNamespace(name as never).catch((error: unknown) => error);
      expect(e).toBeInstanceOf(ZeitwerkError);
      expect((e as ZeitwerkError).message).toBe(`"${name}" is not a class or module object`);
    });
  });
});

describe("TestEagerLoadNamespaceWithCustomRootNamespace", () => {
  class TestEagerLoadNamespaceWithCustomRootNamespace {}
  class CN {}
  constSet(TestEagerLoadNamespaceWithCustomRootNamespace, "CN", CN);
  const ancestors: [string, object][] = [
    ["Object", Object],
    [
      "TestEagerLoadNamespaceWithCustomRootNamespace",
      TestEagerLoadNamespaceWithCustomRootNamespace,
    ],
    ["TestEagerLoadNamespaceWithCustomRootNamespace::CN", CN],
  ];
  let loader: Loader;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
    for (const cname of Object.keys(CN)) delete (CN as unknown as Record<string, unknown>)[cname];
  });
  afterEach(teardown);

  for (const [name, ancestor] of ancestors) {
    it(`eager loads everything ${name}`, async () => {
      const files: Files = [
        ["x.ts", "export const X = 1"],
        ["m/x.ts", "export const X = 1"],
      ];
      await withSetup(loader, files, { namespace: CN }, async () => {
        await loader.eagerLoadNamespace(ancestor);

        expect(isRequired(...files)).toBe(true);
      });
    });

    it(`eager loads everything (multiple root directories) ${name}`, async () => {
      const files: Files = [
        ["rd1/x.ts", "export const X = 1"],
        ["rd1/m/x.ts", "export const X = 1"],
        ["rd2/y.ts", "export const Y = 1"],
        ["rd2/m/y.ts", "export const Y = 1"],
      ];
      await withSetup(loader, files, { namespace: CN }, async () => {
        await loader.eagerLoadNamespace(ancestor);

        expect(isRequired(...files)).toBe(true);
      });
    });

    it(`eager loads everything (nested root directories) ${name}`, async () => {
      const files: Files = [
        ["x.ts", "export const X = 1"],
        ["m/x.ts", "export const X = 1"],
        ["nested/y.ts", "export const Y = 1"],
        ["nested/m/y.ts", "export const Y = 1"],
      ];
      await withSetup(loader, files, { dirs: [".", "nested"], namespace: CN }, async () => {
        await loader.eagerLoadNamespace(ancestor);

        expect(isRequired(...files)).toBe(true);
      });
    });

    it(`eager loads everything (nested root directories, different namespaces 1) ${name}`, async () => {
      const files: Files = [
        ["x.ts", "export const X = 1"],
        ["m/x.ts", "export const X = 1"],
        ["nested/y.ts", "export const Y = 1"],
        ["nested/m/y.ts", "export const Y = 1"],
      ];
      await withFiles(files, async () => {
        await loader.pushDir(".", { namespace: CN });
        await loader.pushDir("nested");
        await loader.setup();
        await loader.eagerLoadNamespace(ancestor);

        expect(files.map((file) => isRequired(file))).toEqual(
          ancestor === Object ? [true, true, true, true] : [true, true, false, false],
        );
      });
    });

    it(`eager loads everything (nested root directories, different namespaces 2) ${name}`, async () => {
      const files: Files = [
        ["x.ts", "export const X = 1"],
        ["m/x.ts", "export const X = 1"],
        ["nested/y.ts", "export const Y = 1"],
        ["nested/m/y.ts", "export const Y = 1"],
      ];
      await withFiles(files, async () => {
        await loader.pushDir(".");
        await loader.pushDir("nested", { namespace: CN });
        await loader.setup();
        await loader.eagerLoadNamespace(ancestor);

        expect(files.map((file) => isRequired(file))).toEqual(
          ancestor === Object ? [true, true, true, true] : [false, false, true, true],
        );
      });
    });
  }

  it("does not assume the namespace has a name", async () => {
    const files: Files = [["x.ts", "export const X = 1"]];
    await withSetup(loader, files, { namespace: CN }, async () => {
      await loader.eagerLoadNamespace(anonymous());

      expect(isRequired(files[0])).toBe(false);
    });
  });

  it("eager loads a managed namespace", async () => {
    const files: Files = [
      ["x.ts", "export const X = 1"],
      ["m/x.ts", "export const X = 1"],
    ];
    await withSetup(loader, files, { namespace: CN }, async () => {
      await loader.eagerLoadNamespace(await get(CN, "M"));

      expect(isRequired(files[0])).toBe(false);
      expect(isRequired(files[1])).toBe(true);
    });
  });

  it("eager loading a non-managed namespace does not raise", async () => {
    const files: Files = [["x.ts", "export const X = 1"]];
    await withSetup(loader, files, { namespace: CN }, async () => {
      await loader.eagerLoadNamespace(String);

      expect(isRequired(files[0])).toBe(false);
    });
  });

  it("does not eager load ignored files", async () => {
    const files: Files = [
      ["x.ts", "export const X = 1"],
      ["ignored.ts", "IGNORED"],
    ];
    await withSetup(loader, files, { namespace: CN }, async () => {
      await loader.eagerLoadNamespace(CN);

      expect(isRequired(files[0])).toBe(true);
      expect(isRequired(files[1])).toBe(false);
    });
  });

  it("does not eager load shadowed files", async () => {
    const files: Files = [
      ["rd1/x.ts", "export const X = 1"],
      ["rd2/x.ts", "export const X = 1"],
    ];
    await withSetup(loader, files, { namespace: CN }, async () => {
      await loader.eagerLoadNamespace(CN);

      expect(isRequired(files[0])).toBe(true);
      expect(isRequired(files[1])).toBe(false);
    });
  });

  it("skips root directories which are excluded from eager loading (Object)", async () => {
    const files: Files = [
      ["rd1/a.ts", "export const A = 1"],
      ["rd2/b.ts", "export const B = 1"],
    ];
    await withSetup(loader, files, { namespace: CN }, async () => {
      await loader.doNotEagerLoad("rd1");
      await loader.eagerLoadNamespace(Object);

      expect(isRequired(files[0])).toBe(false);
      expect(isRequired(files[1])).toBe(true);
    });
  });

  it("skips root directories which are excluded from eager loading (self)", async () => {
    const files: Files = [
      ["rd1/a.ts", "export const A = 1"],
      ["rd2/b.ts", "export const B = 1"],
    ];
    await withSetup(loader, files, { namespace: CN }, async () => {
      await loader.doNotEagerLoad("rd1");
      await loader.eagerLoadNamespace(CN);

      expect(isRequired(files[0])).toBe(false);
      expect(isRequired(files[1])).toBe(true);
    });
  });

  it("skips directories which are excluded from eager loading (namespace, ancestor)", async () => {
    const files: Files = [
      ["rd1/m/a.ts", "export const A = 1"],
      ["rd2/m/b.ts", "export const B = 1"],
    ];
    await withSetup(loader, files, { namespace: CN }, async () => {
      await loader.doNotEagerLoad("rd1/m");
      await loader.eagerLoadNamespace(Object);

      expect(isRequired(files[0])).toBe(false);
      expect(isRequired(files[1])).toBe(true);
    });
  });

  it("skips directories which are excluded from eager loading (namespace, self)", async () => {
    const files: Files = [
      ["rd1/m/a.ts", "export const A = 1"],
      ["rd2/m/b.ts", "export const B = 1"],
    ];
    await withSetup(loader, files, { namespace: CN }, async () => {
      await loader.doNotEagerLoad("rd1/m");
      await loader.eagerLoadNamespace(await get(CN, "M"));

      expect(isRequired(files[0])).toBe(false);
      expect(isRequired(files[1])).toBe(true);
    });
  });

  it("skips directories which are excluded from eager loading (namespace, descendant)", async () => {
    const files: Files = [
      ["rd1/m/n/a.ts", "export const A = 1"],
      ["rd2/m/n/b.ts", "export const B = 1"],
    ];
    await withSetup(loader, files, { namespace: CN }, async () => {
      await loader.doNotEagerLoad("rd1/m");
      await loader.eagerLoadNamespace(await get(await get(CN, "M"), "N"));

      expect(isRequired(files[0])).toBe(false);
      expect(isRequired(files[1])).toBe(true);
    });
  });

  it("does not eager load namespaces from other loaders", async () => {
    const files: Files = [
      ["a/m/x.ts", "export const X = 1"],
      ["b/m/y.ts", "export const Y = 1"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir("a", { namespace: CN });
      await loader.setup();

      const other = await newLoader({ dirs: "b", namespace: CN });
      await other.eagerLoadNamespace(await get(CN, "M"));

      expect(isRequired(files[0])).toBe(false);
      expect(isRequired(files[1])).toBe(true);
    });
  });

  it("raises if called before setup", async () => {
    await expect(
      loader.eagerLoadNamespace(TestEagerLoadNamespaceWithCustomRootNamespace),
    ).rejects.toThrow(SetupRequired);
  });

  it("the class method broadcasts the call to all registered loaders", async () => {
    const files: Files = [
      ["a/m/x.ts", "export const X = 1"],
      ["a/x.ts", "export const X = 1"],
      ["b/m/y.ts", "export const Y = 1"],
      ["b/y.ts", "export const Y = 1"],
      ["c/z.ts", "export const Z = 1"],
    ];
    await withFiles(files, async () => {
      await newLoader({ dirs: "a" });
      await newLoader({ dirs: "b" });
      await newLoader({ dirs: "c" });

      await Loader.eagerLoadNamespace(await get(Object, "M"));

      expect(isRequired(files[0])).toBe(true);
      expect(isRequired(files[1])).toBe(false);

      expect(isRequired(files[2])).toBe(true);
      expect(isRequired(files[3])).toBe(false);

      expect(isRequired(files[4])).toBe(false);
    });
  });

  it("the class method skips loaders that are not ready", async () => {
    const files: Files = [["m/x.ts", "export const X = 1"]];
    await withSetup(loader, files, {}, async () => {
      await newLoader({ setup: false });
      await Loader.eagerLoadNamespace(await get(Object, "M"));
      expect(isRequired(...files)).toBe(true);
    });
  });
});
