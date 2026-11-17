import * as Nokogiri from "@blazetrails/nokogiri";
import type { Html5DocumentFragment } from "@blazetrails/nokogiri";
import { HTML, HTML4, HTML5, type VendorMethods } from "./namespaces.js";
import { Loofah } from "./loofah.js";
import { ScrubBehavior } from "./loofah/concerns.js";
import { Scrub } from "./loofah/html5/scrub.js";
import type { Scrubber } from "./loofah/scrubber.js";
import { PermitScrubber, TargetScrubber, TextOnlyScrubber } from "./scrubbers.js";
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
  scrubber?: Scrubber;
}

HTML.Sanitizer = Sanitizer;

export class HTML4FullSanitizer extends Sanitizer {
  sanitize(html: string | null | undefined): string | null | undefined {
    if (html == null) return null;
    if (html.length === 0) return html;

    return this.serialize(this.scrub(this.parseFragment(html)));
  }

  /** @internal */
  protected parseFragment(html: string): Html5DocumentFragment {
    return Loofah.html5Fragment(html);
  }

  scrub(fragment: Html5DocumentFragment, _options: SanitizeOptions = {}): Html5DocumentFragment {
    return ScrubBehavior.Node.scrubBang(fragment, new TextOnlyScrubber());
  }

  /** @internal */
  protected serialize(fragment: Html5DocumentFragment): string {
    return fragment.toHtml();
  }
}

export class HTML4LinkSanitizer extends Sanitizer {
  /** @internal */
  private readonly linkScrubber: TargetScrubber;

  constructor() {
    super();
    this.linkScrubber = new TargetScrubber();
    this.linkScrubber.tags = ["a"];
    this.linkScrubber.attributes = ["href"];
  }

  sanitize(html: string | null | undefined): string | null | undefined {
    if (html == null) return null;
    if (html.length === 0) return html;

    return this.serialize(this.scrub(this.parseFragment(html)));
  }

  /** @internal */
  protected parseFragment(html: string): Html5DocumentFragment {
    return Loofah.html5Fragment(html);
  }

  scrub(fragment: Html5DocumentFragment, _options: SanitizeOptions = {}): Html5DocumentFragment {
    return ScrubBehavior.Node.scrubBang(fragment, this.linkScrubber);
  }

  /** @internal */
  protected serialize(fragment: Html5DocumentFragment): string {
    return fragment.toHtml();
  }
}

export class HTML4SafeListSanitizer extends Sanitizer {
  static allowedTags: Set<string> = new Set(DEFAULT_ALLOWED_TAGS);

  static allowedAttributes: Set<string> = new Set(DEFAULT_ALLOWED_ATTRIBUTES);

  /** @internal */
  private readonly permitScrubber: PermitScrubber;

  constructor({ prune = false }: { prune?: boolean } = {}) {
    super();
    this.permitScrubber = new PermitScrubber({ prune });
  }

  sanitize(
    html: string | null | undefined,
    options: SanitizeOptions = {},
  ): string | null | undefined {
    if (html == null) return null;
    if (html.length === 0) return html;

    return this.serialize(this.scrub(this.parseFragment(html), options));
  }

  /** @internal */
  protected parseFragment(html: string): Html5DocumentFragment {
    return Loofah.html5Fragment(html);
  }

  scrub(fragment: Html5DocumentFragment, options: SanitizeOptions = {}): Html5DocumentFragment {
    const scrubber = options.scrubber;
    if (scrubber) {
      return ScrubBehavior.Node.scrubBang(fragment, scrubber);
    } else if (this.allowedTags(options) || this.allowedAttributes(options)) {
      this.permitScrubber.tags = this.allowedTags(options);
      this.permitScrubber.attributes = this.allowedAttributes(options);
      return ScrubBehavior.Node.scrubBang(fragment, this.permitScrubber);
    } else {
      return ScrubBehavior.Node.scrubBang(fragment, "strip");
    }
  }

  sanitizeCss(styleString: string): string {
    return Scrub.scrubCss(styleString);
  }

  /** @internal */
  protected serialize(fragment: Html5DocumentFragment): string {
    return fragment.toHtml();
  }

  /** @internal */
  private allowedTags(options: SanitizeOptions): Iterable<string> {
    return options.tags != null && (options.tags as unknown) !== false
      ? options.tags
      : (this.constructor as typeof HTML4SafeListSanitizer).allowedTags;
  }

  /** @internal */
  private allowedAttributes(options: SanitizeOptions): Iterable<string> {
    return options.attributes != null && (options.attributes as unknown) !== false
      ? options.attributes
      : (this.constructor as typeof HTML4SafeListSanitizer).allowedAttributes;
  }
}

export class HTML5FullSanitizer extends Sanitizer {
  sanitize(html: string | null | undefined): string | null | undefined {
    if (html == null) return null;
    if (html.length === 0) return html;

    return this.serialize(this.scrub(this.parseFragment(html)));
  }

  /** @internal */
  protected parseFragment(html: string): Html5DocumentFragment {
    return Loofah.html5Fragment(html);
  }

  scrub(fragment: Html5DocumentFragment, _options: SanitizeOptions = {}): Html5DocumentFragment {
    return ScrubBehavior.Node.scrubBang(fragment, new TextOnlyScrubber());
  }

  /** @internal */
  protected serialize(fragment: Html5DocumentFragment): string {
    return fragment.toHtml();
  }
}

export class HTML5LinkSanitizer extends Sanitizer {
  /** @internal */
  private readonly linkScrubber: TargetScrubber;

  constructor() {
    super();
    this.linkScrubber = new TargetScrubber();
    this.linkScrubber.tags = ["a"];
    this.linkScrubber.attributes = ["href"];
  }

  sanitize(html: string | null | undefined): string | null | undefined {
    if (html == null) return null;
    if (html.length === 0) return html;

    return this.serialize(this.scrub(this.parseFragment(html)));
  }

  /** @internal */
  protected parseFragment(html: string): Html5DocumentFragment {
    return Loofah.html5Fragment(html);
  }

  scrub(fragment: Html5DocumentFragment, _options: SanitizeOptions = {}): Html5DocumentFragment {
    return ScrubBehavior.Node.scrubBang(fragment, this.linkScrubber);
  }

  /** @internal */
  protected serialize(fragment: Html5DocumentFragment): string {
    return fragment.toHtml();
  }
}

export class HTML5SafeListSanitizer extends Sanitizer {
  static allowedTags: Set<string> = new Set(DEFAULT_ALLOWED_TAGS);

  static allowedAttributes: Set<string> = new Set(DEFAULT_ALLOWED_ATTRIBUTES);

  /** @internal */
  private readonly permitScrubber: PermitScrubber;

  constructor({ prune = false }: { prune?: boolean } = {}) {
    super();
    this.permitScrubber = new PermitScrubber({ prune });
  }

  sanitize(
    html: string | null | undefined,
    options: SanitizeOptions = {},
  ): string | null | undefined {
    if (html == null) return null;
    if (html.length === 0) return html;

    return this.serialize(this.scrub(this.parseFragment(html), options));
  }

  /** @internal */
  protected parseFragment(html: string): Html5DocumentFragment {
    return Loofah.html5Fragment(html);
  }

  scrub(fragment: Html5DocumentFragment, options: SanitizeOptions = {}): Html5DocumentFragment {
    const scrubber = options.scrubber;
    if (scrubber) {
      return ScrubBehavior.Node.scrubBang(fragment, scrubber);
    } else if (this.allowedTags(options) || this.allowedAttributes(options)) {
      this.permitScrubber.tags = this.allowedTags(options);
      this.permitScrubber.attributes = this.allowedAttributes(options);
      return ScrubBehavior.Node.scrubBang(fragment, this.permitScrubber);
    } else {
      return ScrubBehavior.Node.scrubBang(fragment, "strip");
    }
  }

  sanitizeCss(styleString: string): string {
    return Scrub.scrubCss(styleString);
  }

  /** @internal */
  protected serialize(fragment: Html5DocumentFragment): string {
    return fragment.toHtml();
  }

  /** @internal */
  private allowedTags(options: SanitizeOptions): Iterable<string> {
    return options.tags != null && (options.tags as unknown) !== false
      ? options.tags
      : (this.constructor as typeof HTML5SafeListSanitizer).allowedTags;
  }

  /** @internal */
  private allowedAttributes(options: SanitizeOptions): Iterable<string> {
    return options.attributes != null && (options.attributes as unknown) !== false
      ? options.attributes
      : (this.constructor as typeof HTML5SafeListSanitizer).allowedAttributes;
  }
}
