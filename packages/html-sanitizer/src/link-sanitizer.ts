// Rails parallel: lib/rails/html/sanitizer.rb -> class LinkSanitizer.

import { Sanitizer, isTrivialInput } from "./sanitizer.js";
import { unwrapTagsAndStripAttributes } from "./engine.js";

/**
 * Removes `<a>` tags (unwrapping their text content) and strips `href`
 * attributes from any other surviving element. Mirrors Loofah's
 * `TargetScrubber.new(tags: %w(a), attributes: %w(href))`.
 *
 * @example
 *   new LinkSanitizer().sanitize('<a href="x">Only text kept.</a>')
 *   // => "Only text kept."
 *
 * Non-`<a>` tags are preserved (subject to the engine's tag allowlist —
 * see `engine.ts` for the divergence note vs. Loofah's permissive
 * default).
 */
export class LinkSanitizer extends Sanitizer {
  sanitize(html: string | null | undefined): string | null | undefined {
    if (isTrivialInput(html)) return html;
    return unwrapTagsAndStripAttributes(html as string, ["a"], ["href"]);
  }
}
