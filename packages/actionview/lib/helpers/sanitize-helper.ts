import { Concern, SafeBuffer, extend, htmlSafe, mattrAccessor } from "@blazetrails/activesupport";
import {
  ActionView as RailsHtmlSanitizer,
  HTML4,
  type Sanitizer as HtmlSanitizer,
} from "@blazetrails/html-sanitizer";

export type Sanitizer = Pick<HtmlSanitizer, "sanitize">;

type SafeListSanitizer = Sanitizer & { sanitizeCss(style: string): string };

export interface SanitizerClass {
  new (): Sanitizer;
}

export interface SanitizerVendor {
  fullSanitizer: SanitizerClass;
  linkSanitizer: SanitizerClass;
  safeListSanitizer: (new () => SafeListSanitizer) & {
    allowedTags: Iterable<string>;
    allowedAttributes: Iterable<string>;
  };
}

export interface SanitizeHelperClass {
  readonly sanitizerVendor: SanitizerVendor;
  fullSanitizer: Sanitizer;
  linkSanitizer: Sanitizer;
  safeListSanitizer: SafeListSanitizer;
  _fullSanitizer?: Sanitizer;
  _linkSanitizer?: Sanitizer;
  _safeListSanitizer?: SafeListSanitizer;
}

type SanitizeHelperHost = { constructor: unknown };

export function sanitize(
  this: SanitizeHelperHost,
  html: string | null | undefined,
  options: Record<string, unknown> = {},
): SafeBuffer | null {
  const result = (this.constructor as SanitizeHelperClass).safeListSanitizer.sanitize(
    html,
    options,
  );
  return result == null ? null : htmlSafe(result);
}

export function sanitizeCss(this: SanitizeHelperHost, style: string): string {
  return (this.constructor as SanitizeHelperClass).safeListSanitizer.sanitizeCss(style);
}

export function stripTags(
  this: SanitizeHelperHost,
  html: string | null | undefined,
): SafeBuffer | null {
  const result = (this.constructor as SanitizeHelperClass).fullSanitizer.sanitize(html);
  return result == null ? null : htmlSafe(result);
}

export function stripLinks(
  this: SanitizeHelperHost,
  html: string | null | undefined,
): string | null | undefined {
  return (this.constructor as SanitizeHelperClass).linkSanitizer.sanitize(html);
}

export const ClassMethods = {
  set fullSanitizer(value: Sanitizer) {
    this._fullSanitizer = value;
  },

  set linkSanitizer(value: Sanitizer) {
    this._linkSanitizer = value;
  },

  set safeListSanitizer(value: SafeListSanitizer) {
    this._safeListSanitizer = value;
  },

  get sanitizerVendor(): SanitizerVendor {
    return SanitizeHelper.sanitizerVendor;
  },

  sanitizedAllowedTags(this: SanitizeHelperClass): Iterable<string> {
    return this.sanitizerVendor.safeListSanitizer.allowedTags;
  },

  sanitizedAllowedAttributes(this: SanitizeHelperClass): Iterable<string> {
    return this.sanitizerVendor.safeListSanitizer.allowedAttributes;
  },

  get fullSanitizer(): Sanitizer {
    if (!Object.hasOwn(this, "_fullSanitizer") || this._fullSanitizer == null) {
      this._fullSanitizer = new this.sanitizerVendor.fullSanitizer();
    }
    return this._fullSanitizer;
  },

  get linkSanitizer(): Sanitizer {
    if (!Object.hasOwn(this, "_linkSanitizer") || this._linkSanitizer == null) {
      this._linkSanitizer = new this.sanitizerVendor.linkSanitizer();
    }
    return this._linkSanitizer;
  },

  get safeListSanitizer(): SafeListSanitizer {
    if (!Object.hasOwn(this, "_safeListSanitizer") || this._safeListSanitizer == null) {
      this._safeListSanitizer = new this.sanitizerVendor.safeListSanitizer();
    }
    return this._safeListSanitizer;
  },
} satisfies ThisType<SanitizeHelperClass>;

Object.defineProperties(
  ClassMethods,
  Object.getOwnPropertyDescriptors(RailsHtmlSanitizer.Helpers.SanitizeHelper.ClassMethods),
);
RailsHtmlSanitizer.Helpers.SanitizeHelper.ClassMethods = ClassMethods as typeof ClassMethods &
  typeof RailsHtmlSanitizer.Helpers.SanitizeHelper.ClassMethods;

export class SanitizeHelper {
  static ClassMethods = ClassMethods;
  declare static sanitizerVendor: SanitizerVendor;
}

mattrAccessor.call(SanitizeHelper, "sanitizerVendor", { default: HTML4.Sanitizer });
extend(SanitizeHelper, Concern);
Object.assign(SanitizeHelper.prototype, { sanitize, sanitizeCss, stripTags, stripLinks });
