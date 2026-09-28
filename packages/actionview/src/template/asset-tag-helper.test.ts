import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { assertRaise } from "@blazetrails/activesupport";
import {
  assetPath,
  computeAssetPath,
  imagePath,
  imageUrl,
  javascriptPath,
  javascriptUrl,
  pathToImage,
  pathToJavascript,
  publicComputeAssetPath,
  pathToStylesheet,
  stylesheetPath,
  stylesheetUrl,
  urlToImage,
  urlToJavascript,
  urlToStylesheet,
  type AssetPathOptions,
  type AssetUrlHelperHost,
} from "../helpers/asset-url-helper.js";
import { Mime } from "@blazetrails/actionpack";
import { Template } from "../template.js";
import {
  autoDiscoveryLinkTag,
  faviconLinkTag,
  imageDecoding,
  imageLoading,
  imageTag,
  setImageDecoding,
  setImageLoading,
  stylesheetLinkTag,
  type AssetTagHelperHost,
} from "../helpers/asset-tag-helper.js";

Template.mimeTypesImplementation = Mime;

const request = { baseUrl: "http://www.example.com", protocol: "http://" };
const host = {
  computeAssetPath,
  publicComputeAssetPath,
  request,
  urlFor: (..._args: unknown[]) => "http://www.example.com",
} as unknown as AssetTagHelperHost;

const assertDomEqual = (expected: string, actual: unknown): void => {
  expect(String(actual)).toEqual(expected);
};

type PathHelper = (this: AssetUrlHelperHost, source: string, options?: AssetPathOptions) => string;
const table = (helper: PathHelper, rows: [string, string, AssetPathOptions?][]) =>
  rows.map(([source, tag, options]): [() => string, string] => [
    () => helper.call(host, source, options),
    tag,
  ]);
const ex = "http://www.example.com";

const AssetPathToTag = table(assetPath, [
  ["", ""],
  ["   ", ""],
  ["foo", "/foo"],
  ["style.css", "/style.css"],
  ["xmlhr.js", "/xmlhr.js"],
  ["xml.png", "/xml.png"],
  ["dir/xml.png", "/dir/xml.png"],
  ["/dir/xml.png", "/dir/xml.png"],
  ["script.min", "/script.min"],
  ["script.min.js", "/script.min.js"],
  ["style.min", "/style.min"],
  ["style.min.css", "/style.min.css"],
  ["http://www.outside.com/image.jpg", "http://www.outside.com/image.jpg"],
  ["HTTP://www.outside.com/image.jpg", "HTTP://www.outside.com/image.jpg"],
  ["style", "/stylesheets/style.css", { type: "stylesheet" }],
  ["xmlhr", "/javascripts/xmlhr.js", { type: "javascript" }],
  ["xml.png", "/images/xml.png", { type: "image" }],
]);

const JavascriptPathToTag = table(javascriptPath, [
  ["xmlhr", "/javascripts/xmlhr.js"],
  ["super/xmlhr", "/javascripts/super/xmlhr.js"],
  ["/super/xmlhr.js", "/super/xmlhr.js"],
  ["xmlhr.min", "/javascripts/xmlhr.min.js"],
  ["xmlhr.min.js", "/javascripts/xmlhr.min.js"],
  ["xmlhr.js?123", "/javascripts/xmlhr.js?123"],
  ["xmlhr.js?body=1", "/javascripts/xmlhr.js?body=1"],
  ["xmlhr.js#hash", "/javascripts/xmlhr.js#hash"],
  ["xmlhr.js?123#hash", "/javascripts/xmlhr.js?123#hash"],
]);

const javascripts: [string, string][] = [
  ["xmlhr", "/javascripts/xmlhr.js"],
  ["super/xmlhr", "/javascripts/super/xmlhr.js"],
  ["/super/xmlhr.js", "/super/xmlhr.js"],
];
const PathToJavascriptToTag = table(pathToJavascript, javascripts);
const JavascriptUrlToTag = table(
  javascriptUrl,
  javascripts.map(([s, t]) => [s, ex + t]),
);
const UrlToJavascriptToTag = table(
  urlToJavascript,
  javascripts.map(([s, t]) => [s, ex + t]),
);

const StyleUrlToTag = table(stylesheetUrl, [
  ["bank", `${ex}/stylesheets/bank.css`],
  ["bank.css", `${ex}/stylesheets/bank.css`],
  ["subdir/subdir", `${ex}/stylesheets/subdir/subdir.css`],
  ["/subdir/subdir.css", `${ex}/subdir/subdir.css`],
]);

const UrlToStyleToTag = table(urlToStylesheet, [
  ["style", `${ex}/stylesheets/style.css`],
  ["style.css", `${ex}/stylesheets/style.css`],
  ["dir/file", `${ex}/stylesheets/dir/file.css`],
  ["/dir/file.rcss", `${ex}/dir/file.rcss`, { extname: false }],
  ["/dir/file", `${ex}/dir/file.rcss`, { extname: ".rcss" }],
]);

const media = (dir: string, ext: string): [string, string][] => [
  ["xml", `/${dir}/xml`],
  [`xml.${ext}`, `/${dir}/xml.${ext}`],
  [`dir/xml.${ext}`, `/${dir}/dir/xml.${ext}`],
  [`/dir/xml.${ext}`, `/dir/xml.${ext}`],
];
const urls = (rows: [string, string][]): [string, string][] => rows.map(([s, t]) => [s, ex + t]);

const ImagePathToTag = table(imagePath, media("images", "png"));
const PathToImageToTag = table(pathToImage, media("images", "png"));
const ImageUrlToTag = table(imageUrl, urls(media("images", "png")));
const UrlToImageToTag = table(urlToImage, urls(media("images", "png")));

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

const autoDiscovery = (...args: unknown[]): unknown =>
  (autoDiscoveryLinkTag as (...a: unknown[]) => unknown).call(host, ...args);
const adLink = (href: string, title: string, type: string, rel = "alternate") =>
  `<link rel="${rel}" type="${type}" title="${title}" href="${href}" />`;
const rssType = "application/rss+xml";
const atomType = "application/atom+xml";

const AutoDiscoveryToTag: [() => unknown, string][] = [
  [() => autoDiscovery(), adLink(ex, "RSS", rssType)],
  [() => autoDiscovery(":rss"), adLink(ex, "RSS", rssType)],
  [() => autoDiscovery(":atom"), adLink(ex, "ATOM", atomType)],
  [() => autoDiscovery(":json"), adLink(ex, "JSON", "application/json")],
  [() => autoDiscovery(":rss", { action: "feed" }), adLink(ex, "RSS", rssType)],
  [
    () => autoDiscovery(":rss", "http://localhost/feed"),
    adLink("http://localhost/feed", "RSS", rssType),
  ],
  [() => autoDiscovery(":rss", "//localhost/feed"), adLink("//localhost/feed", "RSS", rssType)],
  [
    () => autoDiscovery(":rss", { action: "feed" }, { title: "My RSS" }),
    adLink(ex, "My RSS", rssType),
  ],
  [() => autoDiscovery(":rss", {}, { title: "My RSS" }), adLink(ex, "My RSS", rssType)],
  [() => autoDiscovery(null, {}, { type: "text/html" }), adLink(ex, "", "text/html")],
  [
    () => autoDiscovery(null, {}, { title: "No stream.. really", type: "text/html" }),
    adLink(ex, "No stream.. really", "text/html"),
  ],
  [
    () => autoDiscovery(":rss", {}, { title: "My RSS", type: "text/html" }),
    adLink(ex, "My RSS", "text/html"),
  ],
  [
    () => autoDiscovery(":atom", {}, { rel: "Not so alternate" }),
    adLink(ex, "ATOM", atomType, "Not so alternate"),
  ],
];

const favicon = (...args: unknown[]): unknown =>
  (faviconLinkTag as (...a: unknown[]) => unknown).call(host, ...args);

const FaviconLinkToTag: [() => unknown, string][] = [
  [() => favicon(), '<link rel="icon" type="image/x-icon" href="/images/favicon.ico" />'],
  [
    () => favicon("favicon.ico"),
    '<link rel="icon" type="image/x-icon" href="/images/favicon.ico" />',
  ],
  [
    () => favicon("favicon.ico", { rel: "foo" }),
    '<link rel="foo" type="image/x-icon" href="/images/favicon.ico" />',
  ],
  [
    () => favicon("favicon.ico", { rel: "foo", type: "bar" }),
    '<link rel="foo" type="bar" href="/images/favicon.ico" />',
  ],
  [
    () => favicon("mb-icon.png", { rel: "apple-touch-icon", type: "image/png" }),
    '<link rel="apple-touch-icon" type="image/png" href="/images/mb-icon.png" />',
  ],
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
  it("autodiscovery link tag with unknown type but not pass type option key", async () => {
    await assertRaise([ArgumentError], {}, () => autoDiscoveryLinkTag.call(host, ":xml"));
  });

  it("autodiscovery link tag with unknown type", () => {
    const result = autoDiscoveryLinkTag.call(host, ":xml", "/feed.xml", {
      type: "application/xml",
    });
    const expected = `<link rel="alternate" type="application/xml" title="XML" href="/feed.xml" />`;
    assertDomEqual(expected, result);
  });

  it("asset path tag", () => {
    AssetPathToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

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

  it("auto discovery link tag", () => {
    AutoDiscoveryToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("javascript path", () => {
    JavascriptPathToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("path to javascript alias for javascript path", () => {
    PathToJavascriptToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("javascript url", () => {
    JavascriptUrlToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("url to javascript alias for javascript url", () => {
    UrlToJavascriptToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("stylesheet path", () => {
    StylePathToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("path to stylesheet alias for stylesheet path", () => {
    PathToStyleToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("stylesheet url", () => {
    StyleUrlToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("url to stylesheet alias for stylesheet url", () => {
    UrlToStyleToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("stylesheet link tag", () => {
    StyleLinkToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("image path", () => {
    ImagePathToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("path to image alias for image path", () => {
    PathToImageToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("image url", () => {
    ImageUrlToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("url to image alias for image url", () => {
    UrlToImageToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("image tag does not modify options", () => {
    const options = { size: "16x10" };
    imageTag.call(host, "icon", options);
    expect(options).toEqual({ size: "16x10" });
  });

  it("image tag raises an error for competing size arguments", async () => {
    const exception = await assertRaise([ArgumentError], {}, () =>
      imageTag.call(host, "gold.png", { height: "100", width: "200", size: "45x70" }),
    );

    expect(exception.message).toEqual("Cannot pass a :size option with a :height or :width option");
  });

  it("image tag loading attribute default value", () => {
    const originalImageLoading = imageLoading;
    setImageLoading("lazy");
    try {
      assertDomEqual(`<img src="" loading="lazy" />`, imageTag.call(host, ""));
      assertDomEqual(
        `<img loading="eager" src="" />`,
        imageTag.call(host, "", { loading: "eager" }),
      );
    } finally {
      setImageLoading(originalImageLoading);
    }
  });

  it("favicon link tag", () => {
    FaviconLinkToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("image tag decoding attribute default value", () => {
    const originalImageDecoding = imageDecoding;
    setImageDecoding("async");
    try {
      assertDomEqual(`<img src="" decoding="async" />`, imageTag.call(host, ""));
      assertDomEqual(
        `<img decoding="sync" src="" />`,
        imageTag.call(host, "", { decoding: "sync" }),
      );
    } finally {
      setImageDecoding(originalImageDecoding);
    }
  });
});
