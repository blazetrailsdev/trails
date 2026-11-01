import { Dir, File, TopLevel, getFs } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Cref } from "./cref.js";
import { Error as ZeitwerkError } from "./error.js";
import type { Loader } from "./loader.js";
import { buildManifest, writeArtifacts, type Manifest } from "./loader/manifest.js";
import { ExplicitNamespaces } from "./registry/explicit-namespaces.js";
import { Registry } from "./registry.js";
import { newLoader, teardown, withFiles } from "./test-helpers/loader-test.js";

const FILES: [string, string?][] = [
  ["x.ts"],
  ["admin/users-controller.ts"],
  ["admin/deep/thing.ts"],
  ["m.ts"],
  ["m/y.ts"],
];

describe("autoload artifacts", () => {
  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
    loader.tag = "main";
  });
  afterEach(teardown);

  const cref = (cname: string) => new Cref(Object, cname);

  const fresh = async () => {
    Registry.unregisterLoader(loader);
    const reader = newLoader();
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
      loader.manifest = { digest: "stale", constants: {}, shadowed: [] };
      const { constants } = await buildManifest(loader);
      expect(constants).toHaveProperty("M::Y");
      expect(called).toBe(false);
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

  it("reads rows under a namespace root and a namespace the manifest does not hold", async () => {
    const seats = TopLevel as Record<string, unknown>;
    await withFiles([["y.ts"]], async () => {
      const root = {};
      new Cref(Object, "Root").set(root);
      try {
        await loader.pushDir(".", { namespace: root });
        const manifest = await buildManifest(loader);
        expect(Object.keys(manifest.constants)).toEqual(["Root::Y"]);
        const reader = newLoader();
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
