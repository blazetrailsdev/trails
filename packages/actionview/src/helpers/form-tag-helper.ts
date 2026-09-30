import {
  SafeBuffer,
  deepMergeBang,
  deepStringifyKeys,
  extractOptionsBang,
  htmlSafe,
  humanize,
  isBlank,
  isPlainObject,
  presence,
  stringifyKeys,
} from "@blazetrails/activesupport";
import {
  Hash,
  Module,
  fetch,
  hashDelete,
  rbObjRespondTo,
  update,
} from "@blazetrails/ruby-compat";

import { ActionView } from "../namespaces.js";
import type { capture } from "./capture-helper.js";
import * as ContentExfiltrationPreventionHelper from "./content-exfiltration-prevention-helper.js";
import { preventContentExfiltration } from "./content-exfiltration-prevention-helper.js";
import { contentTag, tag, type TagHelperHost } from "./tag-helper.js";
import * as TextHelper from "./text-helper.js";
import * as UrlHelper from "./url-helper.js";
import { methodTag, tokenTag, type UrlHelperHost } from "./url-helper.js";

export interface FormTagHelperHost extends UrlHelperHost, TagHelperHost {
  urlFor(options: unknown): string;
  fieldId: typeof fieldId;
  fieldName: typeof fieldName;
  contentTag: typeof contentTag;
  capture: typeof capture;
  submitTag(value?: unknown, options?: Record<string, unknown> | Hash<string, unknown>): SafeBuffer;
}

export let embedAuthenticityTokenInRemoteForms: boolean | null = null;

export let defaultEnforceUtf8: boolean = true;

export function setEmbedAuthenticityTokenInRemoteForms(value: boolean | null): void {
  embedAuthenticityTokenInRemoteForms = value;
}

export function setDefaultEnforceUtf8(value: boolean): void {
  defaultEnforceUtf8 = value;
}

export function fieldId(
  this: FormTagHelperHost,
  objectName: unknown,
  methodName: unknown,
  ...suffixes: unknown[]
): string {
  const { index = null, namespace = null } = extractOptionsBang(suffixes);
  if (rbObjRespondTo(objectName, "modelName")) {
    objectName = (objectName as { modelName: { singular: string } }).modelName.singular;
  }

  let sanitizedObjectName = String(objectName ?? "").replace(/\]\[|[^-a-zA-Z0-9:.]/g, "_");
  if (sanitizedObjectName.endsWith("_")) sanitizedObjectName = sanitizedObjectName.slice(0, -1);

  let sanitizedMethodName = String(methodName ?? "");
  if (sanitizedMethodName.endsWith("?")) sanitizedMethodName = sanitizedMethodName.slice(0, -1);

  return [
    namespace,
    presence(sanitizedObjectName),
    sanitizedObjectName === "" ? null : index,
    sanitizedMethodName,
    ...suffixes,
  ]
    .filter((part) => part != null)
    .flat(Infinity)
    .join("_");
}

/** @missingRailsArgs join — PERMANENT */
export function fieldName(
  this: FormTagHelperHost,
  objectName: unknown,
  methodName: unknown,
  ...methodNames: unknown[]
): string {
  const { multiple = false, index = null } = extractOptionsBang(methodNames);
  const names = methodNames.map((name) => `[${name}]`).join("");

  if (isBlank(objectName)) {
    return `${methodName}${names}${multiple != null && multiple !== false ? "[]" : ""}`;
  } else if (index != null && index !== false) {
    return `${objectName}[${index}][${methodName}]${names}${multiple != null && multiple !== false ? "[]" : ""}`;
  } else {
    return `${objectName}[${methodName}]${names}${multiple != null && multiple !== false ? "[]" : ""}`;
  }
}

export function labelTag(
  this: FormTagHelperHost,
  name: unknown = null,
  contentOrOptions: unknown = null,
  options: Record<string, unknown> | null = null,
  block?: () => unknown,
): unknown {
  if (block !== undefined && isPlainObject(contentOrOptions)) {
    options = contentOrOptions = stringifyKeys(contentOrOptions as Record<string, unknown>);
  } else {
    options ??= {};
    options = stringifyKeys(options);
  }
  if (!(isBlank(name) || Object.hasOwn(options, "for"))) options["for"] = sanitizeToId(name);
  return this.contentTag(
    "label",
    contentOrOptions != null && contentOrOptions !== false
      ? contentOrOptions
      : humanize(String(name ?? "")),
    options,
    undefined,
    block,
  );
}

export function utf8EnforcerTag(): SafeBuffer {
  return htmlSafe('<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />');
}

export function submitTag(
  this: FormTagHelperHost,
  value: unknown = "Save changes",
  options: Record<string, unknown> | Hash<string, unknown> = {},
): SafeBuffer {
  options = deepStringifyKeys(options) as Record<string, unknown> | Hash<string, unknown>;
  const tagOptions = update<unknown>({ type: "submit", name: "commit", value: value }, options);
  setDefaultDisableWith(value, tagOptions);
  return tag.call(this, "input", tagOptions) as SafeBuffer;
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

/** @internal */
export function sanitizeToId(name: unknown): string {
  return String(name ?? "")
    .replaceAll("]", "")
    .replace(/[^-a-zA-Z0-9:.]/g, "_");
}

/** @internal */
export function setDefaultDisableWith(value: unknown, tagOptions: Record<string, unknown>): void {
  const data = fetch<Record<string, unknown> | Hash<string, unknown>>(tagOptions, "data", {});

  if (
    tagOptions["data-disable-with"] === false ||
    (data instanceof Hash ? data.get("disable_with") : data["disable_with"]) === false
  ) {
    if (data instanceof Hash) data.delete("disable_with");
    else hashDelete(data, "disable_with");
  } else if (ActionView.Base.automaticallyDisableSubmitTag) {
    let disableWithText = tagOptions["data-disable-with"];
    if (disableWithText == null || disableWithText === false)
      disableWithText = data instanceof Hash ? data.get("disable_with") : data["disable_with"];
    if (disableWithText == null || disableWithText === false) {
      disableWithText = value == null ? "" : String(value);
    }
    deepMergeBang(tagOptions, { data: { disable_with: disableWithText } });
  }

  hashDelete(tagOptions, "data-disable-with");
}

export const FormTagHelper = new Module((mod) => {
  mod.include(UrlHelper);
  mod.include(TextHelper);
  mod.include(ContentExfiltrationPreventionHelper);

  mod.moduleEval((m) =>
    Object.assign(m, {
      fieldId,
      fieldName,
      labelTag,
      utf8EnforcerTag,
      submitTag,
      htmlOptionsForForm,
      extraTagsForForm,
      formTagHtml,
      formTagWithBody,
      sanitizeToId,
      setDefaultDisableWith,
    }),
  );
});
