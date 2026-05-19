import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  fsAdapterConfig,
  registerFsAdapter,
  type FsAdapter,
  type PathAdapter,
} from "@blazetrails/activesupport";
import { Root } from "./paths.js";

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

describe("Rails::Paths", () => {
  test("a paths object initialized with nil can be updated", async () => {
    const r = new Root(null);
    r.add("app");
    r.path = "/root";
    expect(r.get("app")!.toAry()).toEqual(["app"]);
    expect(await r.get("app")!.toA()).toEqual(["/root/app"]);
  });

  test("creating a root level path", async () => {
    root.add("app");
    expect(await root.get("app")!.toA()).toEqual(["/foo/bar/app"]);
  });

  test("raises exception if root path never set", async () => {
    const r = new Root(null);
    r.add("app");
    await expect(r.get("app")!.toA()).rejects.toThrow();
  });

  test("creating a child level path", async () => {
    root.add("app");
    root.add("app/models");
    expect(await root.get("app/models")!.toA()).toEqual(["/foo/bar/app/models"]);
  });

  test("adding multiple physical paths as an array", async () => {
    root.add("app", { with: ["/app", "/app2"] });
    expect(await root.get("app")!.toA()).toEqual(["/app", "/app2"]);
  });

  test("adding multiple physical paths using #push", async () => {
    root.add("app");
    root.get("app")!.push("app2");
    expect(await root.get("app")!.toA()).toEqual(["/foo/bar/app", "/foo/bar/app2"]);
  });

  test("a path can be added to the load path on creation", async () => {
    install(true);
    root = new Root("/foo/bar");
    root.add("app", { with: "/app", loadPath: true });
    expect(root.get("app")!.isLoadPath()).toBe(true);
    expect(await root.loadPaths()).toEqual(["/app"]);
  });

  test("load paths does NOT include files", async () => {
    root.add("app/README.md", { loadPath: true });
    expect(await root.loadPaths()).toEqual([]);
  });

  test("A failed symlink is still a valid file", async () => {
    registerFsAdapter(
      "sym",
      {
        cwd: () => "/",
        exists: async () => false,
        stat: async () => stat(false),
        statSync: () => stat(false),
        lstat: async () => ({ ...stat(false), isSymbolicLink: () => true }),
      } as unknown as FsAdapter,
      posixPath,
    );
    fsAdapterConfig.adapter = "sym";
    root = new Root("/foo");
    root.add("bar.rb");
    await expect(root.get("bar.rb")!.existent()).rejects.toThrow(/symlink/);
  });
});
