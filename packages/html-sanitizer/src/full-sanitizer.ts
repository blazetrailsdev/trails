// Rails parallel: lib/rails/html/sanitizer.rb -> class FullSanitizer.

import { Sanitizer, isTrivialInput } from "./sanitizer.js";
import { stripAllTags } from "./engine.js";

/**
 * Removes all tags from HTML, leaving only the text content. Scripts,
 * forms, and comments are stripped along with their contents.
 *
 * @example
 *   new FullSanitizer().sanitize(
 *     "<b>Bold</b> no more! <a href='more.html'>See more</a>..."
 *   )
 *   // => "Bold no more! See more..."
 */
export class FullSanitizer extends Sanitizer {
  sanitize(html: string | null | undefined): string | null | undefined {
    if (isTrivialInput(html)) return html;
    return stripAllTags(html as string);
  }
}
