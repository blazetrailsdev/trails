import { parse, type DefaultTreeAdapterMap } from "parse5";
import { ArgumentError, include, rbObjRespondTo } from "@blazetrails/ruby-compat";

import { readSource, type Readable } from "../readable.js";
import { childNodes, type Node } from "./node.js";
import type { NodeSet } from "../xml/node-set.js";
import { Searchable } from "../xml/searchable.js";

type Parse5Document = DefaultTreeAdapterMap["document"];

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- `Searchable` is mixed in below.
export interface Document {
  css(...args: unknown[]): NodeSet;
  atCss(...args: unknown[]): Node | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class Document {
  static readonly IMPLIED_XPATH_CONTEXTS = ["//"] as const;

  url: string | null = null;
  encoding: string | null = null;

  private constructor(
    /**
     * @internal
     * @noRailsEquivalent PERMANENT
     */
    readonly _node: Parse5Document,
  ) {}

  static parse(
    stringOrIo: string | Readable | null = null,
    url: string | null = null,
    encoding: string | null = null,
    options: Record<string, unknown> = {},
    block?: (options: Record<string, unknown>) => void,
  ): Document {
    ({
      url = url,
      encoding = encoding,
      ...options
    } = options as {
      url?: string | null;
      encoding?: string | null;
    });
    if (block) block(options);
    if (stringOrIo == null) stringOrIo = "";

    if (typeof stringOrIo === "string") encoding ??= "UTF-8";

    if (rbObjRespondTo(stringOrIo, "read") && rbObjRespondTo(stringOrIo, "path")) {
      url ??= (stringOrIo as unknown as { path: string }).path;
    }
    if (!(rbObjRespondTo(stringOrIo, "read") || rbObjRespondTo(stringOrIo, "toStr"))) {
      throw new ArgumentError("not a string or IO object");
    }

    return this.doParse(stringOrIo, url, encoding, options);
  }

  /** @internal */
  private static doParse(
    stringOrIo: string | Readable,
    url: string | null,
    _encoding: string | null,
    _options: Record<string, unknown>,
  ): Document {
    const string = readSource(stringOrIo);

    const doc = new Document(parse(string));
    doc.url = url;
    doc.encoding = "UTF-8";
    return doc;
  }

  get document(): Document {
    return this;
  }

  get root(): Node | null {
    const root = childNodes(this._node, this).find((node) => node.isElement());
    return root ?? null;
  }
}

include(Document, Searchable);
