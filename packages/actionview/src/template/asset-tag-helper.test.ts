import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { SafeBuffer, assertRaise } from "@blazetrails/activesupport";
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
  videoPath,
  pathToVideo,
  videoUrl,
  urlToVideo,
  audioPath,
  pathToAudio,
  audioUrl,
  urlToAudio,
  fontPath,
  fontUrl,
  urlToFont,
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
  pictureTag,
  setImageDecoding,
  setImageLoading,
  stylesheetLinkTag,
  type AssetTagHelperHost,
} from "../helpers/asset-tag-helper.js";
import type { CaptureHelperHost } from "../helpers/capture-helper.js";
import { tag } from "../helpers/tag-helper.js";

Template.mimeTypesImplementation = Mime;

const request = { baseUrl: "http://www.example.com", protocol: "http://" };
const host = {
  computeAssetPath,
  publicComputeAssetPath,
  request,
  urlFor: (..._args: unknown[]) => "http://www.example.com",
} as unknown as AssetTagHelperHost & CaptureHelperHost;

const normalizeDom = (html: unknown): string =>
  String(html).replace(/<(\w+)((?:\s+[\w-]+="[^"]*")*)\s*(\/?)>/g, (_m, name, attrs, close) => {
    const sorted = (attrs.match(/[\w-]+="[^"]*"/g) ?? []).sort().join(" ");
    return `<${name}${sorted ? " " + sorted : ""}${close}>`;
  });

const assertDomEqual = (expected: string, actual: unknown): void => {
  expect(normalizeDom(actual)).toEqual(normalizeDom(expected));
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

const img = (...args: [unknown, Record<string, unknown>?]): unknown => imageTag.call(host, ...args);
const gif = "data:image/gif;base64,R0lGODlhAQABAID/AMDAwAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

const ImageLinkToTag: [() => unknown, string][] = [
  [() => img("xml.png"), `<img src="/images/xml.png" />`],
  [
    () => img("rss.gif", { alt: "RSS syndication" }),
    `<img alt="RSS syndication" src="/images/rss.gif" />`,
  ],
  [() => img("gold.png", { size: "20" }), `<img height="20" src="/images/gold.png" width="20" />`],
  [() => img("gold.png", { size: 20 }), `<img height="20" src="/images/gold.png" width="20" />`],
  [
    () => img("silver.png", { size: "90.9" }),
    `<img height="90.9" src="/images/silver.png" width="90.9" />`,
  ],
  [
    () => img("silver.png", { size: 90.9 }),
    `<img height="90.9" src="/images/silver.png" width="90.9" />`,
  ],
  [
    () => img("gold.png", { size: "45x70" }),
    `<img height="70" src="/images/gold.png" width="45" />`,
  ],
  [
    () => img("gold.png", { size: "45x70" }),
    `<img height="70" src="/images/gold.png" width="45" />`,
  ],
  [
    () => img("silver.png", { size: "67.12x74.09" }),
    `<img height="74.09" src="/images/silver.png" width="67.12" />`,
  ],
  [
    () => img("silver.png", { size: "67.12x74.09" }),
    `<img height="74.09" src="/images/silver.png" width="67.12" />`,
  ],
  [
    () => img("bronze.png", { size: "10x15.7" }),
    `<img height="15.7" src="/images/bronze.png" width="10" />`,
  ],
  [
    () => img("bronze.png", { size: "10x15.7" }),
    `<img height="15.7" src="/images/bronze.png" width="10" />`,
  ],
  [
    () => img("platinum.png", { size: "4.9x20" }),
    `<img height="20" src="/images/platinum.png" width="4.9" />`,
  ],
  [
    () => img("platinum.png", { size: "4.9x20" }),
    `<img height="20" src="/images/platinum.png" width="4.9" />`,
  ],
  [() => img("error.png", { size: "45 x 70" }), `<img src="/images/error.png" />`],
  [() => img("error.png", { size: "1,024x768" }), `<img src="/images/error.png" />`],
  [() => img("error.png", { size: "768x1,024" }), `<img src="/images/error.png" />`],
  [() => img("error.png", { size: "x" }), `<img src="/images/error.png" />`],
  [() => img("google.com.png"), `<img src="/images/google.com.png" />`],
  [() => img("slash..png"), `<img src="/images/slash..png" />`],
  [() => img(".pdf.png"), `<img src="/images/.pdf.png" />`],
  [
    () => img("http://www.rubyonrails.com/images/rails.png"),
    `<img src="http://www.rubyonrails.com/images/rails.png" />`,
  ],
  [
    () => img("//www.rubyonrails.com/images/rails.png"),
    `<img src="//www.rubyonrails.com/images/rails.png" />`,
  ],
  [() => img("mouse.png", { alt: null }), `<img src="/images/mouse.png" />`],
  [() => img(gif, { alt: null }), `<img src="${gif}" />`],
  [() => img(""), `<img src="" />`],
  [
    () => img("gold.png", { data: { title: "Rails Application" } }),
    `<img data-title="Rails Application" src="/images/gold.png" />`,
  ],
  [
    () => img("rss.gif", { srcset: "/assets/pic_640.jpg 640w, /assets/pic_1024.jpg 1024w" }),
    `<img srcset="/assets/pic_640.jpg 640w, /assets/pic_1024.jpg 1024w" src="/images/rss.gif" />`,
  ],
  [
    () => img("rss.gif", { srcset: { "pic_640.jpg": "640w", "pic_1024.jpg": "1024w" } }),
    `<img srcset="/images/pic_640.jpg 640w, /images/pic_1024.jpg 1024w" src="/images/rss.gif" />`,
  ],
  [
    () =>
      img("rss.gif", {
        srcset: [
          ["pic_640.jpg", "640w"],
          ["pic_1024.jpg", "1024w"],
        ],
      }),
    `<img srcset="/images/pic_640.jpg 640w, /images/pic_1024.jpg 1024w" src="/images/rss.gif" />`,
  ],
];

const PicturePathToTag = table(imagePath, media("images", "webp"));
const PathToPictureToTag = table(pathToImage, media("images", "webp"));
const PictureUrlToTag = table(imageUrl, urls(media("images", "webp")));
const UrlToPictureToTag = table(urlToImage, urls(media("images", "webp")));

const VideoPathToTag = table(videoPath, media("videos", "ogg"));
const PathToVideoToTag = table(pathToVideo, media("videos", "ogg"));
const VideoUrlToTag = table(videoUrl, urls(media("videos", "ogg")));
const UrlToVideoToTag = table(urlToVideo, urls(media("videos", "ogg")));

const AudioPathToTag = table(audioPath, media("audios", "wav"));
const PathToAudioToTag = table(pathToAudio, media("audios", "wav"));
const AudioUrlToTag = table(audioUrl, urls(media("audios", "wav")));
const UrlToAudioToTag = table(urlToAudio, urls(media("audios", "wav")));

const fonts: [string, string][] = [
  ["font.eot", "/fonts/font.eot"],
  ["font.eot#iefix", "/fonts/font.eot#iefix"],
  ["font.woff", "/fonts/font.woff"],
  ["font.ttf", "/fonts/font.ttf"],
  ["font.ttf?123", "/fonts/font.ttf?123"],
];
const fontUrls: [string, string, AssetPathOptions?][] = [
  ...urls(fonts),
  ["font.ttf", "http://assets.example.com/fonts/font.ttf", { host: "http://assets.example.com" }],
];
const FontPathToTag = table(fontPath, fonts);
const FontUrlToTag = table(fontUrl, fontUrls);
const UrlToFontToTag = table(urlToFont, fontUrls);

const pic = (...args: unknown[]): unknown => pictureTag.call(host, ...args);
const picImg = (
  source: string,
  image: Record<string, unknown>,
  img: string,
): [() => unknown, string] => [() => pic(source, { image }), `<picture>${img}</picture>`];
const sources = `<source srcset="/images/picture.webp" type="image/webp" /><source srcset="/images/picture.png" type="image/png" />`;

const PictureLinkToTag: [() => unknown, string][] = [
  [() => pic("picture.webp"), `<picture><img src="/images/picture.webp" /></picture>`],
  picImg("gold.png", { size: "20" }, `<img height="20" src="/images/gold.png" width="20" />`),
  picImg("gold.png", { size: 20 }, `<img height="20" src="/images/gold.png" width="20" />`),
  picImg(
    "silver.png",
    { size: "90.9" },
    `<img height="90.9" src="/images/silver.png" width="90.9" />`,
  ),
  picImg(
    "silver.png",
    { size: 90.9 },
    `<img height="90.9" src="/images/silver.png" width="90.9" />`,
  ),
  picImg("gold.png", { size: "45x70" }, `<img height="70" src="/images/gold.png" width="45" />`),
  picImg("gold.png", { size: "45x70" }, `<img height="70" src="/images/gold.png" width="45" />`),
  picImg(
    "silver.png",
    { size: "67.12x74.09" },
    `<img height="74.09" src="/images/silver.png" width="67.12" />`,
  ),
  picImg(
    "silver.png",
    { size: "67.12x74.09" },
    `<img height="74.09" src="/images/silver.png" width="67.12" />`,
  ),
  picImg(
    "bronze.png",
    { size: "10x15.7" },
    `<img height="15.7" src="/images/bronze.png" width="10" />`,
  ),
  picImg(
    "bronze.png",
    { size: "10x15.7" },
    `<img height="15.7" src="/images/bronze.png" width="10" />`,
  ),
  picImg(
    "platinum.png",
    { size: "4.9x20" },
    `<img height="20" src="/images/platinum.png" width="4.9" />`,
  ),
  picImg(
    "platinum.png",
    { size: "4.9x20" },
    `<img height="20" src="/images/platinum.png" width="4.9" />`,
  ),
  picImg("error.png", { size: "45 x 70" }, `<img src="/images/error.png" />`),
  picImg("error.png", { size: "1,024x768" }, `<img src="/images/error.png" />`),
  picImg("error.png", { size: "768x1,024" }, `<img src="/images/error.png" />`),
  picImg("error.png", { size: "x" }, `<img src="/images/error.png" />`),
  [() => pic("google.com.png"), `<picture><img src="/images/google.com.png" /></picture>`],
  [() => pic("slash..png"), `<picture><img src="/images/slash..png" /></picture>`],
  [() => pic(".pdf.png"), `<picture><img src="/images/.pdf.png" /></picture>`],
  [
    () => pic("http://www.rubyonrails.com/images/rails.png"),
    `<picture><img src="http://www.rubyonrails.com/images/rails.png" /></picture>`,
  ],
  [
    () => pic("//www.rubyonrails.com/images/rails.png"),
    `<picture><img src="//www.rubyonrails.com/images/rails.png" /></picture>`,
  ],
  picImg("mouse.png", { alt: null }, `<img src="/images/mouse.png" />`),
  picImg(gif, { alt: null }, `<img src="${gif}" />`),
  [() => pic(""), `<picture><img src="" /></picture>`],
  [
    () => pic("picture.webp", "picture.png"),
    `<picture>${sources}<img src="/images/picture.png" /></picture>`,
  ],
  [
    () => pic("picture.webp", "picture.png", { class: "my-class" }),
    `<picture class="my-class">${sources}<img src="/images/picture.png" /></picture>`,
  ],
  [
    () => pic("picture.webp", "picture.png", { image: { alt: "Image" } }),
    `<picture>${sources}<img alt="Image" src="/images/picture.png" /></picture>`,
  ],
  [
    () => pic(["picture.webp", "picture.png"], { image: { alt: "Image" } }),
    `<picture>${sources}<img alt="Image" src="/images/picture.png" /></picture>`,
  ],
  [
    () =>
      pic({ class: "my-class" }, () =>
        (tag("source", { srcset: imagePath.call(host, "picture.webp") }) as SafeBuffer).plus(
          img("picture.png", { alt: "Image" }),
        ),
      ),
    `<picture class="my-class"><source srcset="/images/picture.webp" /><img alt="Image" src="/images/picture.png" /></picture>`,
  ],
  [
    () =>
      pic(() =>
        (
          tag("source", {
            srcset: imagePath.call(host, "picture-small.webp"),
            media: "(min-width: 600px)",
          }) as SafeBuffer
        )
          .plus(tag("source", { srcset: imagePath.call(host, "picture-big.webp") }))
          .plus(img("picture.png", { alt: "Image" })),
      ),
    `<picture><source srcset="/images/picture-small.webp" media="(min-width: 600px)" /><source srcset="/images/picture-big.webp" /><img alt="Image" src="/images/picture.png" /></picture>`,
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

  it("image tag", () => {
    ImageLinkToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
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
        `<img src="" loading="eager" />`,
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
        `<img src="" decoding="sync" />`,
        imageTag.call(host, "", { decoding: "sync" }),
      );
    } finally {
      setImageDecoding(originalImageDecoding);
    }
  });

  it("picture path", () => {
    PicturePathToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("path to picture alias for picture path", () => {
    PathToPictureToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("picture url", () => {
    PictureUrlToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("url to picture alias for picture url", () => {
    UrlToPictureToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("picture tag", () => {
    PictureLinkToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("video path", () => {
    VideoPathToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("path to video alias for video path", () => {
    PathToVideoToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("video url", () => {
    VideoUrlToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("url to video alias for video url", () => {
    UrlToVideoToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("audio path", () => {
    AudioPathToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("path to audio alias for audio path", () => {
    PathToAudioToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("audio url", () => {
    AudioUrlToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("url to audio alias for audio url", () => {
    UrlToAudioToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("font path", () => {
    FontPathToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("font url", () => {
    FontUrlToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("url to font alias for font url", () => {
    UrlToFontToTag.forEach(([method, tag]) => assertDomEqual(tag, method()));
  });

  it("image tag interpreting email cid correctly", () => {
    expect(String(imageTag.call(host, "cid:thi%25%25sis@acontentid"))).toEqual(
      '<img src="cid:thi%25%25sis@acontentid" />',
    );
  });

  it("image tag interpreting email adding optional alt tag", () => {
    expect(String(imageTag.call(host, "cid:thi%25%25sis@acontentid", { alt: "Image" }))).toEqual(
      '<img alt="Image" src="cid:thi%25%25sis@acontentid" />',
    );
  });

  it("should not modify source string", () => {
    const source = "/images/rails.png";
    const copy = source;
    imageTag.call(host, source);
    expect(source).toEqual(copy);
  });
});
