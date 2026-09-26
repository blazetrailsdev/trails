import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getPath } from "@blazetrails/ruby-compat";
import { ViewReloader } from "./cache-expiry.js";
import { DetailsKey } from "./lookup-context.js";
import { PathRegistry } from "./path-registry.js";

class FakeWatcher {
  static instances: FakeWatcher[] = [];
  static onInitialize: (() => void) | null = null;
  changed = false;
  executed = 0;

  constructor(
    public files: string[],
    public dirs: string[],
    public block: () => void | Promise<void>,
  ) {
    FakeWatcher.onInitialize?.();
    FakeWatcher.instances.push(this);
  }

  isUpdated(): boolean {
    return this.changed;
  }

  execute(): void {
    this.executed++;
    this.changed = false;
    this.block();
  }
}

beforeAll(() => {
  getPath();
});

afterEach(() => {
  PathRegistry.reset();
  FakeWatcher.instances = [];
  FakeWatcher.onInitialize = null;
});

describe("ActionView::CacheExpiry::ViewReloader", () => {
  it("registers rebuild_watcher into PathRegistry.file_system_resolver_hooks at construction", () => {
    expect(PathRegistry.fileSystemResolverHooks).toHaveLength(0);
    new ViewReloader({ watcher: FakeWatcher });
    expect(PathRegistry.fileSystemResolverHooks).toHaveLength(1);
  });

  it("execute is a no-op when no watcher has been built", () => {
    PathRegistry.castFileSystemResolvers(["/app/views"]);
    const reloader = new ViewReloader({ watcher: FakeWatcher });
    expect(reloader.execute()).toBeUndefined();
    expect(FakeWatcher.instances).toHaveLength(0);
  });

  it("updated? lazily builds a watcher over the uniq, sorted file-system resolver paths", () => {
    PathRegistry.castFileSystemResolvers(["/b/views", "/a/views"]);
    const reloader = new ViewReloader({ watcher: FakeWatcher });
    expect(reloader.isUpdated()).toBe(false);
    expect(FakeWatcher.instances).toHaveLength(1);
    expect(FakeWatcher.instances[0].files).toEqual([]);
    expect(FakeWatcher.instances[0].dirs).toEqual(["/a/views", "/b/views"]);
  });

  it("appending a resolver after construction rebuilds the watcher", () => {
    PathRegistry.castFileSystemResolvers(["/a/views"]);
    const reloader = new ViewReloader({ watcher: FakeWatcher });
    PathRegistry.castFileSystemResolvers(["/b/views"]);
    expect(FakeWatcher.instances).toHaveLength(0);

    reloader.isUpdated();
    PathRegistry.castFileSystemResolvers(["/c/views"]);
    expect(FakeWatcher.instances).toHaveLength(2);
    expect(FakeWatcher.instances[1].dirs).toEqual(["/a/views", "/b/views", "/c/views"]);
  });

  it("does not rebuild when the watched dirs are unchanged", () => {
    PathRegistry.castFileSystemResolvers(["/a/views"]);
    const reloader = new ViewReloader({ watcher: FakeWatcher });
    reloader.isUpdated();
    for (const hook of PathRegistry.fileSystemResolverHooks) hook();
    expect(FakeWatcher.instances).toHaveLength(1);
  });

  it("a change landing on the old watcher while the new one initializes survives the rebuild", () => {
    PathRegistry.castFileSystemResolvers(["/a/views"]);
    const reloader = new ViewReloader({ watcher: FakeWatcher });
    reloader.isUpdated();
    const oldWatcher = FakeWatcher.instances[0];
    FakeWatcher.onInitialize = () => {
      oldWatcher.changed = true;
    };

    PathRegistry.castFileSystemResolvers(["/b/views"]);
    expect(FakeWatcher.instances).toHaveLength(2);
    expect(FakeWatcher.instances[1].isUpdated()).toBe(false);
    expect(reloader.isUpdated()).toBe(true);

    reloader.execute();
    expect(FakeWatcher.instances[1].executed).toBe(1);
    expect(reloader.isUpdated()).toBe(false);
  });

  it("reload! clears DetailsKey and empties the digest cache", () => {
    PathRegistry.castFileSystemResolvers(["/a/views"]);
    const reloader = new ViewReloader({ watcher: FakeWatcher });
    reloader.isUpdated();
    DetailsKey.digestCache({ formats: ["html"] }).set("template", "digest");
    expect(DetailsKey.digestCaches()).toHaveLength(1);

    reloader.execute();
    expect(DetailsKey.digestCaches()).toHaveLength(0);
  });
});
