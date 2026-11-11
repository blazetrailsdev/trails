import { Naming } from "@blazetrails/activemodel";
import { extend } from "@blazetrails/activesupport";
import type { Html5Node } from "@blazetrails/nokogiri";
import { toS } from "@blazetrails/ruby-compat";
import { ActionText } from "../action-text.js";

interface RemoteImageAttributes {
  url?: string | null;
  contentType?: string | null;
  width?: string | null;
  height?: string | null;
}

export class RemoteImage {
  static {
    extend(this, Naming);
  }

  static fromNode(node: Html5Node): RemoteImage | null {
    if (node.get("url") != null && this.isContentTypeIsImage(node.get("content-type"))) {
      return new this(this.attributesFromNode(node));
    }
    return null;
  }

  /** @internal */
  private static isContentTypeIsImage(contentType: unknown): boolean {
    return /^image(\/.+|$)/m.test(toS(contentType));
  }

  /** @internal */
  private static attributesFromNode(node: Html5Node): RemoteImageAttributes {
    return {
      url: node.get("url"),
      contentType: node.get("content-type"),
      width: node.get("width"),
      height: node.get("height"),
    };
  }

  readonly url: string | null | undefined;
  readonly contentType: string | null | undefined;
  readonly width: string | null | undefined;
  readonly height: string | null | undefined;

  constructor(attributes: RemoteImageAttributes = {}) {
    this.url = attributes.url;
    this.contentType = attributes.contentType;
    this.width = attributes.width;
    this.height = attributes.height;
  }

  attachablePlainTextRepresentation(caption: string | null): string {
    return `[${caption ?? "Image"}]`;
  }

  toPartialPath(): string {
    return "action_text/attachables/remote_image";
  }
}

ActionText.Attachables.RemoteImage = RemoteImage;
