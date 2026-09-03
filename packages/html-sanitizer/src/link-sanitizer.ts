import { Sanitizer, isTrivialInput } from "./sanitizer.js";
import { unwrapTagsAndStripAttributes } from "./engine.js";

export class LinkSanitizer extends Sanitizer {
  sanitize(html: string | null | undefined): string | null | undefined {
    if (isTrivialInput(html)) return html;
    return unwrapTagsAndStripAttributes(html as string, ["a"], ["href"]);
  }
}
