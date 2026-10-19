import {
  SafeBuffer,
  deepMergeBang,
  deepStringifyKeys,
  extractOptionsBang,
  htmlSafe,
  htmlEscape,
  humanize,
  isBlank,
  isPlainObject,
  presence,
  stringifyKeys,
  Concern,
  extend,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  Hash,
  type Range,
  except,
  fetch,
  hashDelete,
  rbObjRespondTo,
  update,
  include,
} from "@blazetrails/ruby-compat";

import { ActionView } from "../namespaces.js";
import type { capture } from "./capture-helper.js";
import {
  ContentExfiltrationPreventionHelper,
  preventContentExfiltration,
} from "./content-exfiltration-prevention-helper.js";
import { contentTag, tag, type TagHelperHost } from "./tag-helper.js";
import { TextHelper } from "./text-helper.js";
import { UrlHelper, methodTag, tokenTag, type UrlHelperHost } from "./url-helper.js";

export interface FormTagHelperHost extends UrlHelperHost, TagHelperHost {
  urlFor(options: unknown): string;
  fieldId: typeof fieldId;
  fieldName: typeof fieldName;
  contentTag: typeof contentTag;
  capture: typeof capture;
  submitTag(value?: unknown, options?: Record<string, unknown> | Hash<string, unknown>): SafeBuffer;
  pathToImage(source: unknown, options?: Record<string, unknown>): string;
  safeJoin(array: unknown[], sep?: string | SafeBuffer | null): SafeBuffer;
}

export let embedAuthenticityTokenInRemoteForms: boolean | null = null;

export let defaultEnforceUtf8: boolean = true;

export function setEmbedAuthenticityTokenInRemoteForms(value: boolean | null): void {
  embedAuthenticityTokenInRemoteForms = value;
}

export function setDefaultEnforceUtf8(value: boolean): void {
  defaultEnforceUtf8 = value;
}

export function formTag(
  this: FormTagHelperHost,
  urlForOptions: unknown = {},
  options: Record<string, unknown> = {},
  block?: ((...args: unknown[]) => unknown) | null,
): SafeBuffer {
  const htmlOptions = htmlOptionsForForm.call(this, urlForOptions, options);
  if (block != null) {
    return formTagWithBody.call(this, htmlOptions, this.capture(block));
  } else {
    return formTagHtml.call(this, htmlOptions);
  }
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

export function selectTag(
  this: FormTagHelperHost,
  name: string,
  optionTags: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  if (optionTags == null || optionTags === false) optionTags = "";
  const htmlName = options["multiple"] === true && !name.endsWith("[]") ? `${name}[]` : name;

  if ("includeBlank" in options) {
    let includeBlank = options["includeBlank"];
    options = except(options, "includeBlank");
    const optionsForBlankOptionsTag: Record<string, unknown> = { value: "" };

    if (includeBlank === true) {
      includeBlank = "";
      optionsForBlankOptionsTag["label"] = " ";
    }

    if (includeBlank != null && includeBlank !== false) {
      optionTags = contentTag
        .call(this, "option", includeBlank, optionsForBlankOptionsTag)
        .safeConcat(optionTags as string);
    }
  }

  const prompt = hashDelete(options, "prompt");
  if (prompt != null && prompt !== false) {
    optionTags = contentTag
      .call(this, "option", prompt, { value: "" })
      .safeConcat(optionTags as string);
  }

  return contentTag.call(
    this,
    "select",
    optionTags,
    Object.assign({ name: htmlName, id: sanitizeToId(name) }, stringifyKeys(options)),
  );
}

export function textFieldTag(
  this: FormTagHelperHost,
  name: unknown,
  value: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  return tag.call(
    this,
    "input",
    Object.assign(
      { type: "text", name: name, id: sanitizeToId(name), value: value },
      stringifyKeys(options),
    ),
  ) as SafeBuffer;
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

export function buttonTag(
  this: FormTagHelperHost,
  contentOrOptions: unknown = null,
  options: Record<string, unknown> | null = null,
  block?: () => unknown,
): SafeBuffer {
  if (isPlainObject(contentOrOptions) || contentOrOptions instanceof Hash) {
    options = contentOrOptions as Record<string, unknown>;
  } else {
    options ??= {};
  }

  options = Object.assign({ name: "button", type: "submit" }, stringifyKeys(options));

  if (block !== undefined) {
    return contentTag.call(this, "button", options, null, undefined, block);
  } else {
    return contentTag.call(
      this,
      "button",
      contentOrOptions != null && contentOrOptions !== false ? contentOrOptions : "Button",
      options,
    );
  }
}

export function imageSubmitTag(
  this: FormTagHelperHost,
  source: unknown,
  options: Record<string, unknown> = {},
): SafeBuffer {
  options = stringifyKeys(options);
  const src = this.pathToImage(source, { skipPipeline: hashDelete(options, "skipPipeline") });
  return tag.call(this, "input", Object.assign({ type: "image", src: src }, options)) as SafeBuffer;
}

export function fieldSetTag(
  this: FormTagHelperHost,
  legend: unknown = null,
  options: Record<string, unknown> | null = null,
  block?: () => unknown,
): SafeBuffer {
  const content: unknown[] = [];
  if (!isBlank(legend)) content.push(contentTag.call(this, "legend", legend));
  if (block !== undefined) content.push(this.capture(block));
  return contentTag.call(this, "fieldset", this.safeJoin(content), options);
}
export const fieldsetTag = fieldSetTag;

export function colorFieldTag(
  this: FormTagHelperHost,
  name: unknown,
  value: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  return textFieldTag.call(this, name, value, { ...options, type: "color" });
}

export function searchFieldTag(
  this: FormTagHelperHost,
  name: unknown,
  value: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  return textFieldTag.call(this, name, value, { ...options, type: "search" });
}

export function telephoneFieldTag(
  this: FormTagHelperHost,
  name: unknown,
  value: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  return textFieldTag.call(this, name, value, { ...options, type: "tel" });
}
export const phoneFieldTag = telephoneFieldTag;

export function dateFieldTag(
  this: FormTagHelperHost,
  name: unknown,
  value: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  return textFieldTag.call(this, name, value, { ...options, type: "date" });
}

export function timeFieldTag(
  this: FormTagHelperHost,
  name: unknown,
  value: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  return textFieldTag.call(this, name, value, { ...options, type: "time" });
}

export function datetimeFieldTag(
  this: FormTagHelperHost,
  name: unknown,
  value: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  return textFieldTag.call(this, name, value, { ...options, type: "datetime-local" });
}
export const datetimeLocalFieldTag = datetimeFieldTag;

export function monthFieldTag(
  this: FormTagHelperHost,
  name: unknown,
  value: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  return textFieldTag.call(this, name, value, { ...options, type: "month" });
}

export function weekFieldTag(
  this: FormTagHelperHost,
  name: unknown,
  value: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  return textFieldTag.call(this, name, value, { ...options, type: "week" });
}

export function urlFieldTag(
  this: FormTagHelperHost,
  name: unknown,
  value: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  return textFieldTag.call(this, name, value, { ...options, type: "url" });
}

export function emailFieldTag(
  this: FormTagHelperHost,
  name: unknown,
  value: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  return textFieldTag.call(this, name, value, { ...options, type: "email" });
}

export function numberFieldTag(
  this: FormTagHelperHost,
  name: unknown,
  value: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  options = stringifyKeys(options);
  if (options["type"] == null || options["type"] === false) options["type"] = "number";
  let range = hashDelete(options, "in");
  if (range == null || range === false) range = hashDelete(options, "within");
  if (range != null && range !== false) {
    Object.assign(options, { min: (range as Range).min(), max: (range as Range).max() });
  }
  return textFieldTag.call(this, name, value, options);
}

export function rangeFieldTag(
  this: FormTagHelperHost,
  name: unknown,
  value: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  return numberFieldTag.call(this, name, value, { ...options, type: "range" });
}

export function utf8EnforcerTag(): SafeBuffer {
  return htmlSafe('<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />');
}

export function hiddenFieldTag(
  this: FormTagHelperHost,
  name: unknown,
  value: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  return textFieldTag.call(this, name, value, { ...options, type: "hidden", autocomplete: "off" });
}

export function fileFieldTag(
  this: FormTagHelperHost,
  name: unknown,
  options: Record<string, unknown> = {},
): SafeBuffer {
  return textFieldTag.call(
    this,
    name,
    null,
    convertDirectUploadOptionToUrl.call(this, { ...options, type: "file" }),
  );
}

export function passwordFieldTag(
  this: FormTagHelperHost,
  name: unknown = "password",
  value: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  return textFieldTag.call(this, name, value, { ...options, type: "password" });
}

export function textareaTag(
  this: FormTagHelperHost,
  name: unknown,
  content: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  options = stringifyKeys(options);

  const size = hashDelete(options, "size");
  if (size != null && size !== false) {
    if (rbObjRespondTo(size, "split")) {
      [options["cols"], options["rows"]] = (size as string).split("x");
    }
  }

  const escape = hashDelete(options, "escape", () => true);
  if (escape != null && escape !== false) content = htmlEscape(content);

  return contentTag.call(
    this,
    "textarea",
    htmlSafe(String(content ?? "")),
    Object.assign({ name: name, id: sanitizeToId(name) }, options),
  );
}
export const textAreaTag = textareaTag;

export function checkboxTag(
  this: FormTagHelperHost,
  name: unknown,
  ...args: unknown[]
): SafeBuffer {
  if (args.length >= 4) {
    throw new ArgumentError(`wrong number of arguments (given ${args.length + 1}, expected 1..4)`);
  }
  const options = extractOptionsBang(args);
  const [value, checked] = args.length === 0 ? ["1", false] : [...args, false];
  const htmlOptions: Record<string, unknown> = Object.assign(
    { type: "checkbox", name: name, id: sanitizeToId(name), value: value },
    stringifyKeys(options),
  );
  if (checked != null && checked !== false) htmlOptions["checked"] = "checked";
  return tag.call(this, "input", htmlOptions) as SafeBuffer;
}
export const checkBoxTag = checkboxTag;

export function radioButtonTag(
  this: FormTagHelperHost,
  name: unknown,
  value: unknown,
  ...args: unknown[]
): SafeBuffer {
  if (args.length >= 3) {
    throw new ArgumentError(`wrong number of arguments (given ${args.length + 2}, expected 2..4)`);
  }
  const options = extractOptionsBang(args);
  const checked = args.length === 0 ? false : args[0];
  const htmlOptions: Record<string, unknown> = Object.assign(
    {
      type: "radio",
      name: name,
      id: `${sanitizeToId(name)}_${sanitizeToId(value)}`,
      value: value,
    },
    stringifyKeys(options),
  );
  if (checked != null && checked !== false) htmlOptions["checked"] = "checked";
  return tag.call(this, "input", htmlOptions) as SafeBuffer;
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
    delete htmlOptions["action"];
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
    else delete data["disable_with"];
  } else if (ActionView.Base.automaticallyDisableSubmitTag) {
    let disableWithText = tagOptions["data-disable-with"];
    if (disableWithText == null || disableWithText === false)
      disableWithText = data instanceof Hash ? data.get("disable_with") : data["disable_with"];
    if (disableWithText == null || disableWithText === false) {
      disableWithText = value == null ? "" : String(value);
    }
    deepMergeBang(tagOptions, { data: { disable_with: disableWithText } });
  }

  delete tagOptions["data-disable-with"];
}

/** @internal */
export function convertDirectUploadOptionToUrl(
  this: FormTagHelperHost,
  options: Record<string, unknown>,
): Record<string, unknown> {
  const directUpload = hashDelete(options, "directUpload");
  if (directUpload == null || directUpload === false) return options;

  if (rbObjRespondTo(this, "railsDirectUploadsUrl")) {
    options["data-direct-upload-url"] = (
      this as unknown as { railsDirectUploadsUrl(): unknown }
    ).railsDirectUploadsUrl();
  } else if (
    rbObjRespondTo(this, "mainApp") &&
    rbObjRespondTo((this as unknown as { mainApp(): unknown }).mainApp(), "railsDirectUploadsUrl")
  ) {
    options["data-direct-upload-url"] = (
      this as unknown as { mainApp(): { railsDirectUploadsUrl(): unknown } }
    )
      .mainApp()
      .railsDirectUploadsUrl();
  }
  return options;
}

export const FormTagHelper = {
  formTag,
  fieldId,
  fieldName,
  selectTag,
  textFieldTag,
  labelTag,
  hiddenFieldTag,
  fileFieldTag,
  passwordFieldTag,
  textareaTag,
  textAreaTag,
  checkboxTag,
  checkBoxTag,
  radioButtonTag,
  submitTag,
  buttonTag,
  imageSubmitTag,
  fieldSetTag,
  fieldsetTag,
  colorFieldTag,
  searchFieldTag,
  telephoneFieldTag,
  phoneFieldTag,
  dateFieldTag,
  timeFieldTag,
  datetimeFieldTag,
  datetimeLocalFieldTag,
  monthFieldTag,
  weekFieldTag,
  urlFieldTag,
  emailFieldTag,
  numberFieldTag,
  rangeFieldTag,
  utf8EnforcerTag,
  htmlOptionsForForm,
  extraTagsForForm,
  formTagHtml,
  formTagWithBody,
  sanitizeToId,
  setDefaultDisableWith,
  convertDirectUploadOptionToUrl,
};

extend(FormTagHelper, Concern);
include(FormTagHelper, UrlHelper);
include(FormTagHelper, TextHelper);
include(FormTagHelper, ContentExfiltrationPreventionHelper);
