import {
  SafeBuffer,
  htmlEscape,
  htmlSafe,
  htmlEscapeOnce,
  xmlNameEscape,
} from "@blazetrails/activesupport";
import { safeJoin } from "./output-safety-helper.js";

/**
 * ActionView::Helpers::TagHelper
 */

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

// Map from method_name (underscore) to actual SVG element name (camelCase)
const METHOD_TO_TAG_NAME: Record<string, string> = {
  animate_motion: "animateMotion",
  animate_transform: "animateTransform",
};

function ensureValidHtml5TagName(name: string): void {
  if (!/^[a-zA-Z][a-zA-Z0-9\-:.]*$/.test(name)) {
    throw new ArgumentError(`Invalid HTML5 tag name: ${JSON.stringify(name)}`);
  }
}

class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

function dasherize(str: string): string {
  return str.replace(/_/g, "-");
}

/**
 * buildTagValues — constructs a flat array of CSS class values from mixed inputs.
 */
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

/**
 * Like buildTagValues but preserves SafeBuffer instances for html_safe-aware joining.
 */
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

function prefixTagOption(prefix: string, key: string, value: unknown, escape: boolean): string {
  const dasherizedKey = `${prefix}-${dasherize(String(key))}`;
  if (typeof value === "string" || value instanceof SafeBuffer || typeof value === "symbol") {
    // Pass through as-is
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

/**
 * tag() — legacy tag helper. Returns self-closing XHTML tag.
 * tag("br") => "<br />"
 * tag("br", nil, true) => "<br>"
 * Called with no arguments, returns the TagBuilder proxy.
 */
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

/**
 * contentTag — creates an HTML block tag wrapping content.
 */
export function contentTag(
  name: string,
  contentOrOptions?: unknown,
  options?: Record<string, unknown> | null,
  escape?: boolean,
  block?: () => unknown,
): SafeBuffer {
  ensureValidHtml5TagName(name);
  const esc = escape !== undefined ? escape : true;

  if (block) {
    const isPlainOpts =
      typeof contentOrOptions === "object" &&
      contentOrOptions !== null &&
      !(contentOrOptions instanceof SafeBuffer) &&
      !Array.isArray(contentOrOptions);
    const opts = isPlainOpts ? (contentOrOptions as Record<string, unknown>) : options;
    return contentTagString(name, block(), opts ?? undefined, esc);
  }

  return contentTagString(name, contentOrOptions, options ?? undefined, esc);
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

/**
 * tokenList / classNames — builds a deduplicated list of CSS class tokens.
 */
export function tokenList(...args: unknown[]): SafeBuffer {
  const tokens = buildTagValues(...args)
    .flatMap((value) => {
      // Unescape HTML entities before splitting (for safe values)
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

/**
 * cdataSection — wraps content in a CDATA section.
 */
export function cdataSection(content: unknown): SafeBuffer {
  const str = String(content ?? "");
  const splitted = str.replace(/\]\]>/g, "]]]]><![CDATA[>");
  return htmlSafe(`<![CDATA[${splitted}]]>`);
}

/**
 * escapeOnce — escapes HTML without double-escaping.
 */
export function escapeOnce(html: string): SafeBuffer {
  return htmlEscapeOnce(html);
}

/**
 * TagBuilder — modern HTML5 tag builder accessed via tag.div, tag.p, etc.
 */
export class TagBuilder {
  /**
   * attributes() — transforms a hash into HTML attributes string.
   */
  attributes(attrs: Record<string, unknown> | null | undefined): SafeBuffer {
    if (!attrs) return htmlSafe("");
    const result = tagOptions(attrs).trim();
    return htmlSafe(result);
  }

  /**
   * Dynamic element methods are handled via Proxy
   */

  [key: string]: unknown;
}

function createTagBuilderProxy(): TagBuilder {
  const builder = new TagBuilder();

  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol") {
        return Reflect.get(target, prop, receiver);
      }

      // Prevent thenable assimilation (Promise/await duck-typing)
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return undefined;
      }

      // Known own properties
      if (
        prop === "attributes" ||
        prop === "constructor" ||
        prop === "publicMethods" ||
        prop === "public_methods"
      ) {
        return Reflect.get(target, prop, receiver);
      }

      // Return a function that builds the tag
      const methodName = String(prop);
      const tagName = METHOD_TO_TAG_NAME[methodName] ?? dasherize(methodName);

      return (contentOrOpts?: unknown, optsOrBlock?: Record<string, unknown> | (() => unknown)) => {
        ensureValidHtml5TagName(tagName);
        // Parse arguments: tag.div("content", {opts}), tag.div({opts}), tag.div({opts}, block), tag.div(block), tag.div("content", block)
        let content: unknown = undefined;
        let options: Record<string, unknown> = {};
        let escape = true;
        let block: ((tagBuilder?: unknown) => unknown) | undefined;

        if (typeof contentOrOpts === "function") {
          // tag.div(() => "content")
          block = contentOrOpts as () => unknown;
        } else if (
          typeof contentOrOpts === "object" &&
          contentOrOpts !== null &&
          !(contentOrOpts instanceof SafeBuffer) &&
          !Array.isArray(contentOrOpts)
        ) {
          // First arg is options: tag.div({class: "x"}) or tag.div({class: "x"}, block)
          options = { ...contentOrOpts } as Record<string, unknown>;
          if (typeof optsOrBlock === "function") {
            block = optsOrBlock;
          }
        } else {
          // First arg is content: tag.div("text") or tag.div("text", {opts})
          content = contentOrOpts;
          if (typeof optsOrBlock === "function") {
            block = optsOrBlock;
          } else if (typeof optsOrBlock === "object" && optsOrBlock !== null) {
            options = { ...optsOrBlock };
          }
        }

        // Extract escape option
        if (typeof options.escape === "boolean") {
          escape = options.escape;
          delete options.escape;
        }

        const hasOptions = Object.keys(options).length > 0;

        // Void elements don't accept content
        if (VOID_ELEMENTS.has(tagName)) {
          if (content !== undefined || block) {
            throw new ArgumentError(`No content allowed for void element "${tagName}"`);
          }
          return selfClosingTagString(tagName, options, escape, ">");
        }

        // Self-closing SVG elements
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

        // Regular elements
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
  }) as TagBuilder;
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

// For cases where people call tag() with no args to get the builder,
// also export a way to reset it (for testing)
export function resetTagBuilder(): void {
  _tagBuilder = null;
}
