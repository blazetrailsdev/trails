/* eslint-disable @typescript-eslint/no-explicit-any */
import { FileUtils, TopLevel, isModuleObject } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Cref } from "./cref.js";
import type { Loader } from "./loader.js";
import { ExplicitNamespaces } from "./registry/explicit-namespaces.js";
import { newLoader, teardown, withFiles, withSetup } from "./test-helpers/loader-test.js";

const top = TopLevel as Record<string, any>;
const autoload = (cname: string) => new Cref(Object, cname).isAutoload();

describe("TestAutovivification", () => {
  class Namespace {
    declare static Admin: any;
    declare static Foo: any;
  }
  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
    delete Namespace.Admin;
    delete Namespace.Foo;
  });
  afterEach(teardown);

  it("autoloads a simple constant in an autovivified module (Object)", async () => {
    await withSetup(loader, [["admin/x.ts", "export const X = true"]], {}, async () => {
      await loader.eagerLoad();
      expect(isModuleObject(top.Admin)).toBe(true);
      expect(top.Admin.X).toBe(true);
    });
  });

  it("autoloads a simple constant in an autovivified module (Namespace)", async () => {
    const files: [string, string][] = [["admin/x.ts", "export const X = true"]];
    await withSetup(loader, files, { namespace: Namespace }, async () => {
      await loader.eagerLoad();
      expect(isModuleObject(Namespace.Admin)).toBe(true);
      expect(Namespace.Admin.X).toBe(true);
    });
  });

  it("autovivifies several levels in a row (Object)", async () => {
    await withSetup(loader, [["foo/bar/baz/woo.ts", "export const Woo = true"]], {}, async () => {
      await loader.eagerLoad();
      expect(top.Foo.Bar.Baz.Woo).toBe(true);
    });
  });

  it("autovivifies several levels in a row (Namespace)", async () => {
    const files: [string, string][] = [["foo/bar/baz/woo.ts", "export const Woo = true"]];
    await withSetup(loader, files, { namespace: Namespace }, async () => {
      await loader.eagerLoad();
      expect(Namespace.Foo.Bar.Baz.Woo).toBe(true);
    });
  });

  const shared: [string, string][] = [
    ["rd1/admin/hotel.ts", "export class Hotel {}"],
    ["rd2/admin/hotels-controller.ts", "export class HotelsController {}"],
  ];

  it("autoloads several constants from the same namespace (Object)", async () => {
    await withSetup(loader, shared, {}, async () => {
      await loader.eagerLoad();
      expect(top.Admin.Hotel).toBeDefined();
      expect(top.Admin.HotelsController).toBeDefined();
    });
  });

  it("autoloads several constants from the same namespace (Namespace)", async () => {
    await withSetup(loader, shared, { namespace: Namespace }, async () => {
      await loader.eagerLoad();
      expect(Namespace.Admin.Hotel).toBeDefined();
      expect(Namespace.Admin.HotelsController).toBeDefined();
    });
  });

  it("does not register the namespace as explicit", async () => {
    const files: [string, string][] = [
      ["rd1/admin/x.ts", "export const X = true"],
      ["rd2/admin/y.ts", "export const Y = true"],
    ];
    await withSetup(loader, files, {}, () => {
      expect(ExplicitNamespaces.isRegistered(new Cref(Object, "Admin"))).toBeNull();
    });
  });

  it("autovivification is synchronized", async () => {
    await withSetup(loader, [["admin/v2/user.ts", "export class User {}"]], {}, async () => {
      const admin = (await new Cref(Object, "Admin").autoloadGet()) as object;

      let calls = 0;
      loader.onLoad("Admin::V2", () => (calls += 1));

      const cref = new Cref(admin, "V2");
      const [a, b] = await Promise.all([cref.autoloadGet(), cref.autoloadGet()]);

      expect(a).toBe(b);
      expect(calls).toEqual(1);
    });
  });

  it("defines no namespace for empty directories", async () => {
    await withFiles([], async () => {
      FileUtils.mkdirP("foo");
      await loader.pushDir(".");
      await loader.setup();
      expect(autoload("Foo")).toBeNull();
    });
  });

  it("defines no namespace for empty directories (recursively)", async () => {
    await withFiles([], async () => {
      FileUtils.mkdirP("foo/bar/baz");
      await loader.pushDir(".");
      await loader.setup();
      expect(autoload("Foo")).toBeNull();
    });
  });

  it("defines no namespace for directories whose files are all non-Ruby", async () => {
    const files: [string, string][] = [
      ["tasks/newsletter.rake", ""],
      ["assets/.keep", ""],
    ];
    await withSetup(loader, files, { dirs: ["."] }, () => {
      expect(autoload("Tasks")).toBeNull();
      expect(autoload("Assets")).toBeNull();
    });
  });

  it("defines no namespace for directories whose files are all non-Ruby (recursively)", async () => {
    const files: [string, string][] = [
      ["tasks/product/newsletter.rake", ""],
      ["assets/css/.keep", ""],
    ];
    await withSetup(loader, files, { dirs: ["."] }, () => {
      expect(autoload("Tasks")).toBeNull();
      expect(autoload("Assets")).toBeNull();
    });
  });

  it("defines no namespace for directories whose Ruby files are all ignored", async () => {
    await withSetup(loader, [["foo/bar/ignored.ts", "throw 1"]], { dirs: ["."] }, () => {
      expect(autoload("Foo")).toBeNull();
    });
  });

  it("defines no namespace for directories that have Ruby files below ignored directories", async () => {
    await withSetup(loader, [["foo/ignored/baz.ts", "throw 1"]], { dirs: ["."] }, () => {
      expect(autoload("Foo")).toBeNull();
    });
  });
});
