/**
 * `ActiveSupport::XMLConverter` — the `Hash.from_xml` half of
 * `core_ext/hash/conversions.rb:138-262`. The four `Hash` members themselves
 * live at the trails seat for Hash core extensions, `hash-utils.ts`.
 */

import * as XmlMini from "../../xml-mini.js";
import { StringIO } from "../../string-io.js";
import { isBlank, isPresent } from "../object/blank.js";
import { isEmpty } from "../../ruby-empty.js";
import { wrap } from "../../array-utils.js";
import { isPlainObject } from "../../hash-utils.js";
import { inspect } from "../object/inspect.js";

/** Mirrors Ruby's `RuntimeError` — what a bare `raise "message"` raises. */
class RuntimeError extends Error {
  override name = "RuntimeError";
}

/**
 * Raised if the XML contains attributes with type="yaml" or
 * type="symbol". Read Hash#from_xml for more details.
 *
 * Mirrors: ActiveSupport::XMLConverter::DisallowedType (conversions.rb:142-147)
 */
export class DisallowedType extends Error {
  override name = "DisallowedType";

  constructor(type: unknown) {
    super(`Disallowed type attribute: ${inspect(type)}`);
  }
}

/** Mirrors: ActiveSupport::XMLConverter::DISALLOWED_TYPES (conversions.rb:149) */
export const DISALLOWED_TYPES = ["symbol", "yaml"];

/** Mirrors: ActiveSupport::XMLConverter (conversions.rb:140-262). */
export class XMLConverter {
  private xml: unknown;
  private disallowedTypes: string[];

  /** Mirrors: ActiveSupport::XMLConverter#initialize (conversions.rb:151-154). */
  constructor(xml: string | StringIO | null | undefined, disallowedTypes?: string[] | null) {
    this.xml = this.normalizeKeys(XmlMini.parse(xml));
    this.disallowedTypes = disallowedTypes ?? DISALLOWED_TYPES;
  }

  /** Mirrors: ActiveSupport::XMLConverter#to_h (conversions.rb:156-158) */
  toH(): unknown {
    return this.deepToH(this.xml);
  }

  private normalizeKeys(params: unknown): unknown {
    if (isPlainObject(params)) {
      return Object.fromEntries(
        Object.entries(params).map(([k, v]) => [
          String(k).replaceAll("-", "_"),
          this.normalizeKeys(v),
        ]),
      );
    } else if (Array.isArray(params)) {
      return params.map((v) => this.normalizeKeys(v));
    } else {
      return params;
    }
  }

  private deepToH(value: unknown): unknown {
    if (isPlainObject(value)) {
      return this.processHash(value);
    } else if (Array.isArray(value)) {
      return this.processArray(value);
    } else if (typeof value === "string") {
      return value;
    } else {
      throw new RuntimeError(
        `can't typecast ${value == null ? "NilClass" : (value as object).constructor.name} - ${inspect(value)}`,
      );
    }
  }

  /**
   * @missingRailsCall try — PERMANENT: Language shortcoming: Rails writes
   * `value["__content__"].try(:empty?)` (conversions.rb:192), but `empty?` is a
   * real method on every Ruby receiver where trails' `isEmpty` is a free
   * function — a JS string has no `isEmpty` for `tryCall` to dispatch. The
   * nil-guard `try` supplies is spelled inline instead.
   */
  private processHash(value: Record<string, unknown>): unknown {
    if (
      Object.hasOwn(value, "type") &&
      !isPlainObject(value["type"]) &&
      this.disallowedTypes.includes(value["type"] as string)
    ) {
      throw new DisallowedType(value["type"]);
    }

    if (this.isBecomeArray(value)) {
      const [, entries] = wrap(
        Object.entries(value).find(([, v]) => typeof v !== "string") as unknown[] | undefined,
      );
      if (
        entries === null ||
        entries === undefined ||
        (value["__content__"] != null && isEmpty(value["__content__"]))
      ) {
        return [];
      } else if (Array.isArray(entries)) {
        return entries.map((v) => this.deepToH(v));
      } else if (isPlainObject(entries)) {
        return [this.deepToH(entries)];
      } else {
        throw new RuntimeError(`can't typecast ${inspect(entries)}`);
      }
    } else if (this.isBecomeContent(value)) {
      return this.processContent(value);
    } else if (this.isBecomeEmptyString(value)) {
      return "";
    } else if (this.isBecomeHash(value)) {
      const xmlValue: Record<string, unknown> = Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, this.deepToH(v)]),
      );

      // Turn { files: { file: StringIO } } into { files: StringIO } so it is compatible with
      // how multipart uploaded files from HTML appear
      return xmlValue["file"] instanceof StringIO ? xmlValue["file"] : xmlValue;
    }
    return undefined;
  }

  private isBecomeContent(value: Record<string, unknown>): boolean {
    return (
      value["type"] === "file" ||
      (value["__content__"] != null &&
        value["__content__"] !== false &&
        (Object.keys(value).length === 1 || isPresent(value["__content__"])))
    );
  }

  private isBecomeArray(value: Record<string, unknown>): boolean {
    return value["type"] === "array";
  }

  private isBecomeEmptyString(value: Record<string, unknown>): boolean {
    // { "string" => true }
    // No tests fail when the second term is removed.
    return value["type"] === "string" && value["nil"] !== "true";
  }

  private isBecomeHash(value: Record<string, unknown>): boolean {
    return !this.isNothing(value) && !this.isGarbage(value);
  }

  private isNothing(value: Record<string, unknown>): boolean {
    // blank or nil parsed values are represented by nil
    return isBlank(value) || value["nil"] === "true";
  }

  private isGarbage(value: Record<string, unknown>): boolean {
    // If the type is the only element which makes it then
    // this still makes the value nil, except if type is
    // an XML node(where type['value'] is a Hash)
    return (
      value["type"] != null &&
      value["type"] !== false &&
      !isPlainObject(value["type"]) &&
      Object.keys(value).length === 1
    );
  }

  private processContent(value: Record<string, unknown>): unknown {
    const content = value["__content__"];
    const parser = XmlMini.PARSING[value["type"] as string];
    if (parser) {
      return parser.length === 1
        ? parser(content)
        : parser(content, value as Record<string, string>);
    } else {
      return content;
    }
  }

  private processArray(value: unknown[]): unknown {
    for (let i = 0; i < value.length; i++) value[i] = this.deepToH(value[i]);
    return value.length > 1 ? value : value[0];
  }
}
