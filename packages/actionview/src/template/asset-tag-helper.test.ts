import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import {
  assetPath,
  computeAssetPath,
  publicComputeAssetPath,
  pathToStylesheet,
  stylesheetPath,
  type AssetUrlHelperHost,
} from "../helpers/asset-url-helper.js";
import { stylesheetLinkTag, type AssetTagHelperHost } from "../helpers/asset-tag-helper.js";

const request = { baseUrl: "http://www.example.com", protocol: "http://" };
const host = {
  computeAssetPath,
  publicComputeAssetPath,
  request,
} as unknown as AssetTagHelperHost;

const assertDomEqual = (expected: string, actual: unknown): void => {
  expect(String(actual)).toEqual(expected);
};

const StylePathToTag: [() => string, string][] = [
  [() => stylesheetPath.call(host, "bank"), "/stylesheets/bank.css"],
  [() => stylesheetPath.call(host, "bank.css"), "/stylesheets/bank.css"],
  [() => stylesheetPath.call(host, "subdir/subdir"), "/stylesheets/subdir/subdir.css"],
  [() => stylesheetPath.call(host, "/subdir/subdir.css"), "/subdir/subdir.css"],
  [() => stylesheetPath.call(host, "style.min"), "/stylesheets/style.min.css"],
  [() => stylesheetPath.call(host, "style.min.css"), "/stylesheets/style.min.css"],
];

const PathToStyleToTag: [() => string, string][] = [
  [() => pathToStylesheet.call(host, "style"), "/stylesheets/style.css"],
  [() => pathToStylesheet.call(host, "style.css"), "/stylesheets/style.css"],
  [() => pathToStylesheet.call(host, "dir/file"), "/stylesheets/dir/file.css"],
  [() => pathToStylesheet.call(host, "/dir/file.rcss", { extname: false }), "/dir/file.rcss"],
  [() => pathToStylesheet.call(host, "/dir/file", { extname: ".rcss" }), "/dir/file.rcss"],
];

const link = (...args: unknown[]): unknown => stylesheetLinkTag.call(host, ...args);

const StyleLinkToTag: [() => unknown, string][] = [
  [() => link("bank"), '<link rel="stylesheet" href="/stylesheets/bank.css" />'],
  [() => link("bank.css"), '<link rel="stylesheet" href="/stylesheets/bank.css" />'],
  [() => link("/elsewhere/file"), '<link rel="stylesheet" href="/elsewhere/file.css" />'],
  [() => link("subdir/subdir"), '<link rel="stylesheet" href="/stylesheets/subdir/subdir.css" />'],
  [
    () => link("bank", { media: "all" }),
    '<link rel="stylesheet" href="/stylesheets/bank.css" media="all" />',
  ],
  [
    () => link("bank", { host: "assets.example.com" }),
    '<link rel="stylesheet" href="http://assets.example.com/stylesheets/bank.css" />',
  ],
  [
    () => link("http://www.example.com/styles/style"),
    '<link rel="stylesheet" href="http://www.example.com/styles/style" />',
  ],
  [
    () => link("http://www.example.com/styles/style.css"),
    '<link rel="stylesheet" href="http://www.example.com/styles/style.css" />',
  ],
  [
    () => link("//www.example.com/styles/style.css"),
    '<link rel="stylesheet" href="//www.example.com/styles/style.css" />',
  ],
];

describe("AssetTagHelperTest", () => {
  it("asset path tag raises an error for nil source", () => {
    let e!: Error;
    try {
      assetPath.call(host, null);
    } catch (error) {
      e = error as Error;
    }
    expect(() => assetPath.call(host, null)).toThrow(ArgumentError);
    expect(e.message).toEqual("nil is not a valid asset source");
  });

  it("asset path tag to not create duplicate slashes", () => {
    const controller = {
      computeAssetPath,
      publicComputeAssetPath,
      request,
      config: { assetHost: "host/" } as Record<string, string>,
    } as unknown as AssetUrlHelperHost & { config: Record<string, string> };
    assertDomEqual("http://host/foo", assetPath.call(controller, "foo"));

    controller.config["relativeUrlRoot"] = "/some/root/";
    assertDomEqual("http://host/some/root/foo", assetPath.call(controller, "foo"));
  });

  it("stylesheet path", () => {
    StylePathToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("path to stylesheet alias for stylesheet path", () => {
    PathToStyleToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("stylesheet link tag", () => {
    StyleLinkToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });
});
