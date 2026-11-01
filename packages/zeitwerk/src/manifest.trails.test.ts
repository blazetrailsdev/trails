import { File, getFs } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Cref } from "./cref.js";
import { Error as ZeitwerkError } from "./error.js";
import type { Loader } from "./loader.js";
import { buildManifest, writeArtifacts, type Manifest } from "./loader/manifest.js";
import { ExplicitNamespaces } from "./registry/explicit-namespaces.js";
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
      expect(Object.keys(JSON.parse(await read("manifest.json")))).toEqual(["digest", "constants"]);
    });
  });

  it("setup fills autoloads and namespace_dirs as the walk does", async () => {
    await withFiles(FILES, async () => {
      await loader.pushDir(".");
      const dir = await writeArtifacts(loader);

      const reader = loader;
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

      const reader = loader;
      await reader.collapse("admin");
      reader.manifest = manifest;
      await expect(reader.setup()).rejects.toBeInstanceOf(ZeitwerkError);
    });
  });
});
