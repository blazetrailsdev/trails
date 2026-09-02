import { SafeBuffer, htmlSafe, isBlank } from "@blazetrails/activesupport";

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
 * Returns a stylesheet link tag for the sources specified as arguments.
 * `asset_tag_helper.rb:202-242`.
 *
 * @missingRailsCall send_preload_links_header — CONVERGEABLE asset-tag-helper-preload-links-header
 * @missingRailsCall content_security_policy_nonce — CONVERGEABLE asset-tag-helper-preload-links-header
 */
export function stylesheetLinkTag(
  this: AssetUrlHelperHost | void,
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
  let crossorigin = options["crossorigin"];
  delete options["crossorigin"];
  if (crossorigin === true) crossorigin = "anonymous";

  const sourcesTags = [...new Set(sources)]
    .map((source) => {
      const href = pathToStylesheet.call(this, String(source), pathOptions);
      const tagOptions: Record<string, unknown> = {
        rel: "stylesheet",
        crossorigin,
        href,
        ...options,
      };

      if (AssetTagHelper.applyStylesheetMediaDefault === true && isBlank(tagOptions["media"])) {
        tagOptions["media"] = "screen";
      }

      return (tag("link", tagOptions) as SafeBuffer).toString();
    })
    .join("\n");

  return htmlSafe(sourcesTags);
}
