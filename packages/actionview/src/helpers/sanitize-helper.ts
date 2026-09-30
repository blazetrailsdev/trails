import { SafeBuffer, htmlSafe } from "@blazetrails/activesupport";
import { HTML4 } from "@blazetrails/html-sanitizer";

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

let _sanitizerVendor: SanitizerVendor = HTML4.Sanitizer;

export function getSanitizerVendor(): SanitizerVendor {
  return _sanitizerVendor;
}

export function setSanitizerVendor(vendor: SanitizerVendor): void {
  _sanitizerVendor = vendor;
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

export function sanitizedAllowedTags(): Iterable<string> {
  return _sanitizerVendor.safeListSanitizer.allowedTags;
}

export function sanitizedAllowedAttributes(): Iterable<string> {
  return _sanitizerVendor.safeListSanitizer.allowedAttributes;
}

export function sanitize(
  html: string | null | undefined,
  options: Record<string, unknown> = {},
): SafeBuffer {
  const result = getSafeListSanitizer().sanitize(html ?? "", options);
  return htmlSafe(result ?? "");
}

export function sanitizeCss(style: string): string {
  const sanitizer = getSafeListSanitizer();
  if (sanitizer.sanitizeCss) {
    return sanitizer.sanitizeCss(style);
  }
  return style;
}

export function stripTags(html: string | null | undefined): SafeBuffer {
  const result = getFullSanitizer().sanitize(html ?? "");
  return htmlSafe(result ?? "");
}

export function stripLinks(html: string | null | undefined): string | null | undefined {
  return getLinkSanitizer().sanitize(html ?? "");
}

export class SanitizeHelper {
  static get fullSanitizer(): Sanitizer {
    return getFullSanitizer();
  }
  static set fullSanitizer(value: Sanitizer) {
    setFullSanitizer(value);
  }

  static get linkSanitizer(): Sanitizer {
    return getLinkSanitizer();
  }
  static set linkSanitizer(value: Sanitizer) {
    setLinkSanitizer(value);
  }

  static get safeListSanitizer(): Sanitizer {
    return getSafeListSanitizer();
  }
  static set safeListSanitizer(value: Sanitizer) {
    setSafeListSanitizer(value);
  }

  static get sanitizerVendor(): SanitizerVendor {
    return getSanitizerVendor();
  }
}
