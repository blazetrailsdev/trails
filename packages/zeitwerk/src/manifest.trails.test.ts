import {
  Dir,
  File,
  TopLevel,
  fsAdapterConfig,
  getFs,
  getPath,
  registerFsAdapter,
} from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Cref } from "./cref.js";
import { Error as ZeitwerkError } from "./error.js";
import type { Loader } from "./loader.js";
import {
  buildManifest,
  configurationDigest,
  writeArtifacts,
  type Manifest,
} from "./loader/manifest.js";
import { ExplicitNamespaces } from "./registry/explicit-namespaces.js";
import { Registry } from "./registry.js";
import { newLoader, teardown, withFiles } from "./test-helpers/loader-test.js";

const raiseOnEveryRead = () => {
  const raising = new Proxy(getFs(), {
    get(target, name, receiver) {
      if (name === "cwd") return Reflect.get(target, name, receiver);
      return () => {
        throw new globalThis.Error(`fs touched: ${String(name)}`);
      };
    },
  });
  const previous = fsAdapterConfig.adapter;
  registerFsAdapter("raising", raising, getPath());
  fsAdapterConfig.adapter = "raising";
  return previous;
};

const FILES: [string, string?][] = [
  ["x.ts"],
  ["admin/users-controller.ts"],
  ["admin/deep/thing.ts"],
  ["m.ts"],
  ["m/y.ts"],
];

describe("autoload artifacts", () => {
  let loader: Loader;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
    loader.tag = "main";
  });
  afterEach(teardown);

  const cref = (cname: string) => new Cref(Object, cname);

  const fresh = async () => {
    Registry.unregisterLoader(loader);
    const reader = await newLoader({ setup: false });
    await reader.pushDir(".");
    return reader;
  };

  it("records every constant in walk order, nested namespaces included", async () => {
    await withFiles(FILES, async () => {
      await loader.pushDir(".");
      const { constants } = await buildManifest(loader);
      expect(Object.keys(constants)).toEqual([
        "Admin",
        "M",
        "X",
        "Admin::Deep",
        "Admin::UsersController",
        "M::Y",
        "Admin::Deep::Thing",
      ]);
      expect(constants.Admin).toEqual({
        path: "admin",
        export: null,
        kind: "implicit",
        dirs: ["admin"],
      });
      expect(constants.M).toEqual({ path: "m.ts", export: "M", kind: "explicit", dirs: ["m"] });
      expect(constants["Admin::UsersController"]).toEqual({
        path: "admin/users-controller.ts",
        export: "UsersController",
        kind: "file",
      });
    });
  });

  it("writes the three artifacts under the loader's tag", async () => {
    await withFiles(FILES, async () => {
      await loader.pushDir(".");
      await writeArtifacts(loader);
      const read = (name: string) => getFs().readFile(`.trails/autoload/main/${name}`, "utf8");
      const imports = await read("imports.generated.js");
      expect(imports).toContain(`"X": () => import("../../../x.ts")`);
      expect(imports).not.toContain(`"Admin":`);
      const types = await read("constants.generated.d.ts");
      expect(types).toContain(`declare module "@blazetrails/ruby-compat"`);
      expect(types).toContain(`"Admin": object;`);
      expect(types).toContain(`"X": typeof import("../../../x.js").X;`);
      expect(Object.keys(JSON.parse(await read("manifest.json")))).toEqual([
        "digest",
        "constants",
        "shadowed",
        "collapsed",
      ]);
    });
  });

  it("setup fills autoloads and namespace_dirs as the walk does", async () => {
    await withFiles(FILES, async () => {
      await loader.pushDir(".");
      const dir = await writeArtifacts(loader);

      const reader = await fresh();
      reader.manifest = File.join(dir, "manifest.json");
      await reader.setup();

      expect(Object.keys(reader.autoloads)).toEqual(
        ["admin", "m.ts", "x.ts"].map((path) => File.expandPath(path)),
      );
      expect(cref("X").isAutoload()).toEqual(File.expandPath("x.ts"));
      expect(reader.namespaceDirs.get(cref("Admin"))).toEqual([File.expandPath("admin")]);
      expect(ExplicitNamespaces.isRegistered(cref("M"))).toBe(reader);
    });
  });

  it("setup raises on a digest mismatch", async () => {
    await withFiles(FILES, async () => {
      await loader.pushDir(".");
      const manifest: Manifest = await buildManifest(loader);

      const reader = await fresh();
      await reader.collapse("admin");
      reader.manifest = manifest;
      await expect(reader.setup()).rejects.toBeInstanceOf(ZeitwerkError);
    });
  });

  it("builds with a stale manifest set and runs no on_setup callback", async () => {
    await withFiles(FILES, async () => {
      await loader.pushDir(".");
      let called = false;
      await loader.onSetup(() => (called = true));
      loader.manifest = { digest: "stale", constants: {}, shadowed: [], collapsed: [] };
      const { constants } = await buildManifest(loader);
      expect(constants).toHaveProperty("M::Y");
      expect(called).toBe(false);
    });
  });

  it("raises on a manifest built before it recorded collapsed directories", async () => {
    await withFiles(FILES, async () => {
      await loader.pushDir(".");
      const { collapsed: _collapsed, ...manifest } = await buildManifest(loader);
      loader.manifest = manifest as Manifest;
      await expect(loader.setup()).rejects.toThrow(/run trails build/);
    });
  });

  it("digests the inflector's overrides", async () => {
    await withFiles(FILES, async () => {
      await loader.pushDir(".");
      const manifest = await buildManifest(loader);
      loader.inflector.inflect({ x: "XX" });
      loader.manifest = manifest;
      await expect(loader.setup()).rejects.toBeInstanceOf(ZeitwerkError);
    });
  });

  it("raises when the inflector no longer answers a row's cname", async () => {
    await withFiles(FILES, async () => {
      await loader.pushDir(".");
      const manifest = await buildManifest(loader);
      const camelize = loader.inflector.camelize.bind(loader.inflector);
      loader.inflector.camelize = (basename, abspath) =>
        basename === "users_controller" ? "UsersCONTROLLER" : camelize(basename, abspath);
      loader.manifest = manifest;
      await expect(loader.setup()).rejects.toBeInstanceOf(ZeitwerkError);
    });
  });

  it("resolves rows against the manifest root from another directory", async () => {
    await withFiles(FILES, async () => {
      const root = Dir.pwd();
      await loader.pushDir(".");
      const manifest = await buildManifest(loader);
      const reader = await fresh();
      reader.manifestRoot = root;
      reader.manifest = manifest;
      Dir.chdir("admin");
      try {
        await reader.setup();
      } finally {
        Dir.chdir(root);
      }
      expect(cref("X").isAutoload()).toEqual(File.join(root, "x.ts"));
    });
  });

  it("shadows a row whose constant is defined and reads through a defined namespace", async () => {
    const seats = TopLevel as Record<string, unknown>;
    await withFiles(FILES, async () => {
      await loader.pushDir(".");
      const manifest = await buildManifest(loader);
      const reader = await fresh();
      const admin = {};
      seats.X = 1;
      new Cref(Object, "Admin").set(admin);
      try {
        reader.manifest = manifest;
        await reader.setup();
        expect(reader.isShadowedFile(File.expandPath("x.ts"))).toBe(true);
        expect(new Cref(admin, "UsersController").isAutoload()).toEqual(
          File.expandPath("admin/users-controller.ts"),
        );
      } finally {
        delete seats.X;
        delete seats.Admin;
      }
    });
  });

  it("boots a built manifest on an fs adapter that raises on every read", async () => {
    const files: [string, string][] = [
      ["x.js", "export class X {}\n"],
      ["admin/deep/thing.js", "export class Thing {}\n"],
      ["m.js", "export class M {}\n"],
      ["m/y.js", "export class Y {}\n"],
      ["skipped/z.js", "export class Z {}\n"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir(".");
      const dir = await writeArtifacts(loader);
      const manifest = JSON.parse(await getFs().readFile(`${dir}/manifest.json`, "utf8"));
      const { imports } = await import(`${dir}/imports.generated.js`);
      Registry.unregisterLoader(loader);

      const previous = raiseOnEveryRead();
      try {
        const reader = await newLoader({ setup: false, enableReloading: false });
        reader.manifest = manifest;
        reader.imports = imports;
        await reader.pushDir(".");
        await reader.collapse("nothing");
        reader.manifest = { ...manifest, digest: configurationDigest(reader) };
        await reader.setup();
        reader.doNotEagerLoad("skipped");

        await reader.eagerLoad();

        const seats = TopLevel as Record<string, Record<string, Record<string, unknown>>>;
        expect(seats.X).toBeTypeOf("function");
        expect(seats.M.Y).toBeTypeOf("function");
        expect(seats.Admin.Deep.Thing).toBeTypeOf("function");
        expect(seats.Skipped).toBeUndefined();
      } finally {
        fsAdapterConfig.adapter = previous;
      }
    });
  });

  it("answers the eager load variants and expected cpaths from rows on an fs adapter that raises on every read", async () => {
    const files: [string, string][] = [
      ["top.js", "export class Top {}\n"],
      ["app/lib/nested.js", "export class Nested {}\n"],
      ["app/lib/other.js", "export class Other {}\n"],
      ["app/flat/flattened.js", "export class Flattened {}\n"],
      ["app/flat/inner/leaf.js", "export class Leaf {}\n"],
      ["unloaded/thing.js", "export class Thing {}\n"],
      ["README.md", "not code\n"],
    ];
    const seats = TopLevel as Record<string, Record<string, Record<string, unknown>> | undefined>;
    await withFiles(files, async () => {
      await loader.pushDir(".");
      await loader.collapse("app/flat");
      const dir = await writeArtifacts(loader);
      const manifest = JSON.parse(await getFs().readFile(`${dir}/manifest.json`, "utf8"));
      const { imports } = await import(`${dir}/imports.generated.js`);
      Registry.unregisterLoader(loader);
      const expand = (path: string) => File.expandPath(path);

      const previous = raiseOnEveryRead();
      try {
        const reader = await newLoader({ setup: false, enableReloading: false });
        reader.manifest = manifest;
        reader.imports = imports;
        await reader.pushDir(".");
        await reader.collapse("app/flat");
        await reader.setup();

        const cpaths = await reader.allExpectedCpaths();
        expect(cpaths[expand(".")]).toEqual("Object");
        expect(cpaths[expand("app/lib")]).toEqual("App::Lib");
        expect(cpaths[expand("app/lib/nested.js")]).toEqual("App::Lib::Nested");
        expect(cpaths[expand("app/flat")]).toEqual("App");
        expect(cpaths[expand("app/flat/flattened.js")]).toEqual("App::Flattened");

        expect(await reader.cpathExpectedAt("app/lib")).toEqual("App::Lib");
        expect(await reader.cpathExpectedAt("app/flat/inner/leaf.js")).toEqual("App::Inner::Leaf");
        await expect(reader.cpathExpectedAt("README.md")).rejects.toThrow(/does not exist/);

        await expect(reader.eagerLoadDir("top.js")).rejects.toThrow(/is not a directory/);
        await expect(reader.loadFile("app/lib")).rejects.toThrow(/is not a Ruby file/);
        await expect(reader.loadFile("README.md")).rejects.toThrow(/does not exist/);

        await reader.loadFile("top.js");
        expect(seats.Top).toBeTypeOf("function");

        await reader.eagerLoadDir("app/flat/inner");
        expect(seats.App!.Inner.Leaf).toBeTypeOf("function");
        expect(seats.App!.Flattened).toBeUndefined();

        await reader.loadFile("app/lib/other.js");
        expect(seats.App!.Lib.Nested).toBeUndefined();
        await reader.eagerLoadNamespace(seats.App!.Lib);
        expect(seats.App!.Lib.Nested).toBeTypeOf("function");
        expect(seats.Unloaded).toBeUndefined();
      } finally {
        fsAdapterConfig.adapter = previous;
      }
    });
  });

  it("reads rows under a namespace root and a namespace the manifest does not hold", async () => {
    const seats = TopLevel as Record<string, unknown>;
    await withFiles([["y.ts"]], async () => {
      const root = {};
      new Cref(Object, "Root").set(root);
      try {
        await loader.pushDir(".", { namespace: root });
        const manifest = await buildManifest(loader);
        expect(Object.keys(manifest.constants)).toEqual(["Root::Y"]);
        const reader = await newLoader({ setup: false });
        Registry.unregisterLoader(loader);
        await reader.pushDir(".", { namespace: root });
        reader.manifest = {
          ...manifest,
          constants: {
            ...manifest.constants,
            "Root::Other::Z": { path: "z.ts", export: "Z", kind: "file" },
          },
        };
        new Cref(root, "Other").set({});
        await reader.setup();
        expect(new Cref(root, "Y").isAutoload()).toEqual(File.expandPath("y.ts"));
        expect(reader.autoloads).toHaveProperty([File.expandPath("z.ts")]);
      } finally {
        delete seats.Root;
      }
    });
  });
});
