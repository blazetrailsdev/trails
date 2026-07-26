import { describe, it, expect } from "vitest";
import { ASSET_PATH_SLOTS } from "./asset-paths.js";

describe("AbstractController::AssetPaths", () => {
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
