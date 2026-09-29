import { SafeBuffer, htmlSafe, isBlank, stringifyKeys } from "@blazetrails/activesupport";
import { hashDelete } from "@blazetrails/ruby-compat";

import { preventContentExfiltration } from "./content-exfiltration-prevention-helper.js";
import { tag, type TagHelperHost } from "./tag-helper.js";
import { methodTag, tokenTag, type UrlHelperHost } from "./url-helper.js";

export interface FormTagHelperHost extends UrlHelperHost, TagHelperHost {
  urlFor(options: unknown): string;
}

export let embedAuthenticityTokenInRemoteForms: boolean | null = null;

export let defaultEnforceUtf8: boolean = true;

export function setEmbedAuthenticityTokenInRemoteForms(value: boolean | null): void {
  embedAuthenticityTokenInRemoteForms = value;
}

export function setDefaultEnforceUtf8(value: boolean): void {
  defaultEnforceUtf8 = value;
}

export function utf8EnforcerTag(): SafeBuffer {
  return htmlSafe('<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />');
}

/** @internal */
export function htmlOptionsForForm(
  this: FormTagHelperHost,
  urlForOptions: unknown,
  options: Record<string, unknown>,
): Record<string, unknown> {
  const htmlOptions = stringifyKeys(options);
  const multipart = hashDelete(htmlOptions, "multipart");
  if (multipart != null && multipart !== false) htmlOptions["enctype"] = "multipart/form-data";
  if (urlForOptions === false || htmlOptions["action"] === false) {
    hashDelete(htmlOptions, "action");
  } else {
    htmlOptions["action"] = this.urlFor(urlForOptions);
  }
  htmlOptions["accept-charset"] = "UTF-8";

  const remote = hashDelete(htmlOptions, "remote");
  if (remote != null && remote !== false) htmlOptions["data-remote"] = true;

  if (
    htmlOptions["data-remote"] != null &&
    htmlOptions["data-remote"] !== false &&
    embedAuthenticityTokenInRemoteForms === false &&
    isBlank(htmlOptions["authenticityToken"])
  ) {
    htmlOptions["authenticityToken"] = false;
  } else if (htmlOptions["authenticityToken"] === true) {
    htmlOptions["authenticityToken"] = null;
  }
  return htmlOptions;
}

/** @internal */
export function extraTagsForForm(
  this: FormTagHelperHost,
  htmlOptions: Record<string, unknown>,
): SafeBuffer | string {
  const authenticityToken = hashDelete(htmlOptions, "authenticityToken");
  const method = String(hashDelete(htmlOptions, "method") ?? "").toLowerCase();

  let methodTagValue: SafeBuffer | string;
  switch (method) {
    case "get":
      htmlOptions["method"] = "get";
      methodTagValue = "";
      break;
    case "post":
    case "":
      htmlOptions["method"] = "post";
      methodTagValue = tokenTag.call(this, authenticityToken, {
        formOptions: { action: htmlOptions["action"], method: "post" },
      });
      break;
    default:
      htmlOptions["method"] = "post";
      methodTagValue = methodTag.call(this, method).plus(
        tokenTag.call(this, authenticityToken, {
          formOptions: { action: htmlOptions["action"], method: method },
        }),
      );
  }

  const enforceUtf8 = hashDelete(htmlOptions, "enforceUtf8", () => defaultEnforceUtf8);
  if (enforceUtf8 != null && enforceUtf8 !== false) {
    return utf8EnforcerTag().plus(methodTagValue);
  } else {
    return methodTagValue;
  }
}

/** @internal */
export function formTagHtml(
  this: FormTagHelperHost,
  htmlOptions: Record<string, unknown>,
): SafeBuffer {
  const extraTags = extraTagsForForm.call(this, htmlOptions);
  const html = (tag.call(this, "form", htmlOptions, true) as SafeBuffer).plus(extraTags);
  return preventContentExfiltration(html);
}

/** @internal */
export function formTagWithBody(
  this: FormTagHelperHost,
  htmlOptions: Record<string, unknown>,
  content: unknown,
): SafeBuffer {
  const output = formTagHtml.call(this, htmlOptions);
  if (content != null && content !== false) {
    output.concat(content instanceof SafeBuffer ? content : String(content));
  }
  return output.safeConcat("</form>");
}
