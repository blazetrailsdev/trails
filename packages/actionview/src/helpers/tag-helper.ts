import {
  SafeBuffer,
  htmlEscape,
  htmlSafe,
  htmlEscapeOnce,
  xmlNameEscape,
  extractOptionsBang,
  CodeGenerator,
  isBlank,
  isPlainObject,
  isPresent,
  unwrappedHtmlEscape,
} from "@blazetrails/activesupport";
import {
  raw as _raw,
  safeJoin as _safeJoin,
  toSentence as _toSentence,
  type ToSentenceOptions,
} from "./output-safety-helper.js";
import { ArgumentError, eachPair, Hash, rbInspect } from "@blazetrails/ruby-compat";
import { capture, type CaptureHelperHost } from "./capture-helper.js";

export interface TagHelperHost extends CaptureHelperHost {
  _tagBuilder?: TagBuilder;
}

type TagBlock = (tagBuilder: TagBuilder) => unknown;

const __FILE__ = import.meta.url;
const __LINE__ = 0;

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
export function buildTagValues(...args: unknown[]): Array<string | SafeBuffer> {
  const tagValues: Array<string | SafeBuffer> = [];

  for (const tagValue of args) {
    if (isPlainObject(tagValue) || tagValue instanceof Hash) {
      eachPair(tagValue, (key: string, val: unknown) => {
        if (val != null && val !== false && isPresent(key)) tagValues.push(String(key));
      });
    } else if (Array.isArray(tagValue)) {
      tagValues.push(...buildTagValues(...tagValue));
    } else {
      if (isPresent(tagValue)) {
        tagValues.push(tagValue instanceof SafeBuffer ? tagValue : String(tagValue));
      }
    }
  }

  return tagValues;
}

export function tag(
  this: TagHelperHost,
  name?: string,
  options?: Record<string, unknown> | null,
  open?: boolean,
  escape?: boolean,
): SafeBuffer | TagBuilder {
  if (name === undefined) {
    return tagBuilder.call(this);
  }
  ensureValidHtml5TagName(name);
  const esc = escape !== undefined ? escape : true;
  const opts = options ? (tagBuilder.call(this).tagOptions(options, esc) ?? "") : "";
  const suffix = open ? ">" : " />";
  return htmlSafe(`<${name}${opts}${suffix}`);
}

export function contentTag(
  this: TagHelperHost,
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
    return tagBuilder.call(this).contentTagString(name, capture.call(this, block), opts, esc);
  }

  return tagBuilder.call(this).contentTagString(name, contentOrOptionsWithBlock, options, esc);
}

export function tokenList(...args: unknown[]): SafeBuffer {
  const tokens = buildTagValues(...args)
    .flatMap((value) => {
      const unescaped = String(value)
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
  static defineElement(
    name: string,
    { codeGenerator, methodName = name }: { codeGenerator: CodeGenerator; methodName?: string },
  ): void {
    if (name in this.prototype) return;

    codeGenerator.classEval((batch) => {
      batch.push((mod) => {
        Object.defineProperty(mod, methodName, {
          writable: true,
          configurable: true,
          value(this: TagBuilder, ...args: unknown[]): SafeBuffer {
            const block = (typeof args[args.length - 1] === "function" ? args.pop() : undefined) as
              | TagBlock
              | undefined;
            const { escape = true, ...options } = extractOptionsBang(args);
            const [content = null] = args;
            return this.tagString(name, content, options, { escape: escape as boolean, block });
          },
        });
      });
    });
  }

  static defineVoidElement(
    name: string,
    { codeGenerator, methodName = name }: { codeGenerator: CodeGenerator; methodName?: string },
  ): void {
    codeGenerator.classEval((batch) => {
      batch.push((mod) => {
        Object.defineProperty(mod, methodName, {
          writable: true,
          configurable: true,
          value(this: TagBuilder, ...args: unknown[]): SafeBuffer {
            if (typeof args[args.length - 1] === "function") args.pop();
            const { escape = true, ...options } = extractOptionsBang(args);
            if (args.length > 0) {
              throw new ArgumentError(
                `wrong number of arguments (given ${args.length}, expected 0)`,
              );
            }
            return this.selfClosingTagString(name, options, escape as boolean, ">");
          },
        });
      });
    });
  }

  static defineSelfClosingElement(
    name: string,
    { codeGenerator, methodName = name }: { codeGenerator: CodeGenerator; methodName?: string },
  ): void {
    codeGenerator.classEval((batch) => {
      batch.push((mod) => {
        Object.defineProperty(mod, methodName, {
          writable: true,
          configurable: true,
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
        });
      });
    });
  }

  static {
    CodeGenerator.batch(this, __FILE__, __LINE__, (codeGenerator) => {
      this.defineVoidElement("area", { codeGenerator });
      this.defineVoidElement("base", { codeGenerator });
      this.defineVoidElement("br", { codeGenerator });
      this.defineVoidElement("col", { codeGenerator });
      this.defineVoidElement("embed", { codeGenerator });
      this.defineVoidElement("hr", { codeGenerator });
      this.defineVoidElement("img", { codeGenerator });
      this.defineVoidElement("input", { codeGenerator });
      this.defineVoidElement("keygen", { codeGenerator });
      this.defineVoidElement("link", { codeGenerator });
      this.defineVoidElement("meta", { codeGenerator });
      this.defineVoidElement("source", { codeGenerator });
      this.defineVoidElement("track", { codeGenerator });
      this.defineVoidElement("wbr", { codeGenerator });
      this.defineSelfClosingElement("animate", { codeGenerator });
      this.defineSelfClosingElement("animateMotion", {
        codeGenerator,
        methodName: "animate_motion",
      });
      this.defineSelfClosingElement("animateTransform", {
        codeGenerator,
        methodName: "animate_transform",
      });
      this.defineSelfClosingElement("circle", { codeGenerator });
      this.defineSelfClosingElement("ellipse", { codeGenerator });
      this.defineSelfClosingElement("line", { codeGenerator });
      this.defineSelfClosingElement("path", { codeGenerator });
      this.defineSelfClosingElement("polygon", { codeGenerator });
      this.defineSelfClosingElement("polyline", { codeGenerator });
      this.defineSelfClosingElement("rect", { codeGenerator });
      this.defineSelfClosingElement("set", { codeGenerator });
      this.defineSelfClosingElement("stop", { codeGenerator });
      this.defineSelfClosingElement("use", { codeGenerator });
      this.defineSelfClosingElement("view", { codeGenerator });
      this.defineElement("a", { codeGenerator });
      this.defineElement("abbr", { codeGenerator });
      this.defineElement("address", { codeGenerator });
      this.defineElement("article", { codeGenerator });
      this.defineElement("aside", { codeGenerator });
      this.defineElement("audio", { codeGenerator });
      this.defineElement("b", { codeGenerator });
      this.defineElement("bdi", { codeGenerator });
      this.defineElement("bdo", { codeGenerator });
      this.defineElement("blockquote", { codeGenerator });
      this.defineElement("body", { codeGenerator });
      this.defineElement("button", { codeGenerator });
      this.defineElement("canvas", { codeGenerator });
      this.defineElement("caption", { codeGenerator });
      this.defineElement("cite", { codeGenerator });
      this.defineElement("code", { codeGenerator });
      this.defineElement("colgroup", { codeGenerator });
      this.defineElement("data", { codeGenerator });
      this.defineElement("datalist", { codeGenerator });
      this.defineElement("dd", { codeGenerator });
      this.defineElement("del", { codeGenerator });
      this.defineElement("details", { codeGenerator });
      this.defineElement("dfn", { codeGenerator });
      this.defineElement("dialog", { codeGenerator });
      this.defineElement("div", { codeGenerator });
      this.defineElement("dl", { codeGenerator });
      this.defineElement("dt", { codeGenerator });
      this.defineElement("em", { codeGenerator });
      this.defineElement("fieldset", { codeGenerator });
      this.defineElement("figcaption", { codeGenerator });
      this.defineElement("figure", { codeGenerator });
      this.defineElement("footer", { codeGenerator });
      this.defineElement("form", { codeGenerator });
      this.defineElement("h1", { codeGenerator });
      this.defineElement("h2", { codeGenerator });
      this.defineElement("h3", { codeGenerator });
      this.defineElement("h4", { codeGenerator });
      this.defineElement("h5", { codeGenerator });
      this.defineElement("h6", { codeGenerator });
      this.defineElement("head", { codeGenerator });
      this.defineElement("header", { codeGenerator });
      this.defineElement("hgroup", { codeGenerator });
      this.defineElement("html", { codeGenerator });
      this.defineElement("i", { codeGenerator });
      this.defineElement("iframe", { codeGenerator });
      this.defineElement("ins", { codeGenerator });
      this.defineElement("kbd", { codeGenerator });
      this.defineElement("label", { codeGenerator });
      this.defineElement("legend", { codeGenerator });
      this.defineElement("li", { codeGenerator });
      this.defineElement("main", { codeGenerator });
      this.defineElement("map", { codeGenerator });
      this.defineElement("mark", { codeGenerator });
      this.defineElement("menu", { codeGenerator });
      this.defineElement("meter", { codeGenerator });
      this.defineElement("nav", { codeGenerator });
      this.defineElement("noscript", { codeGenerator });
      this.defineElement("object", { codeGenerator });
      this.defineElement("ol", { codeGenerator });
      this.defineElement("optgroup", { codeGenerator });
      this.defineElement("option", { codeGenerator });
      this.defineElement("output", { codeGenerator });
      this.defineElement("p", { codeGenerator });
      this.defineElement("picture", { codeGenerator });
      this.defineElement("portal", { codeGenerator });
      this.defineElement("pre", { codeGenerator });
      this.defineElement("progress", { codeGenerator });
      this.defineElement("q", { codeGenerator });
      this.defineElement("rp", { codeGenerator });
      this.defineElement("rt", { codeGenerator });
      this.defineElement("ruby", { codeGenerator });
      this.defineElement("s", { codeGenerator });
      this.defineElement("samp", { codeGenerator });
      this.defineElement("script", { codeGenerator });
      this.defineElement("search", { codeGenerator });
      this.defineElement("section", { codeGenerator });
      this.defineElement("select", { codeGenerator });
      this.defineElement("slot", { codeGenerator });
      this.defineElement("small", { codeGenerator });
      this.defineElement("span", { codeGenerator });
      this.defineElement("strong", { codeGenerator });
      this.defineElement("style", { codeGenerator });
      this.defineElement("sub", { codeGenerator });
      this.defineElement("summary", { codeGenerator });
      this.defineElement("sup", { codeGenerator });
      this.defineElement("table", { codeGenerator });
      this.defineElement("tbody", { codeGenerator });
      this.defineElement("td", { codeGenerator });
      this.defineElement("template", { codeGenerator });
      this.defineElement("textarea", { codeGenerator });
      this.defineElement("tfoot", { codeGenerator });
      this.defineElement("th", { codeGenerator });
      this.defineElement("thead", { codeGenerator });
      this.defineElement("time", { codeGenerator });
      this.defineElement("title", { codeGenerator });
      this.defineElement("tr", { codeGenerator });
      this.defineElement("u", { codeGenerator });
      this.defineElement("ul", { codeGenerator });
      this.defineElement("var", { codeGenerator });
      this.defineElement("video", { codeGenerator });
    });
  }

  /** @internal */
  viewContext: TagHelperHost;

  constructor(viewContext: TagHelperHost) {
    this.viewContext = viewContext;
  }

  attributes(attributes: Record<string, unknown> | null | undefined): SafeBuffer {
    if (!attributes) return htmlSafe("");
    const result = (this.tagOptions(attributes) ?? "").trim();
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
    return this.contentTagString(name, actualContent, options, escape);
  }

  selfClosingTagString(
    name: string,
    options: Record<string, unknown>,
    escape: boolean = true,
    tagSuffix: string = " />",
  ): SafeBuffer {
    return htmlSafe(`<${name}${this.tagOptions(options, escape) ?? ""}${tagSuffix}`);
  }

  contentTagString(
    name: string,
    content: unknown,
    options: Record<string, unknown> | Hash<string, unknown> | null | undefined,
    escape: boolean = true,
  ): SafeBuffer {
    let tagOptions: string | null | undefined;
    if (options != null) tagOptions = this.tagOptions(options, escape);

    if (escape && isPresent(content)) {
      content = unwrappedHtmlEscape(content);
    }
    return htmlSafe(
      `<${name}${tagOptions ?? ""}>${PRE_CONTENT_STRINGS[name] ?? ""}${content ?? ""}</${name}>`,
    );
  }

  tagOptions(
    options: Record<string, unknown> | Hash<string, unknown> | null | undefined,
    escape: boolean = true,
  ): string | null {
    if (isBlank(options)) return null;
    let output = "";
    const sep = " ";
    eachPair(options!, (key: string, value: unknown) => {
      if (DATA_PREFIXES.has(key) && (isPlainObject(value) || value instanceof Hash)) {
        eachPair(value, (k: string, v: unknown) => {
          if (v == null) return;
          output += sep;
          output += this.prefixTagOption(key, k, v, escape);
        });
      } else if (ARIA_PREFIXES.has(key) && (isPlainObject(value) || value instanceof Hash)) {
        eachPair(value, (k: string, v: unknown) => {
          if (v == null) return;

          if (Array.isArray(v) || isPlainObject(v) || v instanceof Hash) {
            const tokens = buildTagValues(v);
            if (tokens.length === 0) return;

            v = safeJoin(tokens, " ");
          } else {
            v = String(v);
          }

          output += sep;
          output += this.prefixTagOption(key, k, v, escape);
        });
      } else if (BOOLEAN_ATTRIBUTES.has(key)) {
        if (value != null && value !== false) {
          output += sep;
          output += this.booleanTagOption(key);
        }
      } else if (value != null) {
        output += sep;
        output += this.tagOption(key, value, escape);
      }
    });
    return output === "" ? null : output;
  }

  booleanTagOption(key: string): string {
    return `${key}="${key}"`;
  }

  tagOption(key: string, value: unknown, escape: boolean): string {
    if (escape) {
      key = xmlNameEscape(key);
    }

    let strValue: string;

    if (
      Array.isArray(value) ||
      value instanceof Hash ||
      (typeof value === "object" &&
        value !== null &&
        !(value instanceof SafeBuffer) &&
        !(value instanceof RegExp))
    ) {
      if (key === "class") {
        const built = buildTagValues(value);
        strValue = escape ? safeJoin(built, " ").toString() : built.map((v) => String(v)).join(" ");
      } else {
        const arr = Array.isArray(value)
          ? value
          : value instanceof Hash
            ? [...value.values()]
            : Object.values(value as Record<string, unknown>);
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
  private prefixTagOption(prefix: string, key: string, value: unknown, escape: boolean): string {
    key = `${prefix}-${dasherize(String(key))}`;
    if (typeof value === "string" || value instanceof SafeBuffer) {
      /** @empty */
    } else if (
      Array.isArray(value) ||
      (typeof value === "object" && value !== null && !(value instanceof RegExp))
    ) {
      try {
        value = JSON.stringify(value instanceof Hash ? Object.fromEntries(value) : value);
      } catch {
        value = String(value);
      }
    } else {
      value = String(value);
    }
    return this.tagOption(key, value, escape);
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
