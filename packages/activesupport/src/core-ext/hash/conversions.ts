import { RuntimeError } from "@blazetrails/ruby-compat";
import * as XmlMini from "../../xml-mini.js";
import { StringIO } from "@blazetrails/ruby-compat";
import { isBlank, isPresent } from "../object/blank.js";
import { isEmpty } from "@blazetrails/ruby-compat";
import { wrap } from "../../array-utils.js";
import { isPlainObject } from "../../hash-utils.js";
import { rbInspect as inspect } from "@blazetrails/ruby-compat";

export class DisallowedType extends Error {
  override name = "DisallowedType";

  constructor(type: unknown) {
    super(`Disallowed type attribute: ${inspect(type)}`);
  }
}

export const DISALLOWED_TYPES = ["symbol", "yaml"];

export class XMLConverter {
  private xml: unknown;
  private disallowedTypes: string[];

  constructor(xml: string | StringIO | null | undefined, disallowedTypes?: string[] | null) {
    this.xml = this.normalizeKeys(XmlMini.parse(xml));
    this.disallowedTypes = disallowedTypes ?? DISALLOWED_TYPES;
  }

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

  /** @missingRailsCall try — PERMANENT */
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

      return xmlValue["file"] instanceof StringIO ? xmlValue["file"] : xmlValue;
    }
    return null;
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
    return value["type"] === "string" && value["nil"] !== "true";
  }

  private isBecomeHash(value: Record<string, unknown>): boolean {
    return !this.isNothing(value) && !this.isGarbage(value);
  }

  private isNothing(value: Record<string, unknown>): boolean {
    return isBlank(value) || value["nil"] === "true";
  }

  private isGarbage(value: Record<string, unknown>): boolean {
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
