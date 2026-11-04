import { Dir, File, NameError } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { autoloadGet } from "./core-ext/kernel.js";
import { Cref } from "./cref.js";
import type { Loader } from "./loader.js";
import { newLoader, teardown, withFiles } from "./test-helpers/loader-test.js";

type Files = [string, string][];

const autoload = (cname: string) => new Cref(Object, cname).isAutoload();

async function cget(cpath: string): Promise<unknown> {
  let mod: unknown = Object;
  for (const cname of cpath.split("::")) mod = await autoloadGet(new Cref(mod as object, cname));
  return mod;
}

const M_FILES: Files = [
  ["x.ts", "export const X = true"],
  ["m/a.ts", "export const A = true"],
  ["m/b.ts", "export const B = true"],
  ["m/c.ts", "export const C = true"],
];

describe("TestIgnore", () => {
  let loader: Loader;
  const thisDir = Dir.pwd();
  const thisFile = File.expandPath("package.json", thisDir);
  const ascendant = File.expandPath(`${thisDir}/../..`);

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
  });
  afterEach(teardown);

  it("ignored root directories are ignored", async () => {
    const files: Files = [["x.ts", "export const X = true"]];
    await withFiles(files, async () => {
      await loader.pushDir(".");
      await loader.ignore(".");
      await loader.setup();

      expect(!autoload("X")).toBeTruthy();
      expect(() => new Cref(Object, "X").get()).toThrow(NameError);
    });
  });

  it("ignored root directories are ignored, but nested ones are not", async () => {
    const files: Files = [
      ["x.ts", "export const X = true"],
      ["nested/y.ts", "export const Y = true"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir(".");
      await loader.pushDir("nested");
      await loader.ignore(".");
      await loader.setup();

      expect(!autoload("X")).toBeTruthy();
      expect(() => new Cref(Object, "X").get()).toThrow(NameError);
      expect(await cget("Y")).toBeTruthy();
    });
  });

  it("ignored files are ignored", async () => {
    const files: Files = [
      ["x.ts", "export const X = true"],
      ["y.ts", "export const Y = true"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir(".");
      await loader.ignore("y.ts");
      await loader.setup();

      expect(autoload("X")).toBeTruthy();
      expect(!autoload("Y")).toBeTruthy();

      expect(await cget("X")).toBeTruthy();
      await expect(cget("Y")).rejects.toThrow(NameError);
    });
  });

  it("ignored directories are ignored", async () => {
    await withFiles(M_FILES, async () => {
      await loader.pushDir(".");
      await loader.ignore("m");
      await loader.setup();

      expect(autoload("X")).toBeTruthy();
      expect(!autoload("M")).toBeTruthy();

      expect(await cget("X")).toBeTruthy();
      await expect(cget("M")).rejects.toThrow(NameError);
    });
  });

  it("ignored files are not eager loaded", async () => {
    const files: Files = [
      ["x.ts", "export const X = true"],
      ["y.ts", "export const Y = true"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir(".");
      await loader.ignore("y.ts");
      await loader.setup();
      await loader.eagerLoad();

      expect(await cget("X")).toBeTruthy();
      await expect(cget("Y")).rejects.toThrow(NameError);
    });
  });

  it("ignored directories are not eager loaded", async () => {
    await withFiles(M_FILES, async () => {
      await loader.pushDir(".");
      await loader.ignore("m");
      await loader.setup();
      await loader.eagerLoad();

      expect(await cget("X")).toBeTruthy();
      await expect(cget("M")).rejects.toThrow(NameError);
    });
  });

  it("supports several arguments", async () => {
    const a = `${Dir.pwd()}/a.rb`;
    const b = `${Dir.pwd()}/b.rb`;
    await loader.ignore(a, b);
    expect(loader.ignoredGlobPatterns).toEqual(new Set([a, b]));
  });

  it("supports an array", async () => {
    const a = `${Dir.pwd()}/a.rb`;
    const b = `${Dir.pwd()}/b.rb`;
    await loader.ignore([a, b]);
    expect(loader.ignoredGlobPatterns).toEqual(new Set([a, b]));
  });

  it("supports glob patterns", async () => {
    const files: Files = [
      ["admin/user.ts", "export class User {}"],
      ["admin/user_test.ts", "export class UserTest {}"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir(".");
      await loader.ignore("**/*_test.ts");
      await loader.setup();

      expect(await cget("Admin::User")).toBeTruthy();
      await expect(cget("Admin::UserTest")).rejects.toThrow(NameError);
    });
  });

  it("ignored paths are recomputed on reload", async () => {
    const files: Files = [
      ["user.ts", "export class User {}"],
      ["user_test.ts", "export class UserTest {}"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir(".");
      await loader.ignore("*_test.ts");
      await loader.setup();

      expect(await cget("User")).toBeTruthy();
      await expect(cget("UserTest")).rejects.toThrow(NameError);

      File.write("post.ts", "export class Post {}");
      File.write("post_test.ts", "export class PostTest {}");

      await loader.reload();

      expect(await cget("Post")).toBeTruthy();
      await expect(cget("PostTest")).rejects.toThrow(NameError);
    });
  });

  it("returns true if a directory is ignored as is", async () => {
    await loader.ignore(thisDir);
    expect(loader.isIgnores(thisDir)).toBeTruthy();
  });

  it("returns true if a file is ignored as is", async () => {
    await loader.ignore(thisFile);
    expect(loader.isIgnores(thisFile)).toBeTruthy();
  });

  it("returns true for a descendant of an ignored directory", async () => {
    await loader.ignore(ascendant);
    expect(loader.isIgnores(thisDir)).toBeTruthy();
  });

  it("returns true for a file in a descendant of an ignored directory", async () => {
    await loader.ignore(ascendant);
    expect(loader.isIgnores(thisFile)).toBeTruthy();
  });

  it("returns false for the directory of an ignored file", async () => {
    await loader.ignore(thisFile);
    expect(!loader.isIgnores(thisDir)).toBeTruthy();
  });

  it("returns false for an ascendant directory of an ignored directory", async () => {
    await loader.ignore(thisDir);
    expect(!loader.isIgnores(ascendant)).toBeTruthy();
  });

  it("returns false if nothing is ignored", () => {
    expect(!loader.isIgnores(thisDir)).toBeTruthy();
    expect(!loader.isIgnores(thisFile)).toBeTruthy();
  });
});
