import { SafeBuffer, htmlSafe } from "@blazetrails/activesupport";

/**
 * ActionView::Helpers::SanitizeHelper
 *
 * Provides sanitize, strip_tags, and strip_links methods.
 * Uses a pluggable sanitizer vendor system.
 */

export interface Sanitizer {
  sanitize(html: string | null | undefined, options?: Record<string, unknown>): string;
  sanitizeCss?(style: string): string;
}

export interface SanitizerClass {
  new (): Sanitizer;
  allowedTags?: string[];
  allowedAttributes?: string[];
}

export interface SanitizerVendor {
  fullSanitizer: SanitizerClass;
  linkSanitizer: SanitizerClass;
  safeListSanitizer: SanitizerClass & {
    allowedTags: string[];
    allowedAttributes: string[];
  };
}

/**
 * Default sanitizer using basic regex tag stripping.
 *
 * This is NOT safe for untrusted input — configure a real HTML
 * parser-based SanitizerVendor (e.g. DOMPurify) for production use.
 */
class DefaultFullSanitizer implements Sanitizer {
  sanitize(html: string): string {
    if (html === null || html === undefined) return "";
    return html.replace(/<[^>]*>/g, "");
  }
}

class DefaultLinkSanitizer implements Sanitizer {
  sanitize(html: string): string {
    if (html === null || html === undefined) return "";
    return html.replace(/<\/?a\b[^>]*>/gi, "");
  }
}

const DEFAULT_ALLOWED_TAGS = [
  "strong",
  "em",
  "b",
  "i",
  "p",
  "code",
  "pre",
  "tt",
  "samp",
  "kbd",
  "var",
  "sub",
  "sup",
  "dfn",
  "cite",
  "big",
  "small",
  "address",
  "hr",
  "br",
  "div",
  "span",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "abbr",
  "acronym",
  "a",
  "img",
  "blockquote",
  "del",
  "ins",
];

const DEFAULT_ALLOWED_ATTRIBUTES = [
  "href",
  "src",
  "width",
  "height",
  "alt",
  "cite",
  "datetime",
  "title",
  "class",
  "name",
  "xml:lang",
  "abbr",
];

class DefaultSafeListSanitizer implements Sanitizer {
  static allowedTags = DEFAULT_ALLOWED_TAGS;
  static allowedAttributes = DEFAULT_ALLOWED_ATTRIBUTES;

  sanitize(html: string, options: Record<string, unknown> = {}): string {
    if (html === null || html === undefined) return "";

    const ctor = this.constructor as typeof DefaultSafeListSanitizer;
    const allowedTags = (options.tags as string[]) || ctor.allowedTags;
    const allowedAttrs = (options.attributes as string[]) || ctor.allowedAttributes;

    return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9:-]*)\b[^>]*>/gi, (match, tagName) => {
      const lower = tagName.toLowerCase();
      if (!allowedTags.includes(lower)) {
        return "";
      }

      // For allowed tags, filter attributes
      if (match.startsWith("</")) {
        return `</${lower}>`;
      }

      const attrRegex = /\s+([a-zA-Z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
      let attrMatch;
      const attrs: string[] = [];
      while ((attrMatch = attrRegex.exec(match)) !== null) {
        const attrName = attrMatch[1].toLowerCase();
        if (allowedAttrs.includes(attrName)) {
          const rawValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";
          // Reject dangerous URI schemes (strip control chars to prevent obfuscation)
          if (
            (attrName === "href" || attrName === "src") &&
            // eslint-disable-next-line no-control-regex -- intentionally stripping control chars
            /^\s*(?:javascript|vbscript|data):/i.test(rawValue.replace(/[\x00-\x1f]/g, ""))
          ) {
            continue;
          }
          const escaped = rawValue
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          attrs.push(`${attrName}="${escaped}"`);
        }
      }

      const isSelfClosing = match.endsWith("/>");
      const attrStr = attrs.length > 0 ? " " + attrs.join(" ") : "";
      return isSelfClosing ? `<${lower}${attrStr} />` : `<${lower}${attrStr}>`;
    });
  }

  sanitizeCss(style: string): string {
    // Strip potentially dangerous CSS properties
    return style
      .split(";")
      .filter((prop) => {
        const trimmed = prop.trim().toLowerCase();
        return (
          trimmed !== "" && !trimmed.startsWith("background") && !trimmed.startsWith("expression")
        );
      })
      .join("; ");
  }
}

const DefaultVendor: SanitizerVendor = {
  fullSanitizer: DefaultFullSanitizer as unknown as SanitizerClass,
  linkSanitizer: DefaultLinkSanitizer as unknown as SanitizerClass,
  safeListSanitizer: DefaultSafeListSanitizer as unknown as SanitizerClass & {
    allowedTags: string[];
    allowedAttributes: string[];
  },
};

let _sanitizerVendor: SanitizerVendor = DefaultVendor;

export function getSanitizerVendor(): SanitizerVendor {
  return _sanitizerVendor;
}

export function setSanitizerVendor(vendor: SanitizerVendor): void {
  _sanitizerVendor = vendor;
  // Reset memoized instances
  _fullSanitizer = null;
  _linkSanitizer = null;
  _safeListSanitizer = null;
}

let _fullSanitizer: Sanitizer | null = null;
let _linkSanitizer: Sanitizer | null = null;
let _safeListSanitizer: Sanitizer | null = null;

export function getFullSanitizer(): Sanitizer {
  if (!_fullSanitizer) {
    _fullSanitizer = new _sanitizerVendor.fullSanitizer();
  }
  return _fullSanitizer;
}

export function setFullSanitizer(sanitizer: Sanitizer): void {
  _fullSanitizer = sanitizer;
}

export function getLinkSanitizer(): Sanitizer {
  if (!_linkSanitizer) {
    _linkSanitizer = new _sanitizerVendor.linkSanitizer();
  }
  return _linkSanitizer;
}

export function setLinkSanitizer(sanitizer: Sanitizer): void {
  _linkSanitizer = sanitizer;
}

export function getSafeListSanitizer(): Sanitizer {
  if (!_safeListSanitizer) {
    _safeListSanitizer = new _sanitizerVendor.safeListSanitizer();
  }
  return _safeListSanitizer;
}

export function setSafeListSanitizer(sanitizer: Sanitizer): void {
  _safeListSanitizer = sanitizer;
}

export function sanitizedAllowedTags(): string[] {
  return _sanitizerVendor.safeListSanitizer.allowedTags;
}

export function sanitizedAllowedAttributes(): string[] {
  return _sanitizerVendor.safeListSanitizer.allowedAttributes;
}

/**
 * sanitize — sanitizes HTML input, stripping dangerous tags/attributes.
 */
export function sanitize(
  html: string | null | undefined,
  options: Record<string, unknown> = {},
): SafeBuffer {
  const result = getSafeListSanitizer().sanitize(html ?? "", options);
  return htmlSafe(result ?? "");
}

/**
 * sanitizeCss — sanitizes a block of CSS code.
 */
export function sanitizeCss(style: string): string {
  const sanitizer = getSafeListSanitizer();
  if (sanitizer.sanitizeCss) {
    return sanitizer.sanitizeCss(style);
  }
  return style;
}

/**
 * stripTags — strips all HTML tags from the input.
 */
export function stripTags(html: string | null | undefined): SafeBuffer {
  const result = getFullSanitizer().sanitize(html ?? "");
  return htmlSafe(result ?? "");
}

/**
 * stripLinks — strips all link tags, leaving link text.
 */
export function stripLinks(html: string | null | undefined): string {
  return getLinkSanitizer().sanitize(html ?? "");
}
