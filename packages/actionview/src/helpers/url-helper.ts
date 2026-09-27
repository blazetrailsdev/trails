import {
  SafeBuffer,
  dasherize,
  htmlEscape,
  htmlSafe,
  isBlank,
  isPlainObject,
  presence,
  stringifyKeys,
  toParam,
  urlEncode,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  InvalidURIError,
  RFC2396_PARSER,
  RuntimeError,
  URI,
  hashDelete,
  isSymbol,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";

import { RoutingUrlFor } from "../routing-url-for.js";
import { capture, type CaptureHelperHost } from "./capture-helper.js";
import { preventContentExfiltration } from "./content-exfiltration-prevention-helper.js";
import { contentTag, tag } from "./tag-helper.js";

export interface UrlHelperHost {
  controller: unknown;
  request?: unknown;
  _backUrl(): string;
  _filteredReferrer(): string | null;
  isProtectAgainstForgery?(): boolean;
  formAuthenticityToken?(options: { formOptions: Record<string, unknown> }): string;
  requestForgeryProtectionToken?: unknown;
}

interface UrlHelperController {
  request: { env: Record<string, unknown> };
}

interface UrlHelperRequest {
  isGet(): boolean;
  isHead(): boolean;
  readonly fullpath: string;
  readonly path: string;
  readonly protocol: string;
  readonly hostWithPort: string;
}

type HtmlOptions = Record<string, unknown>;
type UrlForHost = UrlHelperHost & { urlFor(options: unknown): string };
type Block = (...args: unknown[]) => unknown;

export const BUTTON_TAG_METHOD_VERBS = ["patch", "put", "delete"];

export class ClassMethods {
  static _urlForModules(): typeof RoutingUrlFor {
    return RoutingUrlFor;
  }
}

export let buttonToGeneratesButtonTag: boolean = false;

export function setButtonToGeneratesButtonTag(value: boolean): void {
  buttonToGeneratesButtonTag = value;
}

export function urlFor(this: UrlHelperHost, options: unknown = null): string {
  if (typeof options === "string" && !isSymbol(options)) {
    return options;
  } else if (options === ":back") {
    return this._backUrl();
  } else {
    throw new ArgumentError(
      "arguments passed to url_for can't be handled. Please require " +
        "routes or provide your own implementation",
    );
  }
}

/** @internal */
export function _backUrl(this: UrlHelperHost): string {
  return this._filteredReferrer() ?? "javascript:history.back()";
}

/** @internal */
export function _filteredReferrer(this: UrlHelperHost): string | null {
  try {
    if (rbObjRespondTo(this.controller, "request")) {
      const referrer = (this.controller as UrlHelperController).request.env["HTTP_REFERER"] as
        | string
        | null
        | undefined;
      if (referrer != null && URI.parse(referrer).scheme !== "javascript") {
        return referrer;
      }
    }
  } catch (e) {
    if (!(e instanceof InvalidURIError)) throw e;
  }
  return null;
}

export function linkTo(
  this: UrlForHost,
  name: unknown = null,
  options: unknown = null,
  htmlOptions: HtmlOptions | null = null,
  block?: Block,
): SafeBuffer {
  if (block) [htmlOptions, options, name] = [options as HtmlOptions | null, name, block];
  options ??= {};

  htmlOptions = convertOptionsToDataAttributes.call(this, options, htmlOptions);

  const url = urlTarget.call(this, name, options);
  if (htmlOptions["href"] == null || htmlOptions["href"] === false) htmlOptions["href"] = url;

  return contentTag.call(this as never, "a", name ?? url, htmlOptions, undefined, block);
}

export function buttonTo(
  this: UrlForHost,
  name: unknown = null,
  options: unknown = null,
  htmlOptions: HtmlOptions | null = null,
  block?: Block,
): SafeBuffer {
  if (block) [htmlOptions, options] = [options as HtmlOptions | null, name];
  htmlOptions ??= {};
  htmlOptions = stringifyKeys(htmlOptions);

  const url = options === false ? null : this.urlFor(options);

  const remote = hashDelete(htmlOptions, "remote");
  const params = hashDelete(htmlOptions, "params");

  const authenticityToken = hashDelete(htmlOptions, "authenticity_token");

  const method = String(
    presence(hashDelete(htmlOptions, "method")) ?? methodForOptions(options) ?? "",
  );
  const methodTagValue = BUTTON_TAG_METHOD_VERBS.includes(method)
    ? methodTag(method)
    : htmlSafe("");

  const formMethod = method === "get" ? "get" : "post";
  const formOptions = (hashDelete(htmlOptions, "form") as HtmlOptions | undefined) ?? {};
  if (formOptions["class"] == null || formOptions["class"] === false) {
    formOptions["class"] = hashDelete(htmlOptions, "form_class") ?? "button_to";
  }
  formOptions["method"] = formMethod;
  formOptions["action"] = url;
  if (remote != null && remote !== false) formOptions["data-remote"] = true;

  let requestTokenTag: SafeBuffer | string;
  if (formMethod === "post") {
    const requestMethod = method === "" ? "post" : method;
    requestTokenTag = tokenTag.call(this, authenticityToken, {
      formOptions: { action: url, method: requestMethod },
    });
  } else {
    requestTokenTag = "";
  }

  htmlOptions = convertOptionsToDataAttributes.call(this, options, htmlOptions);
  htmlOptions["type"] = "submit";

  let button: SafeBuffer;
  if (block) {
    button = contentTag.call(this as never, "button", htmlOptions, undefined, undefined, block);
  } else if (buttonToGeneratesButtonTag) {
    button = contentTag.call(this as never, "button", name ?? url, htmlOptions);
  } else {
    htmlOptions["value"] = name ?? url;
    button = tag("input", htmlOptions) as SafeBuffer;
  }

  const innerTags = methodTagValue.safeConcat(button).safeConcat(requestTokenTag);
  if (params != null && params !== false) {
    for (const param of toFormParams(params)) {
      innerTags.safeConcat(
        tag("input", { type: "hidden", name: param.name, value: param.value, autocomplete: "off" }),
      );
    }
  }
  const html = contentTag("form", innerTags, formOptions);
  return preventContentExfiltration(html);
}

export function linkToUnlessCurrent(
  this: UrlForHost,
  name: unknown,
  options: unknown = {},
  htmlOptions: HtmlOptions | null = {},
  block?: Block,
): SafeBuffer | null {
  return linkToUnless.call(
    this,
    isCurrentPage.call(this, options),
    name,
    options,
    htmlOptions,
    block,
  );
}

export function linkToUnless(
  this: UrlForHost,
  condition: unknown,
  name: unknown,
  options: unknown = {},
  htmlOptions: HtmlOptions | null = {},
  block?: Block,
): SafeBuffer | null {
  return linkToIf.call(
    this,
    condition == null || condition === false,
    name,
    options,
    htmlOptions,
    block,
  );
}

export function linkToIf(
  this: UrlForHost,
  condition: unknown,
  name: unknown,
  options: unknown = {},
  htmlOptions: HtmlOptions | null = {},
  block?: Block,
): SafeBuffer | null {
  if (condition != null && condition !== false) {
    return linkTo.call(this, name, options, htmlOptions);
  } else {
    if (block) {
      return block.length <= 1
        ? capture.call(this as unknown as CaptureHelperHost, block, name)
        : capture.call(this as unknown as CaptureHelperHost, block, name, options, htmlOptions);
    } else {
      return htmlEscape(name);
    }
  }
}

export function mailTo(
  this: UrlForHost,
  emailAddress: unknown,
  name: unknown = null,
  htmlOptions: HtmlOptions | null = {},
  block?: Block,
): SafeBuffer {
  if (isPlainObject(name)) [htmlOptions, name] = [name as HtmlOptions, null];
  htmlOptions = stringifyKeys(htmlOptions ?? {});

  const extrasList = ["cc", "bcc", "body", "subject", "reply_to"]
    .map((item) => {
      const option = presence(hashDelete(htmlOptions, item));
      if (option == null) return null;
      return `${dasherize(item)}=${urlEncode(option)}`;
    })
    .filter((extra) => extra != null);
  const extras = extrasList.length === 0 ? "" : "?" + extrasList.join("&");

  const encodedEmailAddress = urlEncode(emailAddress).replaceAll("%40", "@");
  htmlOptions["href"] = `mailto:${encodedEmailAddress}${extras}`;

  return contentTag.call(this as never, "a", name ?? emailAddress, htmlOptions, undefined, block);
}

export function isCurrentPage(
  this: UrlForHost,
  options: unknown = null,
  {
    checkParameters = false,
    ...optionsAsKwargs
  }: { checkParameters?: unknown; [key: string]: unknown } = {},
): boolean {
  const request = this.request as UrlHelperRequest | null | undefined;
  if (request == null) {
    throw new RuntimeError(
      "You cannot use helpers that need to determine the current " +
        "page unless your view context provides a Request object " +
        "in a #request method",
    );
  }

  if (!(request.isGet() || request.isHead())) return false;

  options ??= optionsAsKwargs;
  if (checkParameters == null || checkParameters === false) {
    checkParameters =
      isPlainObject(options) && hashDelete(options as HtmlOptions, "checkParameters");
  }

  let urlString = RFC2396_PARSER.unescape(this.urlFor(options));

  let requestUri =
    urlString.includes("?") || (checkParameters != null && checkParameters !== false)
      ? request.fullpath
      : request.path;
  requestUri = RFC2396_PARSER.unescape(requestUri);

  if (/^\w+:\/\//.test(urlString)) {
    requestUri = `${request.protocol}${request.hostWithPort}${requestUri}`;
  }

  urlString = removeTrailingSlashBang(urlString);
  requestUri = removeTrailingSlashBang(requestUri);

  return urlString === requestUri;
}

export function smsTo(
  this: UrlForHost,
  phoneNumber: unknown,
  name: unknown = null,
  htmlOptions: HtmlOptions | null = {},
  block?: Block,
): SafeBuffer {
  if (isPlainObject(name)) [htmlOptions, name] = [name as HtmlOptions, null];
  htmlOptions = stringifyKeys(htmlOptions ?? {});

  let countryCode: unknown = presence(hashDelete(htmlOptions, "country_code"));
  countryCode = countryCode != null ? `+${urlEncode(countryCode)}` : "";

  let body: unknown = presence(hashDelete(htmlOptions, "body"));
  body = body != null ? `?&body=${urlEncode(body)}` : "";

  const encodedPhoneNumber = urlEncode(phoneNumber);
  htmlOptions["href"] = `sms:${countryCode}${encodedPhoneNumber};${body}`;

  return contentTag.call(this as never, "a", name ?? phoneNumber, htmlOptions, undefined, block);
}

export function phoneTo(
  this: UrlForHost,
  phoneNumber: unknown,
  name: unknown = null,
  htmlOptions: HtmlOptions | null = {},
  block?: Block,
): SafeBuffer {
  if (isPlainObject(name)) [htmlOptions, name] = [name as HtmlOptions, null];
  htmlOptions = stringifyKeys(htmlOptions ?? {});

  let countryCode: unknown = presence(hashDelete(htmlOptions, "country_code"));
  countryCode = countryCode == null ? "" : `+${urlEncode(countryCode)}`;

  const encodedPhoneNumber = urlEncode(phoneNumber);
  htmlOptions["href"] = `tel:${countryCode}${encodedPhoneNumber}`;

  return contentTag.call(this as never, "a", name ?? phoneNumber, htmlOptions, undefined, block);
}

/** @internal */
export function convertOptionsToDataAttributes(
  this: UrlForHost,
  options: unknown,
  htmlOptions: HtmlOptions | null,
): HtmlOptions {
  if (htmlOptions != null) {
    htmlOptions = stringifyKeys(htmlOptions);
    if (isLinkToRemoteOptions(options) || isLinkToRemoteOptions(htmlOptions)) {
      htmlOptions["data-remote"] = "true";
    }

    const method = hashDelete(htmlOptions, "method");

    if (method != null && method !== false) addMethodToAttributesBang(htmlOptions, method);

    return htmlOptions;
  } else {
    return isLinkToRemoteOptions(options) ? { "data-remote": "true" } : {};
  }
}

/** @internal */
export function urlTarget(this: UrlForHost, name: unknown, options: unknown): string {
  if (
    rbObjRespondTo(name, "modelName") &&
    isPlainObject(options) &&
    Object.keys(options).length === 0
  ) {
    return this.urlFor(name);
  } else {
    return this.urlFor(options);
  }
}

/** @internal */
export function isLinkToRemoteOptions(options: unknown): unknown {
  if (isPlainObject(options)) {
    return hashDelete(options as HtmlOptions, "remote");
  }
  return null;
}

/** @internal */
export function addMethodToAttributesBang(htmlOptions: HtmlOptions, method: unknown): unknown {
  if (isMethodNotGetMethod(method) && !String(htmlOptions["rel"] ?? "").includes("nofollow")) {
    if (isBlank(htmlOptions["rel"])) {
      htmlOptions["rel"] = "nofollow";
    } else {
      htmlOptions["rel"] = `${String(htmlOptions["rel"])} nofollow`;
    }
  }
  return (htmlOptions["data-method"] = method);
}

/** @internal */
export function methodForOptions(options: unknown): string | null {
  if (Array.isArray(options)) {
    return methodForOptions(options.at(-1));
  } else if (rbObjRespondTo(options, "isPersisted")) {
    return (options as { isPersisted(): boolean }).isPersisted() ? "patch" : "post";
  } else if (rbObjRespondTo(options, "toModel")) {
    return methodForOptions((options as { toModel(): unknown }).toModel());
  }
  return null;
}

const STRINGIFIED_COMMON_METHODS: Readonly<Record<string, string>> = Object.freeze({
  get: "get",
  delete: "delete",
  patch: "patch",
  post: "post",
  put: "put",
});

/** @internal */
export function isMethodNotGetMethod(method: unknown): boolean {
  if (method == null || method === false) return false;
  return (STRINGIFIED_COMMON_METHODS[String(method)] ?? String(method).toLowerCase()) !== "get";
}

/** @internal */
export function tokenTag(
  this: UrlHelperHost,
  token: unknown = null,
  { formOptions = {} }: { formOptions?: Record<string, unknown> } = {},
): SafeBuffer | string {
  if (
    token !== false &&
    rbObjRespondTo(this, "isProtectAgainstForgery", true) &&
    this.isProtectAgainstForgery!()
  ) {
    token =
      token === true || token == null
        ? this.formAuthenticityToken!({ formOptions: { ...formOptions, authenticityToken: token } })
        : token;
    return tag("input", {
      type: "hidden",
      name: String(this.requestForgeryProtectionToken),
      value: token,
      autocomplete: "off",
    }) as SafeBuffer;
  } else {
    return "";
  }
}

/** @internal */
export function methodTag(method: unknown): SafeBuffer {
  return tag("input", {
    type: "hidden",
    name: "_method",
    value: String(method),
    autocomplete: "off",
  }) as SafeBuffer;
}

/** @internal */
export function toFormParams(
  attribute: unknown,
  namespace: string | null = null,
): { name: string; value: unknown }[] {
  attribute = rbObjRespondTo(attribute, "isPermitted")
    ? (attribute as { toH(): unknown }).toH()
    : attribute;

  const params: { name: string; value: unknown }[] = [];
  if (isPlainObject(attribute)) {
    for (const [key, value] of Object.entries(attribute)) {
      const prefix = namespace != null ? `${namespace}[${key}]` : key;
      params.push(...toFormParams(value, prefix));
    }
  } else if (Array.isArray(attribute)) {
    const arrayPrefix = `${namespace ?? ""}[]`;
    for (const value of attribute) {
      params.push(...toFormParams(value, arrayPrefix));
    }
  } else {
    params.push({ name: namespace ?? "", value: toParam(attribute) });
  }

  return params.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** @internal */
export function removeTrailingSlashBang(urlString: string): string {
  const queryIndex = urlString.indexOf("?");
  const trailingIndex = (queryIndex === -1 ? 0 : queryIndex) - 1;
  const at = trailingIndex < 0 ? urlString.length + trailingIndex : trailingIndex;
  if (urlString[at] === "/") return urlString.slice(0, at) + urlString.slice(at + 1);
  return urlString;
}
