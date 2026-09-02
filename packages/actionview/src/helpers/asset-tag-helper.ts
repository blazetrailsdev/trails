import { SafeBuffer, htmlSafe, isBlank, isPresent } from "@blazetrails/activesupport";

import {
  pathToStylesheet,
  type AssetPathOptions,
  type AssetUrlHelperHost,
} from "./asset-url-helper.js";
import { tag } from "./tag-helper.js";

/**
 * ActionView::Helpers::AssetTagHelper
 *
 * Mirrors `actionview/lib/action_view/helpers/asset_tag_helper.rb`.
 */

/** `mattr_accessor :preload_links_header` / `:apply_stylesheet_media_default` (`asset_tag_helper.rb:27-28`). */
export const AssetTagHelper: {
  preloadLinksHeader: boolean | null;
  applyStylesheetMediaDefault: boolean | null;
} = {
  preloadLinksHeader: null,
  applyStylesheetMediaDefault: null,
};

const PATH_OPTION_KEYS = ["protocol", "extname", "host", "skipPipeline"] as const;

/**
 * `AssetUrlHelper`'s receiver plus the `content_security_policy_nonce`
 * `stylesheet_link_tag` reaches for a `nonce: true` option
 * (`asset_tag_helper.rb:226`).
 */
export interface AssetTagHelperHost extends AssetUrlHelperHost {
  contentSecurityPolicyNonce?(): string | null;
}

/**
 * Returns a stylesheet link tag for the sources specified as arguments.
 * `asset_tag_helper.rb:202-242`.
 *
 * @missingRailsCall send_preload_links_header — CONVERGEABLE asset-tag-helper-preload-links-header
 */
export function stylesheetLinkTag(
  this: AssetTagHelperHost | void,
  ...sources: unknown[]
): SafeBuffer {
  const last = sources[sources.length - 1];
  const options: Record<string, unknown> =
    typeof last === "object" &&
    last !== null &&
    !Array.isArray(last) &&
    !(last instanceof SafeBuffer)
      ? { ...(sources.pop() as Record<string, unknown>) }
      : {};
  const pathOptions: AssetPathOptions = {};
  for (const key of PATH_OPTION_KEYS) {
    if (key in options) {
      (pathOptions as Record<string, unknown>)[key] = options[key];
      delete options[key];
    }
  }
  const usePreloadLinksHeader =
    options["preloadLinksHeader"] == null
      ? AssetTagHelper.preloadLinksHeader
      : (deleteOption(options, "preloadLinksHeader") as boolean | null);
  const preloadLinks: string[] = [];
  let crossorigin = deleteOption(options, "crossorigin");
  if (crossorigin === true) crossorigin = "anonymous";
  const nopush =
    options["nopush"] == null ? true : (deleteOption(options, "nopush") as boolean | null);
  const integrity = options["integrity"];

  const sourcesTags = [...new Set(sources)]
    .map((source) => {
      const href = pathToStylesheet.call(this, String(source), pathOptions);
      if (
        usePreloadLinksHeader != null &&
        usePreloadLinksHeader !== false &&
        isPresent(href) &&
        !href.startsWith("data:")
      ) {
        let preloadLink = `<${href}>; rel=preload; as=style`;
        if (crossorigin != null) preloadLink += `; crossorigin=${String(crossorigin)}`;
        if (integrity != null) preloadLink += `; integrity=${String(integrity)}`;
        if (nopush != null && nopush !== false) preloadLink += "; nopush";
        preloadLinks.push(preloadLink);
      }
      const tagOptions: Record<string, unknown> = {
        rel: "stylesheet",
        crossorigin,
        href,
        ...options,
      };
      if (tagOptions["nonce"] === true) {
        tagOptions["nonce"] = this!.contentSecurityPolicyNonce!();
      }

      if (AssetTagHelper.applyStylesheetMediaDefault === true && isBlank(tagOptions["media"])) {
        tagOptions["media"] = "screen";
      }

      return (tag("link", tagOptions) as SafeBuffer).toString();
    })
    .join("\n");

  return htmlSafe(sourcesTags);
}

/** `Hash#delete` — read the key out of `options` and remove it. */
function deleteOption(options: Record<string, unknown>, key: string): unknown {
  const value = options[key];
  delete options[key];
  return value;
}
