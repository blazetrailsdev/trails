import {
  SafeBuffer,
  htmlEscape,
  htmlSafe,
  htmlEscapeOnce,
  xmlNameEscape,
  extractOptionsBang,
} from "@blazetrails/activesupport";
import {
  raw as _raw,
  safeJoin as _safeJoin,
  toSentence as _toSentence,
  type ToSentenceOptions,
} from "./output-safety-helper.js";
import { ArgumentError, rbInspect } from "@blazetrails/ruby-compat";
import { capture, type CaptureHelperHost } from "./capture-helper.js";

export interface TagHelperHost extends CaptureHelperHost {
  _tagBuilder?: TagBuilder;
}

type TagBlock = (tagBuilder: TagBuilder) => unknown;

const BOOLEAN_ATTRIBUTES = new Set([
  "allowfullscreen",
  "allowpaymentrequest",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "compact",
  "controls",
  "declare",
  "default",
  "defaultchecked",
  "defaultmuted",
  "defaultselected",
  "defer",
  "disabled",
  "enabled",
  "formnovalidate",
  "hidden",
  "indeterminate",
  "inert",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nohref",
  "nomodule",
  "noresize",
  "noshade",
  "novalidate",
  "nowrap",
  "open",
  "pauseonexit",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "scoped",
  "seamless",
  "selected",
  "sortable",
  "truespeed",
  "typemustmatch",
  "visible",
]);

const DATA_PREFIXES = new Set(["data"]);
const ARIA_PREFIXES = new Set(["aria"]);

const PRE_CONTENT_STRINGS: Record<string, string> = {
  textarea: "\n",
};

/** @internal */
function ensureValidHtml5TagName(name: string): void {
  if (!/^[a-zA-Z][a-zA-Z0-9\-:.]*$/.test(name)) {
    throw new ArgumentError(`Invalid HTML5 tag name: ${rbInspect(name)}`);
  }
}

function dasherize(str: string): string {
  return str.replace(/_/g, "-");
}

/** @internal */
export function buildTagValues(...args: unknown[]): string[] {
  const tagValues: string[] = [];

  for (const tagValue of args) {
    if (tagValue === null || tagValue === undefined || tagValue === false) {
      continue;
    }

    if (
      typeof tagValue === "object" &&
      !Array.isArray(tagValue) &&
      !(tagValue instanceof SafeBuffer)
    ) {
      for (const [key, val] of Object.entries(tagValue as Record<string, unknown>)) {
        if (key !== "" && val !== false && val !== null && val !== undefined) {
          tagValues.push(String(key));
        }
      }
    } else if (Array.isArray(tagValue)) {
      tagValues.push(...buildTagValues(...tagValue));
    } else {
      const str = String(tagValue);
      if (str !== "") {
        tagValues.push(str);
      }
    }
  }

  return tagValues;
}

function buildTagValuesPreservingSafety(value: unknown): Array<string | SafeBuffer> {
  const result: Array<string | SafeBuffer> = [];

  function walk(val: unknown): void {
    if (val === null || val === undefined || val === false) return;

    if (Array.isArray(val)) {
      for (const item of val) walk(item);
    } else if (
      typeof val === "object" &&
      !(val instanceof SafeBuffer) &&
      !(val instanceof RegExp)
    ) {
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (k !== "" && v !== false && v !== null && v !== undefined) {
          result.push(String(k));
        }
      }
    } else if (val instanceof SafeBuffer) {
      const str = val.toString();
      if (str !== "") {
        result.push(val.htmlSafe ? val : str);
      }
    } else {
      const str = String(val);
      if (str !== "") result.push(str);
    }
  }

  walk(value);
  return result;
}

function booleanTagOption(key: string): string {
  return `${key}="${key}"`;
}

function tagOption(key: string, value: unknown, escape: boolean): string {
  if (escape) {
    key = xmlNameEscape(key);
  }

  let strValue: string;

  if (
    Array.isArray(value) ||
    (typeof value === "object" &&
      value !== null &&
      !(value instanceof SafeBuffer) &&
      !(value instanceof RegExp))
  ) {
    if (key === "class") {
      const built = buildTagValuesPreservingSafety(value);
      strValue = escape ? safeJoin(built, " ").toString() : built.map((v) => String(v)).join(" ");
    } else {
      const arr = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
      strValue = escape ? safeJoin(arr.map(String), " ").toString() : arr.map(String).join(" ");
    }
  } else if (value instanceof RegExp) {
    strValue = escape ? htmlEscape(value.source).toString() : value.source;
  } else if (value instanceof SafeBuffer) {
    if (value.htmlSafe) {
      strValue = value.toString();
    } else {
      strValue = escape ? htmlEscape(value.toString()).toString() : value.toString();
    }
  } else {
    strValue = escape ? htmlEscape(value).toString() : String(value);
  }

  if (strValue.includes('"')) {
    strValue = strValue.replace(/"/g, "&quot;");
  }

  return `${key}="${strValue}"`;
}

/** @internal */
function prefixTagOption(prefix: string, key: string, value: unknown, escape: boolean): string {
  const dasherizedKey = `${prefix}-${dasherize(String(key))}`;
  if (typeof value === "string" || value instanceof SafeBuffer || typeof value === "symbol") {
    /** @empty */
  } else if (
    Array.isArray(value) ||
    (typeof value === "object" && value !== null && !(value instanceof RegExp))
  ) {
    try {
      value = JSON.stringify(value);
    } catch {
      value = String(value);
    }
  } else {
    value = String(value);
  }
  return tagOption(dasherizedKey, value, escape);
}

function tagOptions(options: Record<string, unknown> | undefined, escape: boolean = true): string {
  if (!options || Object.keys(options).length === 0) return "";

  let output = "";
  const sep = " ";

  for (const [key, value] of Object.entries(options)) {
    const isPlainObject =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      !(value instanceof SafeBuffer) &&
      !(value instanceof RegExp);
    if (DATA_PREFIXES.has(key) && isPlainObject) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v === null || v === undefined) continue;
        output += sep;
        output += prefixTagOption(key, k, v, escape);
      }
    } else if (ARIA_PREFIXES.has(key) && isPlainObject) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v === null || v === undefined) continue;

        let processedValue: unknown;
        if (Array.isArray(v) || (typeof v === "object" && v !== null)) {
          const tokens = buildTagValues(v);
          if (tokens.length === 0) continue;
          processedValue = safeJoin(tokens, " ");
        } else {
          processedValue = String(v);
        }

        output += sep;
        output += prefixTagOption(key, k, processedValue, escape);
      }
    } else if (BOOLEAN_ATTRIBUTES.has(key)) {
      if (value === true) {
        output += sep;
        output += booleanTagOption(key);
      } else if (value !== null && value !== undefined && value !== false) {
        output += sep;
        output += tagOption(key, value, escape);
      }
    } else if (value !== null && value !== undefined) {
      output += sep;
      output += tagOption(key, value, escape);
    }
  }

  return output;
}

export function tag(
  this: TagHelperHost | void,
  name?: string,
  options?: Record<string, unknown> | null,
  open?: boolean,
  escape?: boolean,
): SafeBuffer | TagBuilder {
  if (name === undefined) {
    return tagBuilder.call(this as TagHelperHost);
  }
  ensureValidHtml5TagName(name);
  const esc = escape !== undefined ? escape : true;
  const opts = options ? tagOptions(options, esc) : "";
  const suffix = open ? ">" : " />";
  return htmlSafe(`<${name}${opts}${suffix}`);
}

export function contentTag(
  this: TagHelperHost | void,
  name: string,
  contentOrOptionsWithBlock?: unknown,
  options?: Record<string, unknown> | null,
  escape?: boolean,
  block?: () => unknown,
): SafeBuffer {
  ensureValidHtml5TagName(name);
  const esc = escape !== undefined ? escape : true;

  if (block) {
    const isPlainOpts =
      typeof contentOrOptionsWithBlock === "object" &&
      contentOrOptionsWithBlock !== null &&
      !(contentOrOptionsWithBlock instanceof SafeBuffer) &&
      !Array.isArray(contentOrOptionsWithBlock);
    const opts = isPlainOpts ? (contentOrOptionsWithBlock as Record<string, unknown>) : options;
    return contentTagString(
      name,
      capture.call(this as TagHelperHost, block),
      opts ?? undefined,
      esc,
    );
  }

  return contentTagString(name, contentOrOptionsWithBlock, options ?? undefined, esc);
}

function contentTagString(
  name: string,
  content: unknown,
  options?: Record<string, unknown>,
  escape: boolean = true,
): SafeBuffer {
  const opts = options ? tagOptions(options, escape) : "";
  let contentStr: string;

  if (escape && content !== null && content !== undefined && String(content) !== "") {
    if (content instanceof SafeBuffer && content.htmlSafe) {
      contentStr = content.toString();
    } else {
      contentStr = htmlEscape(content).toString();
    }
  } else {
    contentStr = content !== null && content !== undefined ? String(content) : "";
  }

  const pre = PRE_CONTENT_STRINGS[name] || "";
  return htmlSafe(`<${name}${opts}>${pre}${contentStr}</${name}>`);
}

export function tokenList(...args: unknown[]): SafeBuffer {
  const tokens = buildTagValues(...args)
    .flatMap((value) => {
      const unescaped = value
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      return unescaped.split(/\s+/);
    })
    .filter((v) => v !== "");

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const t of tokens) {
    if (!seen.has(t)) {
      seen.add(t);
      unique.push(t);
    }
  }

  return safeJoin(unique, " ");
}

export const classNames = tokenList;

export function cdataSection(content: unknown): SafeBuffer {
  const str = String(content ?? "");
  const splitted = str.replace(/\]\]>/g, "]]]]><![CDATA[>");
  return htmlSafe(`<![CDATA[${splitted}]]>`);
}

export function escapeOnce(html: string): SafeBuffer {
  return htmlEscapeOnce(html);
}

export class TagBuilder {
  static defineElement(name: string, { methodName = name }: { methodName?: string } = {}): void {
    if (name in this.prototype) return;

    Object.defineProperty(this.prototype, methodName, {
      value(this: TagBuilder, ...args: unknown[]): SafeBuffer {
        const block = (typeof args[args.length - 1] === "function" ? args.pop() : undefined) as
          | TagBlock
          | undefined;
        const { escape = true, ...options } = extractOptionsBang(args);
        const [content = null] = args;
        return this.tagString(name, content, options, { escape: escape as boolean, block });
      },
      writable: true,
      configurable: true,
    });
  }

  static defineVoidElement(
    name: string,
    { methodName = name }: { methodName?: string } = {},
  ): void {
    Object.defineProperty(this.prototype, methodName, {
      value(this: TagBuilder, ...args: unknown[]): SafeBuffer {
        if (typeof args[args.length - 1] === "function") args.pop();
        const { escape = true, ...options } = extractOptionsBang(args);
        if (args.length > 0) {
          throw new ArgumentError(`wrong number of arguments (given ${args.length}, expected 0)`);
        }
        return this.selfClosingTagString(name, options, escape as boolean, ">");
      },
      writable: true,
      configurable: true,
    });
  }

  static defineSelfClosingElement(
    name: string,
    { methodName = name }: { methodName?: string } = {},
  ): void {
    Object.defineProperty(this.prototype, methodName, {
      value(this: TagBuilder, ...args: unknown[]): SafeBuffer {
        const block = (typeof args[args.length - 1] === "function" ? args.pop() : undefined) as
          | TagBlock
          | undefined;
        const { escape = true, ...options } = extractOptionsBang(args);
        const [content = null] = args;
        if ((content != null && content !== false) || block) {
          return this.tagString(name, content, options, { escape: escape as boolean, block });
        } else {
          return this.selfClosingTagString(name, options, escape as boolean);
        }
      },
      writable: true,
      configurable: true,
    });
  }

  static {
    this.defineVoidElement("area");
    this.defineVoidElement("base");
    this.defineVoidElement("br");
    this.defineVoidElement("col");
    this.defineVoidElement("embed");
    this.defineVoidElement("hr");
    this.defineVoidElement("img");
    this.defineVoidElement("input");
    this.defineVoidElement("keygen");
    this.defineVoidElement("link");
    this.defineVoidElement("meta");
    this.defineVoidElement("source");
    this.defineVoidElement("track");
    this.defineVoidElement("wbr");
    this.defineSelfClosingElement("animate");
    this.defineSelfClosingElement("animateMotion", { methodName: "animate_motion" });
    this.defineSelfClosingElement("animateTransform", { methodName: "animate_transform" });
    this.defineSelfClosingElement("circle");
    this.defineSelfClosingElement("ellipse");
    this.defineSelfClosingElement("line");
    this.defineSelfClosingElement("path");
    this.defineSelfClosingElement("polygon");
    this.defineSelfClosingElement("polyline");
    this.defineSelfClosingElement("rect");
    this.defineSelfClosingElement("set");
    this.defineSelfClosingElement("stop");
    this.defineSelfClosingElement("use");
    this.defineSelfClosingElement("view");
    this.defineElement("a");
    this.defineElement("abbr");
    this.defineElement("address");
    this.defineElement("article");
    this.defineElement("aside");
    this.defineElement("audio");
    this.defineElement("b");
    this.defineElement("bdi");
    this.defineElement("bdo");
    this.defineElement("blockquote");
    this.defineElement("body");
    this.defineElement("button");
    this.defineElement("canvas");
    this.defineElement("caption");
    this.defineElement("cite");
    this.defineElement("code");
    this.defineElement("colgroup");
    this.defineElement("data");
    this.defineElement("datalist");
    this.defineElement("dd");
    this.defineElement("del");
    this.defineElement("details");
    this.defineElement("dfn");
    this.defineElement("dialog");
    this.defineElement("div");
    this.defineElement("dl");
    this.defineElement("dt");
    this.defineElement("em");
    this.defineElement("fieldset");
    this.defineElement("figcaption");
    this.defineElement("figure");
    this.defineElement("footer");
    this.defineElement("form");
    this.defineElement("h1");
    this.defineElement("h2");
    this.defineElement("h3");
    this.defineElement("h4");
    this.defineElement("h5");
    this.defineElement("h6");
    this.defineElement("head");
    this.defineElement("header");
    this.defineElement("hgroup");
    this.defineElement("html");
    this.defineElement("i");
    this.defineElement("iframe");
    this.defineElement("ins");
    this.defineElement("kbd");
    this.defineElement("label");
    this.defineElement("legend");
    this.defineElement("li");
    this.defineElement("main");
    this.defineElement("map");
    this.defineElement("mark");
    this.defineElement("menu");
    this.defineElement("meter");
    this.defineElement("nav");
    this.defineElement("noscript");
    this.defineElement("object");
    this.defineElement("ol");
    this.defineElement("optgroup");
    this.defineElement("option");
    this.defineElement("output");
    this.defineElement("p");
    this.defineElement("picture");
    this.defineElement("portal");
    this.defineElement("pre");
    this.defineElement("progress");
    this.defineElement("q");
    this.defineElement("rp");
    this.defineElement("rt");
    this.defineElement("ruby");
    this.defineElement("s");
    this.defineElement("samp");
    this.defineElement("script");
    this.defineElement("search");
    this.defineElement("section");
    this.defineElement("select");
    this.defineElement("slot");
    this.defineElement("small");
    this.defineElement("span");
    this.defineElement("strong");
    this.defineElement("style");
    this.defineElement("sub");
    this.defineElement("summary");
    this.defineElement("sup");
    this.defineElement("table");
    this.defineElement("tbody");
    this.defineElement("td");
    this.defineElement("template");
    this.defineElement("textarea");
    this.defineElement("tfoot");
    this.defineElement("th");
    this.defineElement("thead");
    this.defineElement("time");
    this.defineElement("title");
    this.defineElement("tr");
    this.defineElement("u");
    this.defineElement("ul");
    this.defineElement("var");
    this.defineElement("video");
  }

  /** @internal */
  viewContext: TagHelperHost;

  constructor(viewContext: TagHelperHost) {
    this.viewContext = viewContext;
  }

  attributes(attributes: Record<string, unknown> | null | undefined): SafeBuffer {
    if (!attributes) return htmlSafe("");
    const result = tagOptions(attributes).trim();
    return htmlSafe(result);
  }

  tagString(
    name: string,
    content: unknown,
    options?: Record<string, unknown> | null,
    opts?: { escape?: boolean; block?: TagBlock },
  ): SafeBuffer {
    const escape = opts?.escape !== false;
    let actualContent: unknown = content;
    if (opts?.block)
      actualContent = capture.call(
        this.viewContext,
        opts.block as (...args: unknown[]) => unknown,
        this,
      );
    return contentTagString(name, actualContent, options ?? undefined, escape);
  }

  selfClosingTagString(
    name: string,
    options: Record<string, unknown>,
    escape: boolean = true,
    tagSuffix: string = " />",
  ): SafeBuffer {
    return htmlSafe(`<${name}${tagOptions(options, escape)}${tagSuffix}`);
  }

  private methodMissing(called: string, ...args: unknown[]): SafeBuffer {
    const block = (typeof args[args.length - 1] === "function" ? args.pop() : undefined) as
      | TagBlock
      | undefined;
    const { escape = true, ...options } = extractOptionsBang(args);
    const name = dasherize(called);

    ensureValidHtml5TagName(name);

    const [content = null] = args;
    return this.tagString(name, content, options, {
      escape: escape as boolean,
      block,
    });
  }

  [key: string]: unknown;
}

/** @internal */
export function tagBuilder(this: TagHelperHost): TagBuilder {
  return (this._tagBuilder ??= createTagBuilderProxy(this));
}

export function raw(stringish: unknown): SafeBuffer {
  return _raw(stringish);
}

export function safeJoin(array: unknown[], sep?: string | SafeBuffer | null): SafeBuffer {
  return _safeJoin(array, sep);
}

export function toSentence(array: unknown[], options?: ToSentenceOptions): SafeBuffer {
  return _toSentence(array, options);
}

function createTagBuilderProxy(viewContext: TagHelperHost): TagBuilder {
  const builder = new TagBuilder(viewContext);

  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol" || prop in target) {
        return Reflect.get(target, prop, receiver);
      }
      if (prop === "then" || prop === "catch" || prop === "finally") return undefined;

      const { methodMissing } = target as unknown as {
        methodMissing(called: string, ...args: unknown[]): SafeBuffer;
      };
      return (...args: unknown[]) => methodMissing.call(receiver, prop, ...args);
    },

    has() {
      return true;
    },
  });
}
