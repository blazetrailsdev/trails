import { camelize, TopLevel, underscore } from "@blazetrails/activesupport";
import type { Html5Node } from "@blazetrails/nokogiri";
import {
  except,
  excBacktrace,
  kernelInteger,
  rbInspect,
  rbModName,
  slice,
  toS,
} from "@blazetrails/ruby-compat";
import { ActionText } from "./action-text.js";
import { HtmlConversion } from "./html-conversion.js";

type Typecast = (value: unknown) => unknown;

export class TrixAttachment {
  static readonly TAG_NAME = "figure";
  static readonly SELECTOR = "[data-trix-attachment]";

  static readonly COMPOSED_ATTRIBUTES = ["caption", "presentation"];
  static readonly ATTRIBUTES = [
    "sgid",
    "contentType",
    "url",
    "href",
    "filename",
    "filesize",
    "width",
    "height",
    "previewable",
    "content",
    ...TrixAttachment.COMPOSED_ATTRIBUTES,
  ];
  static readonly ATTRIBUTE_TYPES: Record<string, Typecast> = {
    __proto__: null,
    previewable: (value: unknown) => toS(value) === "true",
    filesize: (value: unknown) => kernelInteger(toS(value), 0, { exception: false }) ?? value,
    width: (value: unknown) => kernelInteger(toS(value), 0, { exception: false }),
    height: (value: unknown) => kernelInteger(toS(value), 0, { exception: false }),
    ":default": (value: unknown) => toS(value),
  } as unknown as Record<string, Typecast>;

  static fromAttributes(attributes: Record<string, unknown>): TrixAttachment {
    attributes = this.processAttributes(attributes);

    const trixAttachmentAttributes = except(attributes, ...this.COMPOSED_ATTRIBUTES);
    const trixAttributes = slice(attributes, ...this.COMPOSED_ATTRIBUTES);

    const node = HtmlConversion.createElement(this.TAG_NAME);
    node.set("data-trix-attachment", JSON.stringify(trixAttachmentAttributes));
    if (Object.keys(trixAttributes).length > 0) {
      node.set("data-trix-attributes", JSON.stringify(trixAttributes));
    }

    return new this(node);
  }

  /** @internal */
  private static processAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
    return this.typecastAttributeValues(this.transformAttributeKeys(attributes));
  }

  /** @internal */
  private static transformAttributeKeys(
    attributes: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(attributes).map(([key, value]) => [
        camelize(underscore(toS(key)), false),
        value,
      ]),
    );
  }

  /** @internal */
  private static typecastAttributeValues(
    attributes: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(attributes).map(([key, value]) => {
        const typecast = this.ATTRIBUTE_TYPES[key] ?? this.ATTRIBUTE_TYPES[":default"];
        return [key, typecast(value)];
      }),
    );
  }

  readonly node: Html5Node;
  /** @internal */
  private _attributes?: Record<string, unknown>;

  constructor(node: Html5Node) {
    this.node = node;
  }

  get attributes(): Record<string, unknown> {
    return (this._attributes ??= slice(
      { ...this.attachmentAttributes(), ...this.composedAttributes() },
      ...TrixAttachment.ATTRIBUTES,
    ));
  }

  toHtml(): string {
    return HtmlConversion.nodeToHtml(this.node);
  }

  toString(): string {
    return this.toHtml();
  }

  /** @internal */
  private attachmentAttributes(): Record<string, unknown> {
    return this.readJsonObjectAttribute("data-trix-attachment");
  }

  /** @internal */
  private composedAttributes(): Record<string, unknown> {
    return this.readJsonObjectAttribute("data-trix-attributes");
  }

  /** @internal */
  private readJsonObjectAttribute(name: string): Record<string, unknown> {
    return (this.readJsonAttribute(name) as Record<string, unknown> | null) ?? {};
  }

  /** @internal */
  private readJsonAttribute(name: string): unknown {
    const value = this.node.get(name);
    if (value != null) {
      try {
        return JSON.parse(value);
      } catch (e) {
        const className = rbModName(this.constructor);
        TopLevel.Trails!.logger!.error(
          `[${className}] Couldn't parse JSON ${value} from NODE ${rbInspect(this.node)}`,
        );
        TopLevel.Trails!.logger!.error(
          `[${className}] Failed with ${rbModName((e as Error).constructor)}: ${rbInspect(excBacktrace(e as Error))}`,
        );
        return null;
      }
    }
    return null;
  }
}

ActionText.TrixAttachment = TrixAttachment;
