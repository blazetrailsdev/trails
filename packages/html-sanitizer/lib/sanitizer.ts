import * as Nokogiri from "@blazetrails/nokogiri";
import { HTML, HTML4, HTML5, type VendorMethods } from "./namespaces.js";
import { safeListSanitize, stripAllTags, unwrapTagsAndStripAttributes } from "./engine.js";
import { DEFAULT_ALLOWED_ATTRIBUTES, DEFAULT_ALLOWED_TAGS } from "./config.js";

export abstract class Sanitizer {
  declare static readonly fullSanitizer: VendorMethods["fullSanitizer"];
  declare static readonly linkSanitizer: VendorMethods["linkSanitizer"];
  declare static readonly safeListSanitizer: VendorMethods["safeListSanitizer"];
  declare static readonly whiteListSanitizer: VendorMethods["whiteListSanitizer"];
  declare private static _html5Support: boolean | undefined;

  static isHtml5Support(): boolean {
    if (Object.hasOwn(this, "_html5Support")) return this._html5Support!;

    return (this._html5Support = "HTML5" in Nokogiri);
  }

  static bestSupportedVendor(): VendorMethods {
    return this.isHtml5Support() ? HTML5.Sanitizer : HTML4.Sanitizer;
  }

  abstract sanitize(
    html: string | null | undefined,
    options?: SanitizeOptions,
  ): string | null | undefined;
}

export interface SanitizeOptions {
  tags?: Iterable<string>;
  attributes?: Iterable<string>;
}

/** @internal */
export function isTrivialInput(html: string | null | undefined): boolean {
  return html == null || html.length === 0;
}

HTML.Sanitizer = Sanitizer;

export class HTML4FullSanitizer extends Sanitizer {
  sanitize(html: string | null | undefined): string | null | undefined {
    if (isTrivialInput(html)) return html;
    return stripAllTags(html as string);
  }
}

export class HTML4LinkSanitizer extends Sanitizer {
  sanitize(html: string | null | undefined): string | null | undefined {
    if (isTrivialInput(html)) return html;
    return unwrapTagsAndStripAttributes(html as string, ["a"], ["href"]);
  }
}

export class HTML4SafeListSanitizer extends Sanitizer {
  static allowedTags: Set<string> = new Set(DEFAULT_ALLOWED_TAGS);

  static allowedAttributes: Set<string> = new Set(DEFAULT_ALLOWED_ATTRIBUTES);

  private readonly prune: boolean;

  constructor(options: { prune?: boolean } = {}) {
    super();
    this.prune = options.prune ?? false;
  }

  sanitize(
    html: string | null | undefined,
    options: SanitizeOptions = {},
  ): string | null | undefined {
    if (isTrivialInput(html)) return html;

    const tags = resolveAllowlist(
      options.tags,
      (this.constructor as typeof HTML4SafeListSanitizer).allowedTags,
      "tags",
    );
    const attributes = resolveAllowlist(
      options.attributes,
      (this.constructor as typeof HTML4SafeListSanitizer).allowedAttributes,
      "attributes",
    );

    return safeListSanitize(html as string, {
      allowedTags: tags,
      allowedAttributes: attributes,
      prune: this.prune,
    });
  }
}

export class HTML5FullSanitizer extends Sanitizer {
  sanitize(html: string | null | undefined): string | null | undefined {
    if (isTrivialInput(html)) return html;
    return stripAllTags(html as string);
  }
}

export class HTML5LinkSanitizer extends Sanitizer {
  sanitize(html: string | null | undefined): string | null | undefined {
    if (isTrivialInput(html)) return html;
    return unwrapTagsAndStripAttributes(html as string, ["a"], ["href"]);
  }
}

export class HTML5SafeListSanitizer extends Sanitizer {
  static allowedTags: Set<string> = new Set(DEFAULT_ALLOWED_TAGS);

  static allowedAttributes: Set<string> = new Set(DEFAULT_ALLOWED_ATTRIBUTES);

  private readonly prune: boolean;

  constructor(options: { prune?: boolean } = {}) {
    super();
    this.prune = options.prune ?? false;
  }

  sanitize(
    html: string | null | undefined,
    options: SanitizeOptions = {},
  ): string | null | undefined {
    if (isTrivialInput(html)) return html;

    const tags = resolveAllowlist(
      options.tags,
      (this.constructor as typeof HTML5SafeListSanitizer).allowedTags,
      "tags",
    );
    const attributes = resolveAllowlist(
      options.attributes,
      (this.constructor as typeof HTML5SafeListSanitizer).allowedAttributes,
      "attributes",
    );

    return safeListSanitize(html as string, {
      allowedTags: tags,
      allowedAttributes: attributes,
      prune: this.prune,
    });
  }
}

function resolveAllowlist(
  override: Iterable<string> | undefined,
  fallback: Set<string>,
  label: "tags" | "attributes",
): string[] {
  if (override === undefined) return [...fallback];
  if (typeof override === "string") {
    throw new TypeError(
      `SafeListSanitizer: \`${label}\` must be an iterable of strings, not a string`,
    );
  }
  return [...override];
}
