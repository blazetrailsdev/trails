import { Concern, SafeBuffer, extend, htmlSafe, mattrAccessor } from "@blazetrails/activesupport";
import { ActionView as RailsHtmlSanitizer, HTML4 } from "@blazetrails/html-sanitizer";

export interface Sanitizer {
  sanitize(
    html: string | null | undefined,
    options?: Record<string, unknown>,
  ): string | null | undefined;
  sanitizeCss?(style: string): string;
}

export interface SanitizerClass {
  new (): Sanitizer;
}

export interface SanitizerVendor {
  fullSanitizer: SanitizerClass;
  linkSanitizer: SanitizerClass;
  safeListSanitizer: SanitizerClass & {
    allowedTags: Iterable<string>;
    allowedAttributes: Iterable<string>;
  };
}

export interface SanitizeHelperClass {
  readonly sanitizerVendor: SanitizerVendor;
  fullSanitizer: Sanitizer;
  linkSanitizer: Sanitizer;
  safeListSanitizer: Sanitizer;
  _fullSanitizer?: Sanitizer;
  _linkSanitizer?: Sanitizer;
  _safeListSanitizer?: Sanitizer;
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
  return (this.constructor as SanitizeHelperClass).safeListSanitizer.sanitizeCss!(style);
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
    (this as unknown as SanitizeHelperClass)._fullSanitizer = value;
  },

  set linkSanitizer(value: Sanitizer) {
    (this as unknown as SanitizeHelperClass)._linkSanitizer = value;
  },

  set safeListSanitizer(value: Sanitizer) {
    (this as unknown as SanitizeHelperClass)._safeListSanitizer = value;
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
    const self = this as unknown as SanitizeHelperClass;
    if (!Object.hasOwn(self, "_fullSanitizer") || self._fullSanitizer == null) {
      self._fullSanitizer = new self.sanitizerVendor.fullSanitizer();
    }
    return self._fullSanitizer;
  },

  get linkSanitizer(): Sanitizer {
    const self = this as unknown as SanitizeHelperClass;
    if (!Object.hasOwn(self, "_linkSanitizer") || self._linkSanitizer == null) {
      self._linkSanitizer = new self.sanitizerVendor.linkSanitizer();
    }
    return self._linkSanitizer;
  },

  get safeListSanitizer(): Sanitizer {
    const self = this as unknown as SanitizeHelperClass;
    if (!Object.hasOwn(self, "_safeListSanitizer") || self._safeListSanitizer == null) {
      self._safeListSanitizer = new self.sanitizerVendor.safeListSanitizer();
    }
    return self._safeListSanitizer;
  },
};

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
