import { defaultTreeAdapter, html, parse, type DefaultTreeAdapterMap } from "parse5";
import { ArgumentError, rbObjRespondTo } from "@blazetrails/ruby-compat";

import { readSource, type Readable } from "../readable.js";
import { childNodes, Node } from "./node.js";
import { DocumentFragment } from "./document-fragment.js";
import { HTML5 } from "../namespaces.js";
import { XPathVisitor } from "../css/xpath-visitor.js";
import "../xml/xpath-context.js";

type Parse5Document = DefaultTreeAdapterMap["document"];

export class Document extends Node {
  declare document: Document;

  static readonly IMPLIED_XPATH_CONTEXTS: readonly string[] = ["//"];
  static readonly NCNAME_START_CHAR = "A-Za-z_";
  static readonly NCNAME_CHAR = `${Document.NCNAME_START_CHAR}\\-\\.0-9`;
  static readonly NCNAME_RE = new RegExp(
    `^xmlns(?::([${Document.NCNAME_START_CHAR}][${Document.NCNAME_CHAR}]*))?$`,
  );

  url: string | null = null;
  encoding: string | null = null;

  constructor(_node: Parse5Document = defaultTreeAdapter.createDocument()) {
    super(_node as never);
    this.document = this;
  }

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

  get root(): Node | null {
    const root = childNodes(this._node as unknown as Parse5Document, this).find((node) =>
      node.isElement(),
    );
    return root ?? null;
  }

  dup(level = 1): Document {
    const copy = new Document(super.dup(level)._node as never);
    copy.url = this.url;
    copy.encoding = this.encoding;
    return copy;
  }

  createElement(name: string, ...contentsOrAttrs: unknown[]): Node {
    const block =
      typeof contentsOrAttrs.at(-1) === "function"
        ? (contentsOrAttrs.pop() as (node: Node) => void)
        : undefined;
    const elm = new Node(defaultTreeAdapter.createElement(name, html.NS.HTML, []), this);
    if (block) block(elm);
    for (const arg of contentsOrAttrs) {
      if (arg !== null && typeof arg === "object") {
        for (const [k, v] of Object.entries(arg)) {
          const key = String(k);
          const match = Document.NCNAME_RE.exec(key);
          if (match !== null) {
            const nsName = match[1] ?? null;
            elm.addNamespaceDefinition(nsName, v as string);
          } else {
            elm.set(String(k), String(v));
          }
        }
      } else {
        elm.content = arg;
      }
    }
    const ns = elm.namespaceDefinitions.find((n) => n.prefix == null || n.prefix === "");
    if (ns !== undefined) {
      elm.namespace = ns;
    }
    return elm;
  }

  fragment(markup: string | null = null): DocumentFragment {
    return new DocumentFragment(this, markup);
  }

  createCdata(string: string): Node {
    return new Node(
      { nodeName: "#cdata-section", value: string, parentNode: null } as unknown as Node["_node"],
      this,
    );
  }

  xpathDoctype(): XPathVisitor["doctype"] {
    return XPathVisitor.DoctypeConfig.HTML5;
  }
}

HTML5.Document = Document;
