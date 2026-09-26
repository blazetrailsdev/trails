import {
  SafeBuffer,
  extractOptionsBang,
  htmlSafe,
  isBlank,
  isPresent,
  stringifyKeys,
} from "@blazetrails/activesupport";
import { ArgumentError, NoMethodError } from "@blazetrails/ruby-compat";
import {
  pathToAsset,
  pathToImage,
  pathToStylesheet,
  type AssetPathOptions,
  type AssetUrlHelperHost,
} from "./asset-url-helper.js";
import { tag } from "./tag-helper.js";

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
  PreloadHeaderHost & {
    contentSecurityPolicyNonce?(): string | null;
    polymorphicUrl?(record: unknown): string;
  };

export function stylesheetLinkTag(this: AssetTagHelperHost, ...sources: unknown[]): SafeBuffer {
  const extracted = extractOptionsBang(sources);
  const rawSources = sources;
  const options = stringifyKeys(extracted);
  const pathOptions = extractBang(options, [
    "protocol",
    "extname",
    "host",
    "skipPipeline",
  ]) as AssetPathOptions;
  const usePreloadLinksHeader =
    options["preloadLinksHeader"] === null || options["preloadLinksHeader"] === undefined
      ? preloadLinksHeader
      : (deleteKey(options, "preloadLinksHeader") as boolean);
  const preloadLinks: string[] = [];
  let crossorigin = deleteKey(options, "crossorigin");
  if (crossorigin === true) crossorigin = "anonymous";
  const nopush =
    options["nopush"] === null || options["nopush"] === undefined
      ? true
      : deleteKey(options, "nopush");
  const integrity = options["integrity"];

  const sourcesTags = htmlSafe(
    [...new Set(rawSources.map(String))]
      .map((source) => {
        const href = pathToStylesheet.call(this, source, pathOptions);
        if (usePreloadLinksHeader === true && isPresent(href) && !href.startsWith("data:")) {
          let preloadLink = `<${href}>; rel=preload; as=style`;
          if (crossorigin !== null && crossorigin !== undefined) {
            preloadLink += `; crossorigin=${String(crossorigin)}`;
          }
          if (integrity !== null && integrity !== undefined) {
            preloadLink += `; integrity=${String(integrity)}`;
          }
          if (nopush === true) preloadLink += "; nopush";
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

        if (applyStylesheetMediaDefault === true && isBlank(tagOptions["media"])) {
          tagOptions["media"] = "screen";
        }

        return String(tag("link", tagOptions));
      })
      .join("\n"),
  );

  if (usePreloadLinksHeader === true) {
    sendPreloadLinksHeader.call(this, preloadLinks);
  }

  return sourcesTags;
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

  return tag("img", options) as SafeBuffer;
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
