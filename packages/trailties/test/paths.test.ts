import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  File,
  fsAdapterConfig,
  RuntimeError,
  registerFsAdapter,
  type FsAdapter,
  type PathAdapter,
} from "@blazetrails/ruby-compat";
import { assertRaises } from "@blazetrails/activesupport/testing/assertions";
import { Root } from "../lib/paths.js";

const posixPath: PathAdapter = {
  join: (...p) => p.join("/").replace(/\/+/g, "/"),
  dirname: (p) => p.replace(/\/[^/]*$/, "") || "/",
  basename: (p) => p.split("/").pop() ?? "",
  resolve: (...p) =>
    p
      .reduce((o, x) => (!x ? o : x.startsWith("/") ? x : o ? `${o}/${x}` : x), "")
      .replace(/\/+/g, "/"),
  extname: (p) => (p.lastIndexOf(".") > 0 ? p.slice(p.lastIndexOf(".")) : ""),
  isAbsolute: (p) => p.startsWith("/"),
  sep: "/",
};
const stat = (d: boolean) => ({
  isDirectory: () => d,
  isFile: () => !d,
  size: 0,
  atime: new Date(),
  mtime: new Date(),
});
function install(isDir = false): void {
  registerFsAdapter(
    "test",
    {
      cwd: () => "/",
      exists: async () => true,
      stat: async () => stat(isDir),
      statSync: () => stat(isDir),
    } as unknown as FsAdapter,
    posixPath,
  );
  fsAdapterConfig.adapter = "test";
}

const PREV = fsAdapterConfig.adapter;
let root: Root;
beforeEach(() => {
  install(false);
  root = new Root("/foo/bar");
});
afterEach(() => {
  fsAdapterConfig.adapter = PREV;
});

describe("PathsTest", () => {
  test("the paths object is initialized with the root path", async () => {
    const root = new Root("/fiz/baz");
    expect(root.path).toEqual("/fiz/baz");
  });

  test("the paths object can be initialized with nil", async () => {
    expect(() => new Root(null)).not.toThrow();
  });

  test("creating a root level path with options", async () => {
    root.add("app", { with: "/foo/bar" });
    expect(root.get("app")!.toA()).toEqual(["/foo/bar"]);
  });

  test("creating a child level path with option", async () => {
    root.add("app");
    root.add("app/models", { with: "/foo/bar/baz" });
    expect(root.get("app/models")!.toA()).toEqual(["/foo/bar/baz"]);
  });

  test("child level paths are relative from the root", async () => {
    root.add("app");
    root.add("app/models", { with: "baz" });
    expect(root.get("app/models")!.toA()).toEqual(["/foo/bar/baz"]);
  });

  test("absolute current path", async () => {
    root.add("config");
    root.add("config/locales");

    expect(root.get("config/locales")!.absoluteCurrent()).toEqual("/foo/bar/config/locales");
  });

  test("adding multiple physical paths using <<", async () => {
    root.add("app");
    root.get("app")!.push("app2");
    expect(root.get("app")!.toA()).toEqual(["/foo/bar/app", "/foo/bar/app2"]);
  });

  test("adding multiple physical paths using concat", async () => {
    root.add("app");
    root.get("app")!.concat(["app2", "/app3"]);
    expect(root.get("app")!.toA()).toEqual(["/foo/bar/app", "/foo/bar/app2", "/app3"]);
  });

  test("adding multiple physical paths using #unshift", async () => {
    root.add("app");
    root.get("app")!.unshift("app2");
    expect(root.get("app")!.toA()).toEqual(["/foo/bar/app2", "/foo/bar/app"]);
  });

  test("it is possible to add a path that should be autoloaded only once", async () => {
    install(true);
    root = new Root("/foo/bar");
    root.add("app", { with: "/app" });
    root.get("app")!.autoloadOnceBang();
    expect(root.get("app")!.isAutoloadOnce()).toBe(true);
    expect(root.autoloadOnce()).toContain(root.get("app")!.expanded()[0]);
  });

  test("it is possible to add a path without assignment and specify it should be loaded only once", async () => {
    install(true);
    root = new Root("/foo/bar");
    root.add("app", { with: "/app", autoloadOnce: true });
    expect(root.get("app")!.isAutoloadOnce()).toBe(true);
    expect(root.autoloadOnce()).toContain("/app");
  });

  test("it is possible to add multiple paths without assignment and specify it should be loaded only once", async () => {
    install(true);
    root = new Root("/foo/bar");
    root.add("app", { with: ["/app", "/app2"], autoloadOnce: true });
    expect(root.get("app")!.isAutoloadOnce()).toBe(true);
    expect(root.autoloadOnce()).toContain("/app");
    expect(root.autoloadOnce()).toContain("/app2");
  });

  test("making a path autoload_once more than once only includes it once in @root.load_once", async () => {
    install(true);
    root = new Root("/foo/bar");
    root.set("app", "/app");
    root.get("app")!.autoloadOnceBang();
    root.get("app")!.autoloadOnceBang();
    expect(root.autoloadOnce().filter((p) => p === root.get("app")!.expanded()[0]).length).toEqual(
      1,
    );
  });

  test("paths added to a load_once path should be added to the autoload_once collection", async () => {
    install(true);
    root = new Root("/foo/bar");
    root.set("app", "/app");
    root.get("app")!.autoloadOnceBang();
    root.get("app")!.push("/app2");
    expect(root.autoloadOnce().length).toEqual(2);
  });

  test("it is possible to mark a path as eager loaded", async () => {
    install(true);
    root = new Root("/foo/bar");
    root.set("app", "/app");
    root.get("app")!.eagerLoadBang();
    expect(root.get("app")!.isEagerLoad()).toBe(true);
    expect(root.eagerLoad()).toContain(root.get("app")!.toA()[0]);
  });

  test("it is possible to add a path without assignment and mark it as eager", async () => {
    install(true);
    root = new Root("/foo/bar");
    root.add("app", { with: "/app", eagerLoad: true });
    expect(root.get("app")!.isEagerLoad()).toBe(true);
    expect(root.eagerLoad()).toContain("/app");
  });

  test("it is possible to add multiple paths without assignment and mark them as eager", async () => {
    install(true);
    root = new Root("/foo/bar");
    root.add("app", { with: ["/app", "/app2"], eagerLoad: true });
    expect(root.get("app")!.isEagerLoad()).toBe(true);
    expect(root.eagerLoad()).toContain("/app");
    expect(root.eagerLoad()).toContain("/app2");
  });

  test("it is possible to create a path without assignment and mark it both as eager and load once", async () => {
    install(true);
    root = new Root("/foo/bar");
    root.add("app", { with: "/app", eagerLoad: true, autoloadOnce: true });
    expect(root.get("app")!.isEagerLoad()).toBe(true);
    expect(root.get("app")!.isAutoloadOnce()).toBe(true);
    expect(root.eagerLoad()).toContain("/app");
    expect(root.autoloadOnce()).toContain("/app");
  });

  test("making a path eager more than once only includes it once in @root.eager_paths", async () => {
    install(true);
    root = new Root("/foo/bar");
    root.set("app", "/app");
    root.get("app")!.eagerLoadBang();
    root.get("app")!.eagerLoadBang();
    expect(root.eagerLoad().filter((p) => p === root.get("app")!.expanded()[0]).length).toEqual(1);
  });

  test("paths added to an eager_load path should be added to the eager_load collection", async () => {
    install(true);
    root = new Root("/foo/bar");
    root.set("app", "/app");
    root.get("app")!.eagerLoadBang();
    root.get("app")!.push("/app2");
    expect(root.eagerLoad().length).toEqual(2);
  });

  test("it should be possible to add a path's default glob", async () => {
    root.set("app", "/app");
    root.get("app")!.glob = "*.rb";
    expect(root.get("app")!.glob).toEqual("*.rb");
  });

  test("it should be possible to get extensions by glob", async () => {
    root.set("app", "/app");
    root.get("app")!.glob = "*.{rb,yml}";
    expect(root.get("app")!.extensions()).toEqual(["rb", "yml"]);
  });

  test("it should be possible to override a path's default glob without assignment", async () => {
    root.add("app", { with: "/app", glob: "*.rb" });
    expect(root.get("app")!.glob).toEqual("*.rb");
  });

  test("it should be possible to replace a path and persist the original paths glob", async () => {
    root.add("app", { glob: "*.rb" });
    root.set("app", "app2");
    expect(root.get("app")!.toA()).toEqual(["/foo/bar/app2"]);
    expect(root.get("app")!.glob).toEqual("*.rb");
  });

  test("a path can be added to the load path", async () => {
    install(true);
    root = new Root("/foo/bar");
    root.set("app", "app");
    root.get("app")!.loadPathBang();
    root.set("app/models", "app/models");
    expect(root.loadPaths()).toEqual(["/foo/bar/app"]);
  });

  test("a path can be marked as autoload path", async () => {
    install(true);
    root = new Root("/foo/bar");
    root.set("app", "app");
    root.get("app")!.autoloadBang();
    root.set("app/models", "app/models");
    expect(root.autoloadPaths()).toEqual(["/foo/bar/app"]);
  });

  test("a path can be marked as autoload on creation", async () => {
    install(true);
    root = new Root("/foo/bar");
    root.add("app", { with: "/app", autoload: true });
    expect(root.get("app")!.isAutoload()).toBe(true);
    expect(root.autoloadPaths()).toEqual(["/app"]);
  });

  test("load paths does include directories", async () => {
    install(true);
    root = new Root("/foo/bar");
    root.add("app/special", {
      autoloadOnce: true,
      eagerLoad: true,
      autoload: true,
      loadPath: true,
    });
    expect(root.autoloadOnce()).toEqual(["/foo/bar/app/special"]);
    expect(root.eagerLoad()).toEqual(["/foo/bar/app/special"]);
    expect(root.autoloadPaths()).toEqual(["/foo/bar/app/special"]);
    expect(root.loadPaths()).toEqual(["/foo/bar/app/special"]);
  });
  test("a paths object initialized with nil can be updated", async () => {
    const r = new Root(null);
    r.add("app");
    r.path = "/root";
    expect(r.get("app")!.toAry()).toEqual(["app"]);
    expect(r.get("app")!.toA()).toEqual(["/root/app"]);
  });

  test("creating a root level path", async () => {
    root.add("app");
    expect(root.get("app")!.toA()).toEqual(["/foo/bar/app"]);
  });

  test("raises exception if root path never set", async () => {
    const r = new Root(null);
    r.add("app");
    expect(() => r.get("app")!.toA()).toThrow();
  });

  test("creating a child level path", async () => {
    root.add("app");
    root.add("app/models");
    expect(root.get("app/models")!.toA()).toEqual(["/foo/bar/app/models"]);
  });

  test("adding multiple physical paths as an array", async () => {
    root.add("app", { with: ["/app", "/app2"] });
    expect(root.get("app")!.toA()).toEqual(["/app", "/app2"]);
  });

  test("adding multiple physical paths using #push", async () => {
    root.add("app");
    root.get("app")!.push("app2");
    expect(root.get("app")!.toA()).toEqual(["/foo/bar/app", "/foo/bar/app2"]);
  });

  test("a path can be added to the load path on creation", async () => {
    install(true);
    root = new Root("/foo/bar");
    root.add("app", { with: "/app", loadPath: true });
    expect(root.get("app")!.isLoadPath()).toBeTruthy();
    expect(root.loadPaths()).toEqual(["/app"]);
  });

  test("load paths does NOT include files", async () => {
    root.add("app/README.md", {
      autoloadOnce: true,
      eagerLoad: true,
      autoload: true,
      loadPath: true,
    });
    expect(root.autoloadOnce()).toEqual([]);
    expect(root.eagerLoad()).toEqual([]);
    expect(root.autoloadPaths()).toEqual([]);
    expect(root.loadPaths()).toEqual([]);
  });

  test("it is possible to remove a path that should be autoloaded only once", async () => {
    root.add("app", { with: "/app" });
    root.get("app")!.autoloadOnceBang();
    expect(root.get("app")!.isAutoloadOnce()).toBeTruthy();

    root.get("app")!.skipAutoloadOnceBang();
    expect(root.get("app")!.isAutoloadOnce()).toBeFalsy();
    expect(root.autoloadOnce()).not.toContain(root.get("app")!.expanded()[0]);
  });

  test("it is possible to skip a path from eager loading", async () => {
    root.add("app", { with: "/app" });
    root.get("app")!.eagerLoadBang();
    expect(root.get("app")!.isEagerLoad()).toBeTruthy();

    root.get("app")!.skipEagerLoadBang();
    expect(root.get("app")!.isEagerLoad()).toBeFalsy();
    expect(root.eagerLoad()).not.toContain(root.get("app")!.toA()[0]);
  });
});

describe("PathsIntegrationTest", () => {
  test("A failed symlink is still a valid file", async () => {
    registerFsAdapter(
      "sym",
      {
        cwd: () => "/",
        exists: async () => false,
        existsSync: () => false,
        stat: async () => stat(false),
        statSync: () => stat(false),
        lstat: async () => ({ ...stat(false), isSymbolicLink: () => true }),
        lstatSync: () => ({ ...stat(false), isSymbolicLink: () => true }),
      } as unknown as FsAdapter,
      posixPath,
    );
    fsAdapterConfig.adapter = "sym";
    expect(File.isSymlink("/foo/bar.rb")).toEqual(true);

    root = new Root("/foo");
    root.add("bar.rb");

    const exception = await assertRaises([RuntimeError], {}, () => root.get("bar.rb")!.existent());
    expect(exception.message).toMatch(File.expandPath("/foo/bar.rb"));
  });
});
