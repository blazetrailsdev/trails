import { describe, it, expect } from "vitest";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Base } from "../action-controller/base.js";

describe("AbstractController::AssetPaths", () => {
  it("config_accessor defines each asset path reader and writer on ActionController::Base", () => {
    for (const name of [
      "assetHost",
      "assetsDir",
      "javascriptsDir",
      "stylesheetsDir",
      "defaultAssetHostProtocol",
      "relativeUrlRoot",
    ]) {
      expect(rbObjRespondTo(Base, name)).toBe(true);
      expect(rbObjRespondTo(Base, `${name}=`)).toBe(true);
    }
  });

  it("stores the asset host in the controller config", () => {
    class AssetPathsController extends Base {}
    const klass = AssetPathsController as unknown as {
      assetHost: string;
      config(): { assetHost: string };
    };
    klass.assetHost = "http://assets.example.com";
    expect(klass.config().assetHost).toBe("http://assets.example.com");
  });
});
