import { afterEach, describe, expect, it, vi } from "vitest";
import { Cref } from "./cref.js";
import { Loader } from "./loader.js";
import { Registry } from "./registry.js";
import { teardown } from "./test-helpers/loader-test.js";
import { withLoader } from "./zeitwerk.js";

describe("TestUnregister", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Registry.gemLoadersByRootFile = {};
    teardown();
  });

  it("unregister removes the loader from internal state", () => {
    const registry = Registry;
    const loader1 = new Loader();
    const cref1 = new Cref(Object, "dummy1");
    registry.gemLoadersByRootFile["dummy1"] = loader1;
    registry.registerAutoload(loader1, "dummy1");
    Registry.ExplicitNamespaces.register(cref1, loader1);

    const loader2 = new Loader();
    const cref2 = new Cref(Object, "dummy2");
    registry.gemLoadersByRootFile["dummy2"] = loader2;
    registry.registerAutoload(loader2, "dummy2");
    Registry.ExplicitNamespaces.register(cref2, loader2);

    loader1.unregister();

    expect(!registry.loaders.includes(loader1)).toBeTruthy();
    expect(!Object.values(registry.gemLoadersByRootFile).includes(loader1)).toBeTruthy();
    expect(!Object.values(registry.autoloads).includes(loader1)).toBeTruthy();
    expect(!Registry.ExplicitNamespaces.isRegistered(cref1)).toBeTruthy();
    expect(registry.loaders.includes(loader2)).toBeTruthy();
    expect(Object.values(registry.gemLoadersByRootFile).includes(loader2)).toBeTruthy();
    expect(Object.values(registry.autoloads).includes(loader2)).toBeTruthy();
    expect(Registry.ExplicitNamespaces.isRegistered(cref2) === loader2).toBeTruthy();
  });

  it("with_loader yields and unregisters", async () => {
    const unregister = vi.spyOn(Loader.prototype, "unregister");
    await withLoader((l) => {
      expect(l).toBe(Registry.loaders.at(-1));
    });
    expect(unregister.mock.calls.length).toBeTruthy();
  });

  it("with_loader yields and unregisters, even if an exception happens", async () => {
    const unregister = vi.spyOn(Loader.prototype, "unregister");
    await withLoader(() => {
      throw new Error();
    }).catch(() => null);
    expect(unregister.mock.calls.length).toBeTruthy();
  });
});
