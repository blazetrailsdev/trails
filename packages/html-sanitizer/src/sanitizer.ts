import * as Nokogiri from "@blazetrails/nokogiri";
import { HTML4, HTML5, type VendorMethods } from "./namespaces.js";

export abstract class Sanitizer {
  private static _html5Support?: boolean;

  static isHtml5Support(): boolean {
    if (Object.prototype.hasOwnProperty.call(this, "_html5Support")) return this._html5Support!;

    return (this._html5Support = "HTML5" in Nokogiri);
  }

  static bestSupportedVendor(): VendorMethods {
    return this.isHtml5Support() ? HTML5.Sanitizer! : HTML4.Sanitizer;
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
