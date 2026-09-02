import { describe, it, expect, beforeEach } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { assetPath, type AssetUrlHelperHost } from "../helpers/asset-url-helper.js";
import { stylesheetLinkTag } from "../helpers/asset-tag-helper.js";

/** `class FakeRequest` (asset_tag_helper_test.rb:27-34). */
const FakeRequest = { protocol: "http://", baseUrl: "http://www.example.com" };

let host: AssetUrlHelperHost;

beforeEach(() => {
  host = { config: {}, request: { ...FakeRequest } };
});

describe("AssetTagHelperTest", () => {
  it("asset path tag raises an error for nil source", () => {
    const e = (() => {
      try {
        assetPath.call(host, null);
      } catch (error) {
        return error as Error;
      }
    })();
    expect(e).toBeInstanceOf(ArgumentError);
    expect(e!.message).toBe("nil is not a valid asset source");
  });

  it("stylesheet link tag is html safe", () => {
    expect(stylesheetLinkTag.call(host, "dir/file").htmlSafe).toBeTruthy();
    expect(stylesheetLinkTag.call(host, "dir/other/file", "dir/file2").htmlSafe).toBeTruthy();
  });
});
