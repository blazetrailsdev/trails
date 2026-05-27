import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { getPathAsync } from "@blazetrails/activesupport";
import { FileSystemResolver } from "./resolver/file-system-resolver.js";
import { InMemoryResolver } from "./resolver/in-memory-resolver.js";
import { PathRegistry } from "./path-registry.js";

beforeAll(async () => {
  await getPathAsync();
});

afterEach(() => {
  PathRegistry.reset();
});

describe("PathRegistry", () => {
  test("allResolvers returns empty array when nothing is registered", () => {
    expect(PathRegistry.allResolvers()).toEqual([]);
  });

  test("castFileSystemResolvers converts string paths to FileSystemResolver instances", () => {
    const resolvers = PathRegistry.castFileSystemResolvers(["/app/views"]);
    expect(resolvers).toHaveLength(1);
    expect(resolvers[0]).toBeInstanceOf(FileSystemResolver);
  });

  test("castFileSystemResolvers deduplicates the same path", () => {
    const [a] = PathRegistry.castFileSystemResolvers(["/app/views"]);
    const [b] = PathRegistry.castFileSystemResolvers(["/app/views"]);
    expect(a).toBe(b);
  });

  test("castFileSystemResolvers passes through existing resolver instances unchanged", () => {
    const existing = new InMemoryResolver();
    const result = PathRegistry.castFileSystemResolvers([existing]);
    expect(result[0]).toBe(existing);
  });

  test("allResolvers returns registered file system resolvers", () => {
    PathRegistry.castFileSystemResolvers(["/app/views", "/gem/views"]);
    const all = PathRegistry.allResolvers();
    expect(all).toHaveLength(2);
    expect(all.every((r) => r instanceof FileSystemResolver)).toBe(true);
  });

  test("setViewPaths + getViewPaths round-trips per class", () => {
    class MyController {}
    const paths = [new InMemoryResolver()];
    PathRegistry.setViewPaths(MyController, paths);
    expect(PathRegistry.getViewPaths(MyController)).toBe(paths);
  });

  test("getViewPaths walks the prototype chain", () => {
    class Base {}
    class Child extends Base {}
    const paths = [new InMemoryResolver()];
    PathRegistry.setViewPaths(Base, paths);
    expect(PathRegistry.getViewPaths(Child)).toBe(paths);
  });

  test("fileSystemResolverHooks fires when a new resolver is built", () => {
    const hook = vi.fn();
    PathRegistry.fileSystemResolverHooks.push(hook);
    PathRegistry.castFileSystemResolvers(["/app/views"]);
    expect(hook).toHaveBeenCalledOnce();
    PathRegistry.castFileSystemResolvers(["/app/views"]);
    expect(hook).toHaveBeenCalledOnce();
  });

  test("allFileSystemResolvers returns only file system resolvers", () => {
    PathRegistry.castFileSystemResolvers(["/app/views"]);
    expect(PathRegistry.allFileSystemResolvers()).toHaveLength(1);
    expect(PathRegistry.allFileSystemResolvers()[0]).toBeInstanceOf(FileSystemResolver);
  });
});
