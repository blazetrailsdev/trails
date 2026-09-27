import { SafeBuffer, htmlSafe } from "@blazetrails/activesupport";

export let prependContentExfiltrationPrevention: boolean = false;

export function setPrependContentExfiltrationPrevention(value: boolean): void {
  prependContentExfiltrationPrevention = value;
}

export const CLOSE_QUOTES_COMMENT = Object.freeze(htmlSafe(`<!-- '"\` -->`));

export const CLOSE_CDATA_COMMENT = Object.freeze(htmlSafe("<!-- </textarea></xmp> -->"));

export const CLOSE_OPTION_TAG = Object.freeze(htmlSafe("</option>"));

export const CLOSE_FORM_TAG = Object.freeze(htmlSafe("</form>"));

export const CONTENT_EXFILTRATION_PREVENTION_MARKUP = Object.freeze(
  CLOSE_QUOTES_COMMENT.plus(CLOSE_CDATA_COMMENT).plus(CLOSE_OPTION_TAG).plus(CLOSE_FORM_TAG),
);

export function preventContentExfiltration(html: SafeBuffer): SafeBuffer {
  if (prependContentExfiltrationPrevention) {
    return CONTENT_EXFILTRATION_PREVENTION_MARKUP.plus(html);
  } else {
    return html;
  }
}
