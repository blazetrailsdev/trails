import {
  SafeBuffer,
  extractOptionsBang,
  htmlSafe,
  isBlank,
  isPresent,
  stringifyKeys,
} from "@blazetrails/activesupport";
import {
  pathToStylesheet,
  type AssetPathOptions,
  type AssetUrlHelperHost,
} from "./asset-url-helper.js";
import { tag } from "./tag-helper.js";

/**
 * `ActionView::Helpers::AssetTagHelper`
 * (`actionview/lib/action_view/helpers/asset_tag_helper.rb`).
 */

/** `mattr_accessor :preload_links_header` (`asset_tag_helper.rb:27`). */
export let preloadLinksHeader: boolean | null = null;

/** `mattr_accessor :apply_stylesheet_media_default` (`asset_tag_helper.rb:28`). */
export let applyStylesheetMediaDefault: boolean | null = null;

export function setPreloadLinksHeader(value: boolean | null): void {
  preloadLinksHeader = value;
}

export function setApplyStylesheetMediaDefault(value: boolean | null): void {
  applyStylesheetMediaDefault = value;
}

/** `MAX_HEADER_SIZE = 1_000` (`asset_tag_helper.rb:652`). */
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
  };

/** Mirrors `AssetTagHelper#stylesheet_link_tag` (`asset_tag_helper.rb:202-242`). */
export function stylesheetLinkTag(this: AssetTagHelperHost, ...sources: unknown[]): SafeBuffer {
  const [rawSources, extracted] = extractOptionsBang(sources);
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

/**
 * Mirrors the private `send_preload_links_header` (`asset_tag_helper.rb:654-677`).
 *
 * @internal
 */
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

/** Ruby `Hash#extract!` — removes the named keys and returns them. */
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
