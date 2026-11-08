import { Sanitizer, isTrivialInput } from "./sanitizer.js";
import { stripAllTags } from "./engine.js";

export class FullSanitizer extends Sanitizer {
  sanitize(html: string | null | undefined): string | null | undefined {
    if (isTrivialInput(html)) return html;
    return stripAllTags(html as string);
  }
}
