import {
  SafeBuffer,
  htmlEscape,
  htmlSafe,
  htmlEscapeOnce,
  xmlNameEscape,
} from "@blazetrails/activesupport";
import {
  raw as _raw,
  safeJoin as _safeJoin,
  toSentence as _toSentence,
  type ToSentenceOptions,
} from "./output-safety-helper.js";
import { ArgumentError } from "@blazetrails/ruby-compat";

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

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "keygen",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

const SELF_CLOSING_ELEMENTS = new Set([
  "animate",
  "animateMotion",
  "animateTransform",
  "circle",
  "ellipse",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
  "set",
  "stop",
  "use",
  "view",
]);

const METHOD_TO_TAG_NAME: Record<string, string> = {
  animate_motion: "animateMotion",
  animate_transform: "animateTransform",
};

/** @internal */
function ensureValidHtml5TagName(name: string): void {
  if (!/^[a-zA-Z][a-zA-Z0-9\-:.]*$/.test(name)) {
    throw new ArgumentError(`Invalid HTML5 tag name: ${JSON.stringify(name)}`);
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
  name?: string,
  options?: Record<string, unknown> | null,
  open?: boolean,
  escape?: boolean,
): SafeBuffer | TagBuilder {
  if (name === undefined) {
    return getTagBuilder();
  }
  ensureValidHtml5TagName(name);
  const esc = escape !== undefined ? escape : true;
  const opts = options ? tagOptions(options, esc) : "";
  const suffix = open ? ">" : " />";
  return htmlSafe(`<${name}${opts}${suffix}`);
}

export function contentTag(
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
    return contentTagString(name, block(), opts ?? undefined, esc);
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
  /** @internal */
  viewContext: unknown;

  constructor(viewContext?: unknown) {
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
    opts?: { escape?: boolean; block?: (tagBuilder: TagBuilder) => unknown },
  ): SafeBuffer {
    const escape = opts?.escape !== false;
    let actualContent: unknown = content;
    if (opts?.block) {
      const vc = this.viewContext as { capture?: (b: TagBuilder, fn: () => unknown) => unknown };
      actualContent =
        vc && typeof vc.capture === "function"
          ? vc.capture(this, () => opts.block!(this))
          : opts.block(this);
    }
    return contentTagString(name, actualContent, options ?? undefined, escape);
  }

  static defineElement(name: string, opts?: { methodName?: string }): void {
    if (opts?.methodName && opts.methodName !== name) {
      METHOD_TO_TAG_NAME[opts.methodName] = name;
    }
  }

  static defineVoidElement(name: string, opts?: { methodName?: string }): void {
    VOID_ELEMENTS.add(name);
    if (opts?.methodName && opts.methodName !== name) {
      METHOD_TO_TAG_NAME[opts.methodName] = name;
    }
  }

  static defineSelfClosingElement(name: string, opts?: { methodName?: string }): void {
    SELF_CLOSING_ELEMENTS.add(name);
    if (opts?.methodName && opts.methodName !== name) {
      METHOD_TO_TAG_NAME[opts.methodName] = name;
    }
  }

  [key: string]: unknown;
}

/** @internal */
export function tagBuilder(): TagBuilder {
  return getTagBuilder();
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

function createTagBuilderProxy(): TagBuilder {
  const builder = new TagBuilder();

  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol") {
        return Reflect.get(target, prop, receiver);
      }

      if (prop === "then" || prop === "catch" || prop === "finally") {
        return undefined;
      }

      if (
        prop === "attributes" ||
        prop === "tagString" ||
        prop === "viewContext" ||
        prop === "constructor" ||
        prop === "publicMethods" ||
        prop === "public_methods"
      ) {
        return Reflect.get(target, prop, receiver);
      }

      const methodName = String(prop);
      const tagName = METHOD_TO_TAG_NAME[methodName] ?? dasherize(methodName);

      return (contentOrOpts?: unknown, optsOrBlock?: Record<string, unknown> | (() => unknown)) => {
        ensureValidHtml5TagName(tagName);
        let content: unknown = undefined;
        let options: Record<string, unknown> = {};
        let escape = true;
        let block: ((tagBuilder?: unknown) => unknown) | undefined;

        if (typeof contentOrOpts === "function") {
          block = contentOrOpts as () => unknown;
        } else if (
          typeof contentOrOpts === "object" &&
          contentOrOpts !== null &&
          !(contentOrOpts instanceof SafeBuffer) &&
          !Array.isArray(contentOrOpts)
        ) {
          options = { ...contentOrOpts } as Record<string, unknown>;
          if (typeof optsOrBlock === "function") {
            block = optsOrBlock;
          }
        } else {
          content = contentOrOpts;
          if (typeof optsOrBlock === "function") {
            block = optsOrBlock;
          } else if (typeof optsOrBlock === "object" && optsOrBlock !== null) {
            options = { ...optsOrBlock };
          }
        }

        if (typeof options.escape === "boolean") {
          escape = options.escape;
          delete options.escape;
        }

        const hasOptions = Object.keys(options).length > 0;

        if (VOID_ELEMENTS.has(tagName)) {
          if (content !== undefined || block) {
            throw new ArgumentError(`No content allowed for void element "${tagName}"`);
          }
          return selfClosingTagString(tagName, options, escape, ">");
        }

        if (SELF_CLOSING_ELEMENTS.has(tagName) || SELF_CLOSING_ELEMENTS.has(methodName)) {
          const actualTagName = SELF_CLOSING_ELEMENTS.has(methodName) ? methodName : tagName;
          if (content !== undefined || block) {
            const blockContent = block ? block(receiver) : content;
            return contentTagString(
              actualTagName,
              blockContent,
              hasOptions ? options : undefined,
              escape,
            );
          }
          return selfClosingTagString(actualTagName, options, escape);
        }

        if (block) {
          const blockContent = block(receiver);
          return contentTagString(tagName, blockContent, hasOptions ? options : undefined, escape);
        }

        return contentTagString(
          tagName,
          content !== undefined ? content : "",
          hasOptions ? options : undefined,
          escape,
        );
      };
    },

    has() {
      return true;
    },
  });
}

function selfClosingTagString(
  name: string,
  options: Record<string, unknown>,
  escape: boolean = true,
  tagSuffix: string = " />",
): SafeBuffer {
  const opts = Object.keys(options).length > 0 ? tagOptions(options, escape) : "";
  return htmlSafe(`<${name}${opts}${tagSuffix}`);
}

let _tagBuilder: TagBuilder | null = null;

function getTagBuilder(): TagBuilder {
  if (!_tagBuilder) {
    _tagBuilder = createTagBuilderProxy();
  }
  return _tagBuilder;
}

export function resetTagBuilder(): void {
  _tagBuilder = null;
}
