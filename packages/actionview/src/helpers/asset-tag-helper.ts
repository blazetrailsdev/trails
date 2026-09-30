import {
  SafeBuffer,
  extractOptionsBang,
  htmlSafe,
  isBlank,
  isPlainObject,
  isPresent,
  presenceIn,
  stringifyKeys,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  File,
  NoMethodError,
  rtest,
  stringToSym,
  symbolToS,
} from "@blazetrails/ruby-compat";
import { Template } from "../template.js";
import {
  pathToAsset,
  pathToImage,
  pathToJavascript,
  pathToStylesheet,
  type AssetPathOptions,
  type AssetUrlHelperHost,
} from "./asset-url-helper.js";
import { capture, type CaptureHelperHost } from "./capture-helper.js";
import { safeJoin } from "./output-safety-helper.js";
import { contentTag, tag, type TagBuilder, type TagHelperHost } from "./tag-helper.js";

export let imageLoading: string | null = null;

export let imageDecoding: string | null = null;

export let preloadLinksHeader: boolean | null = null;

export let applyStylesheetMediaDefault: boolean | null = null;

export function setImageLoading(value: string | null): void {
  imageLoading = value;
}

export function setImageDecoding(value: string | null): void {
  imageDecoding = value;
}

export function setPreloadLinksHeader(value: boolean | null): void {
  preloadLinksHeader = value;
}

export function setApplyStylesheetMediaDefault(value: boolean | null): void {
  applyStylesheetMediaDefault = value;
}

export const MAX_HEADER_SIZE = 1_000;

interface PreloadHeaderHost {
  request?: { sendEarlyHints(links: Record<string, string>): void } | null;
  response?: {
    readonly isSending: boolean;
    headers: { get(key: string): string | undefined; set(key: string, value: string): void };
  } | null;
}

export type AssetTagHelperHost = AssetUrlHelperHost &
  TagHelperHost &
  PreloadHeaderHost & {
    contentSecurityPolicyNonce?(): string | null;
    polymorphicUrl?(record: unknown): string;
    urlFor(options: unknown): string;
  };

export function javascriptIncludeTag(this: AssetTagHelperHost, ...sources: unknown[]): SafeBuffer {
  const options = stringifyKeys(extractOptionsBang(sources));
  const pathOptions = extractBang(options, [
    "protocol",
    "extname",
    "host",
    "skipPipeline",
  ]) as AssetPathOptions;
  const preloadLinks: string[] = [];
  const usePreloadLinksHeader =
    options["preloadLinksHeader"] === null || options["preloadLinksHeader"] === undefined
      ? preloadLinksHeader
      : (deleteKey(options, "preloadLinksHeader") as boolean);
  const nopush =
    options["nopush"] === null || options["nopush"] === undefined
      ? true
      : deleteKey(options, "nopush");
  let crossorigin = deleteKey(options, "crossorigin");
  if (crossorigin === true) crossorigin = "anonymous";
  const integrity = options["integrity"];
  const rel = options["type"] === "module" ? "modulepreload" : "preload";

  const sourcesTags = htmlSafe(
    [...new Set(sources)]
      .map((source) => {
        const href = pathToJavascript.call(this, source as string, pathOptions);
        if (
          rtest(usePreloadLinksHeader) &&
          !rtest(options["defer"]) &&
          isPresent(href) &&
          !href.startsWith("data:")
        ) {
          let preloadLink = `<${href}>; rel=${rel}; as=script`;
          if (crossorigin !== null && crossorigin !== undefined) {
            preloadLink += `; crossorigin=${String(crossorigin)}`;
          }
          if (integrity !== null && integrity !== undefined) {
            preloadLink += `; integrity=${String(integrity)}`;
          }
          if (rtest(nopush)) preloadLink += "; nopush";
          preloadLinks.push(preloadLink);
        }
        const tagOptions: Record<string, unknown> = {
          src: href,
          crossorigin,
          ...options,
        };
        if (tagOptions["nonce"] === true) {
          tagOptions["nonce"] = this.contentSecurityPolicyNonce?.() ?? null;
        }
        return String(contentTag.call(this, "script", "", tagOptions));
      })
      .join("\n"),
  );

  if (rtest(usePreloadLinksHeader)) {
    sendPreloadLinksHeader.call(this, preloadLinks);
  }

  return sourcesTags;
}

export function stylesheetLinkTag(this: AssetTagHelperHost, ...sources: unknown[]): SafeBuffer {
  const options = stringifyKeys(extractOptionsBang(sources));
  const pathOptions = extractBang(options, [
    "protocol",
    "extname",
    "host",
    "skipPipeline",
  ]) as AssetPathOptions;
  const usePreloadLinksHeader =
    options["preloadLinksHeader"] === null || options["preloadLinksHeader"] === undefined
      ? preloadLinksHeader
      : deleteKey(options, "preloadLinksHeader");
  const preloadLinks: string[] = [];
  let crossorigin = deleteKey(options, "crossorigin");
  if (crossorigin === true) crossorigin = "anonymous";
  const nopush =
    options["nopush"] === null || options["nopush"] === undefined
      ? true
      : deleteKey(options, "nopush");
  const integrity = options["integrity"];

  const sourcesTags = htmlSafe(
    [...new Set(sources)]
      .map((source) => {
        const href = pathToStylesheet.call(this, source as string, pathOptions);
        if (rtest(usePreloadLinksHeader) && isPresent(href) && !href.startsWith("data:")) {
          let preloadLink = `<${href}>; rel=preload; as=style`;
          if (crossorigin !== null && crossorigin !== undefined) {
            preloadLink += `; crossorigin=${String(crossorigin)}`;
          }
          if (integrity !== null && integrity !== undefined) {
            preloadLink += `; integrity=${String(integrity)}`;
          }
          if (rtest(nopush)) preloadLink += "; nopush";
          preloadLinks.push(preloadLink);
        }
        const tagOptions: Record<string, unknown> = {
          rel: "stylesheet",
          crossorigin,
          href,
          ...options,
        };
        if (tagOptions["nonce"] === true) {
          tagOptions["nonce"] = this.contentSecurityPolicyNonce?.() ?? null;
        }

        if (rtest(applyStylesheetMediaDefault) && isBlank(tagOptions["media"])) {
          tagOptions["media"] = "screen";
        }

        return String(tag.call(this, "link", tagOptions));
      })
      .join("\n"),
  );

  if (rtest(usePreloadLinksHeader)) {
    sendPreloadLinksHeader.call(this, preloadLinks);
  }

  return sourcesTags;
}

export function autoDiscoveryLinkTag(
  this: AssetTagHelperHost,
  type: string | null = ":rss",
  urlOptions: Record<string, unknown> | string = {},
  tagOptions: Record<string, unknown> = {},
): SafeBuffer {
  if (!(type === ":rss" || type === ":atom" || type === ":json") && isBlank(tagOptions["type"])) {
    throw new ArgumentError(
      `You should pass :type tag_option key explicitly, because you have passed ${type == null ? "" : symbolToS(stringToSym(type))} type other than :rss, :atom, or :json.`,
    );
  }

  return tag.call(this, "link", {
    rel: rtest(tagOptions["rel"]) ? tagOptions["rel"] : "alternate",
    type: rtest(tagOptions["type"])
      ? tagOptions["type"]
      : (Template.Types.get(type)?.toString() ?? ""),
    title: rtest(tagOptions["title"])
      ? tagOptions["title"]
      : (type == null ? "" : symbolToS(stringToSym(type))).toUpperCase(),
    href: isPlainObject(urlOptions) ? this.urlFor({ ...urlOptions, onlyPath: false }) : urlOptions,
  }) as SafeBuffer;
}

export function faviconLinkTag(
  this: AssetTagHelperHost,
  source: string = "favicon.ico",
  options: Record<string, unknown> = {},
): SafeBuffer {
  return tag.call(this, "link", {
    rel: "icon",
    type: "image/x-icon",
    href: pathToImage.call(this, source, {
      skipPipeline: deleteKey(options, "skipPipeline") as boolean | undefined,
    }),
    ...options,
  }) as SafeBuffer;
}

export function preloadLinkTag(
  this: AssetTagHelperHost,
  source: string,
  options: Record<string, unknown> = {},
): SafeBuffer {
  const href = pathToAsset.call(this, source, {
    skipPipeline: deleteKey(options, "skipPipeline") as boolean | undefined,
  });
  const extname = File.extname(source).toLowerCase().replaceAll(".", "");
  const type = deleteKey(options, "type") as string | false | null | undefined;
  const mimeType = rtest(type) ? (type as string) : Template.Types.get(extname)?.toString();
  const as = deleteKey(options, "as") as string | false | null | undefined;
  const asType = rtest(as) ? (as as string) : resolveLinkAs.call(this, extname, mimeType);
  let crossorigin = deleteKey(options, "crossorigin");
  if (crossorigin === true || (isBlank(crossorigin) && asType === "font")) {
    crossorigin = "anonymous";
  }
  const integrity = options["integrity"];
  const nopush = deleteKey(options, "nopush") ?? false;
  const rel = mimeType === "module" ? "modulepreload" : "preload";

  const linkTag = (tag.call(this) as TagBuilder & { link(options: object): SafeBuffer }).link({
    rel,
    href,
    as: asType,
    type: mimeType,
    crossorigin,
    ...options,
  });

  let preloadLink = `<${href}>; rel=${rel}; as=${asType ?? ""}`;
  if (mimeType != null) preloadLink += `; type=${mimeType}`;
  if (rtest(crossorigin)) {
    preloadLink += `; crossorigin=${String(crossorigin)}`;
  }
  if (rtest(integrity)) preloadLink += `; integrity=${String(integrity)}`;
  if (rtest(nopush)) preloadLink += "; nopush";

  sendPreloadLinksHeader.call(this, [preloadLink]);

  return linkTag;
}

export function imageTag(
  this: AssetTagHelperHost,
  source: unknown,
  options: Record<string, unknown> = {},
): SafeBuffer {
  options = { ...options };
  checkForImageTagErrors.call(this, options);
  const skipPipeline = deleteKey(options, "skipPipeline") as boolean | undefined;

  options["src"] = resolveAssetSource.call(this, "image", source, skipPipeline);

  const srcset = options["srcset"];
  if (srcset != null && srcset !== false && typeof srcset !== "string") {
    options["srcset"] = (
      Array.isArray(srcset) ? srcset : Object.entries(srcset as Record<string, unknown>)
    )
      .map(([srcPath, size]: [string, unknown]) => {
        srcPath = pathToImage.call(this, srcPath, { skipPipeline });
        return `${srcPath} ${String(size)}`;
      })
      .join(", ");
  }

  if (options["size"] != null && options["size"] !== false) {
    const dimensions = extractDimensions.call(this, deleteKey(options, "size"));
    options["width"] = dimensions?.[0];
    options["height"] = dimensions?.[1];
  }

  if (imageLoading != null && (options["loading"] == null || options["loading"] === false)) {
    options["loading"] = imageLoading;
  }
  if (imageDecoding != null && (options["decoding"] == null || options["decoding"] === false)) {
    options["decoding"] = imageDecoding;
  }

  return tag.call(this, "img", options) as SafeBuffer;
}

export function pictureTag(
  this: AssetTagHelperHost & CaptureHelperHost,
  ...sources: unknown[]
): SafeBuffer {
  const block =
    typeof sources[sources.length - 1] === "function"
      ? (sources.pop() as () => unknown)
      : undefined;
  sources = sources.flat(Infinity);
  const options = { ...extractOptionsBang(sources) };
  const image = deleteKey(options, "image");
  const imageOptions = (image != null && image !== false ? image : {}) as Record<string, unknown>;
  const skipPipeline = deleteKey(options, "skipPipeline") as boolean | undefined;

  return contentTag.call(this, "picture", options, null, undefined, () => {
    if (isPresent(block)) {
      return htmlSafe(capture.call(this, block!)!.toString());
    } else if (sources.length <= 1) {
      return imageTag.call(this, sources[sources.length - 1], imageOptions);
    } else {
      const sourceTags: unknown[] = sources.map((source) =>
        tag.call(this, "source", {
          srcset: resolveAssetSource.call(this, "image", source, skipPipeline),
          type: Template.Types.get(File.extname(source as string).slice(1))?.toString(),
        }),
      );
      sourceTags.push(imageTag.call(this, sources[sources.length - 1], imageOptions));
      return safeJoin(sourceTags);
    }
  });
}

export function videoTag(this: AssetTagHelperHost, ...sources: unknown[]): SafeBuffer {
  const options = { ...extractOptionsBang(sources) };
  const publicPosterFolder = deleteKey(options, "posterSkipPipeline") as boolean | undefined;
  sources.push(options);
  return multipleSourcesTagBuilder.call(this, "video", sources, (tagOptions) => {
    if (tagOptions["poster"] != null && tagOptions["poster"] !== false) {
      tagOptions["poster"] = pathToImage.call(this, tagOptions["poster"] as string, {
        skipPipeline: publicPosterFolder,
      });
    }
    if (tagOptions["size"] != null && tagOptions["size"] !== false) {
      const dimensions = extractDimensions.call(this, deleteKey(tagOptions, "size"));
      tagOptions["width"] = dimensions?.[0];
      tagOptions["height"] = dimensions?.[1];
    }
  });
}

export function audioTag(this: AssetTagHelperHost, ...sources: unknown[]): SafeBuffer {
  return multipleSourcesTagBuilder.call(this, "audio", sources);
}

/** @internal */
export function multipleSourcesTagBuilder(
  this: AssetTagHelperHost,
  type: string,
  sources: unknown[],
  block?: (options: Record<string, unknown>) => void,
): SafeBuffer {
  const options = { ...extractOptionsBang(sources) };
  const skipPipeline = deleteKey(options, "skipPipeline") as boolean | undefined;
  sources = sources.flat(Infinity);

  if (block) block(options);

  if (sources.length > 1) {
    return contentTag.call(this, type, options, null, undefined, () =>
      safeJoin(
        sources.map((source) =>
          tag.call(this, "source", {
            src: resolveAssetSource.call(this, type, source, skipPipeline),
          }),
        ),
      ),
    );
  } else {
    options["src"] = resolveAssetSource.call(this, type, sources[0], skipPipeline);
    return contentTag.call(this, type, null, options);
  }
}

/** @internal */
export function resolveAssetSource(
  this: AssetTagHelperHost,
  assetType: string,
  source: unknown,
  skipPipeline: boolean | undefined,
): string {
  try {
    if (typeof source === "string") {
      return pathToAsset.call(this, source, { type: assetType, skipPipeline });
    } else {
      if (typeof this.polymorphicUrl !== "function") {
        throw new NoMethodError(`undefined method 'polymorphic_url'`);
      }
      return this.polymorphicUrl(source);
    }
  } catch (e) {
    if (e instanceof NoMethodError) {
      throw new ArgumentError(`Can't resolve ${assetType} into URL: ${e.message}`);
    }
    throw e;
  }
}

/** @internal */
export function extractDimensions(this: AssetTagHelperHost, size: unknown): string[] | undefined {
  size = String(size);
  if (/^\d+(?:\.\d+)?x\d+(?:\.\d+)?$/.test(size as string)) {
    return (size as string).split("x");
  } else if (/^\d+(?:\.\d+)?$/.test(size as string)) {
    return [size as string, size as string];
  }
  return undefined;
}

/** @internal */
export function checkForImageTagErrors(
  this: AssetTagHelperHost,
  options: Record<string, unknown>,
): void {
  if (
    options["size"] != null &&
    options["size"] !== false &&
    ((options["height"] != null && options["height"] !== false) ||
      (options["width"] != null && options["width"] !== false))
  ) {
    throw new ArgumentError("Cannot pass a :size option with a :height or :width option");
  }
}

/** @internal */
export function resolveLinkAs(
  this: AssetTagHelperHost,
  extname: string,
  mimeType: string | null | undefined,
): string | null {
  switch (extname) {
    case "js":
      return "script";
    case "css":
      return "style";
    case "vtt":
      return "track";
    default:
      return presenceIn(String(mimeType ?? "").split("/")[0], ["audio", "video", "font", "image"]);
  }
}

/** @internal */
export function sendPreloadLinksHeader(
  this: PreloadHeaderHost,
  preloadLinks: string[],
  maxHeaderSize: number = MAX_HEADER_SIZE,
): void {
  if (preloadLinks.length === 0) return;
  const responsePresent = this.response ?? null;
  if (responsePresent && responsePresent.isSending) return;

  if (this.request) {
    this.request.sendEarlyHints({ link: preloadLinks.join(",") });
  }

  if (responsePresent) {
    let header = String(responsePresent.headers.get("link") ?? "");
    for (const link of preloadLinks) {
      if (byteSize(header) + byteSize(link) > maxHeaderSize) break;

      if (header === "") {
        header += link;
      } else {
        header += `,${link}`;
      }
    }

    responsePresent.headers.set("link", header);
  }
}

function byteSize(value: string): number {
  return new TextEncoder().encode(value).length;
}

function extractBang(hash: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const extracted: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in hash) {
      extracted[key] = hash[key];
      delete hash[key];
    }
  }
  return extracted;
}

function deleteKey(hash: Record<string, unknown>, key: string): unknown {
  const value = hash[key];
  delete hash[key];
  return value;
}
