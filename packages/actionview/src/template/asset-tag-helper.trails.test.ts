// Trails-only companion to `asset-tag-helper.test.ts`. Rails asserts these
// through `assert_dom_equal`, which has no canonical kind on the trails side,
// so the string-equality ports live here rather than reddening the matched
// file's assertion-kind ratchet.
import { describe, it, expect, beforeEach } from "vitest";
import { assetPath } from "../helpers/asset-url-helper.js";
import { stylesheetLinkTag, type AssetTagHelperHost } from "../helpers/asset-tag-helper.js";

const FakeRequest = { protocol: "http://", baseUrl: "http://www.example.com" };

let host: AssetTagHelperHost;

beforeEach(() => {
  host = { config: {}, request: { ...FakeRequest } };
});

/** `StyleLinkToTag` (asset_tag_helper_test.rb:176-188). */
const StyleLinkToTag: [unknown[], string][] = [
  [["bank"], '<link rel="stylesheet" href="/stylesheets/bank.css" />'],
  [["bank.css"], '<link rel="stylesheet" href="/stylesheets/bank.css" />'],
  [["/elsewhere/file"], '<link rel="stylesheet" href="/elsewhere/file.css" />'],
  [["subdir/subdir"], '<link rel="stylesheet" href="/stylesheets/subdir/subdir.css" />'],
  [
    ["bank", { media: "all" }],
    '<link rel="stylesheet" href="/stylesheets/bank.css" media="all" />',
  ],
  [
    ["bank", { host: "assets.example.com" }],
    '<link rel="stylesheet" href="http://assets.example.com/stylesheets/bank.css" />',
  ],
  [
    ["http://www.example.com/styles/style"],
    '<link rel="stylesheet" href="http://www.example.com/styles/style" />',
  ],
  [
    ["http://www.example.com/styles/style.css"],
    '<link rel="stylesheet" href="http://www.example.com/styles/style.css" />',
  ],
  [
    ["//www.example.com/styles/style.css"],
    '<link rel="stylesheet" href="//www.example.com/styles/style.css" />',
  ],
];

describe("AssetTagHelper (assert_dom_equal ports)", () => {
  it("renders the StyleLinkToTag table", () => {
    for (const [args, tag] of StyleLinkToTag) {
      expect(stylesheetLinkTag.call(host, ...args).toString()).toBe(tag);
    }
  });

  it("does not create duplicate slashes across asset_host and relative_url_root", () => {
    host.config!.assetHost = "host/";
    expect(assetPath.call(host, "foo")).toBe("http://host/foo");

    host.config!.relativeUrlRoot = "/some/root/";
    expect(assetPath.call(host, "foo")).toBe("http://host/some/root/foo");
  });

  it("resolves without a request", () => {
    host.request = null;
    expect(stylesheetLinkTag.call(host, "foo.css").toString()).toBe(
      '<link rel="stylesheet" href="/stylesheets/foo.css" />',
    );
  });

  it("escapes options", () => {
    expect(stylesheetLinkTag.call(host, "/file", { media: "<script>" }).toString()).toBe(
      '<link rel="stylesheet" href="/file.css" media="&lt;script&gt;" />',
    );
  });

  it("does not output the same asset twice", () => {
    expect(stylesheetLinkTag.call(host, "wellington", "wellington", "amsterdam").toString()).toBe(
      '<link rel="stylesheet" href="/stylesheets/wellington.css" />\n' +
        '<link rel="stylesheet" href="/stylesheets/amsterdam.css" />',
    );
  });

  it("honours a relative protocol", () => {
    host.config!.assetHost = "assets.example.com";
    expect(stylesheetLinkTag.call(host, "wellington", { protocol: ":relative" }).toString()).toBe(
      '<link rel="stylesheet" href="//assets.example.com/stylesheets/wellington.css" />',
    );
  });

  it("resolves a nonce: true option through content_security_policy_nonce", () => {
    host.contentSecurityPolicyNonce = () => "iyhD0Yc0W+c=";
    expect(stylesheetLinkTag.call(host, "foo.css", { nonce: true }).toString()).toBe(
      '<link rel="stylesheet" href="/stylesheets/foo.css" nonce="iyhD0Yc0W+c=" />',
    );
  });

  it("consumes preloadLinksHeader and nopush rather than rendering them", () => {
    expect(
      stylesheetLinkTag.call(host, "bank", { preloadLinksHeader: false, nopush: false }).toString(),
    ).toBe('<link rel="stylesheet" href="/stylesheets/bank.css" />');
  });

  it("passes the request to an asset_host callable only when its arity accepts one", () => {
    host.config!.assetHost = (source: string, request?: unknown) => {
      expect(request).toBe(host.request);
      return `assets${source.length}.example.com`;
    };
    expect(assetPath.call(host, "/foo.css")).toBe("http://assets8.example.com/foo.css");

    host.config!.assetHost = (...args: unknown[]) => {
      expect(args).toHaveLength(1);
      return "cdn.example.com";
    };
    expect(assetPath.call(host, "/foo.css")).toBe("http://cdn.example.com/foo.css");
  });
});
