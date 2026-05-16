import { describe, it, expect } from "vitest";
import { applyAssetPaths, ASSET_PATH_SLOTS } from "./asset-paths.js";

describe("AbstractController::AssetPaths", () => {
  it("installs all six Rails-named slots on the host class", () => {
    class Host {}
    applyAssetPaths(Host);
    for (const slot of ASSET_PATH_SLOTS) {
      expect(Object.hasOwn(Host as object, slot)).toBe(true);
    }
  });

  it("defaults each slot to undefined", () => {
    class Host {}
    applyAssetPaths(Host);
    for (const slot of ASSET_PATH_SLOTS) {
      expect((Host as unknown as Record<string, unknown>)[slot]).toBeUndefined();
    }
  });

  it("does not clobber slots that already carry a value", () => {
    class Host {
      static assetHost = "https://cdn.example.com";
    }
    applyAssetPaths(Host);
    expect(Host.assetHost).toBe("https://cdn.example.com");
  });

  it("does not shadow inherited values when applied to a subclass", () => {
    class Base {
      static assetHost = "https://cdn.example.com";
    }
    class Sub extends Base {}
    applyAssetPaths(Sub);
    expect(Sub.assetHost).toBe("https://cdn.example.com");
    expect(Object.hasOwn(Sub, "assetHost")).toBe(false);
  });

  it("exposes the canonical slot list (matches Rails config_accessor args)", () => {
    expect(ASSET_PATH_SLOTS).toEqual([
      "assetHost",
      "assetsDir",
      "javascriptsDir",
      "stylesheetsDir",
      "defaultAssetHostProtocol",
      "relativeUrlRoot",
    ]);
  });
});
