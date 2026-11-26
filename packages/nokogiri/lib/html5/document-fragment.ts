import { defaultTreeAdapter, type DefaultTreeAdapterMap } from "parse5";
import { ArgumentError } from "@blazetrails/ruby-compat";

import { Gumbo } from "../gumbo.js";

import { Document } from "./document.js";
import { childNodes, Node } from "./node.js";
import { NodeSet } from "../xml/node-set.js";
import { XmlNode } from "../xml/node.js";
import { isHash } from "../xml/searchable.js";
import type { SyntaxError } from "../xml/syntax-error.js";
import { DocumentFragment as XmlDocumentFragment } from "../xml/document-fragment.js";
import { HTML5 } from "../namespaces.js";

type Parse5Parent = DefaultTreeAdapterMap["parentNode"];

// @ts-expect-error TS2417: CLAUDE.md, "Override signature on the static side".
export class DocumentFragment extends XmlDocumentFragment {
  declare document: Document;
  declare at: (...args: unknown[]) => Node | undefined;
  declare atCss: (...args: unknown[]) => Node | undefined;
  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  declare readonly _node: Parse5Parent;

  quirksMode: number | null = null;
  #errors: SyntaxError[] = [];

  constructor(
    doc: Document,
    input: unknown = null,
    context: Node | string | null = null,
    options: Record<string, unknown> = {},
  ) {
    super(doc);
    options = { ...options };

    this.document = doc;
    this.errors = [];
    if (input == null) return;

    const string = HTML5.readAndEncode(input, null);

    if (Object.hasOwn(options, "context")) {
      context = options.context as Node | string | null;
      delete options.context;
    }

    options.maxAttributes ??= Gumbo.DEFAULT_MAX_ATTRIBUTES;
    if (options.maxErrors == null) {
      const maxParseErrors = options.maxParseErrors;
      delete options.maxParseErrors;
      options.maxErrors = maxParseErrors ?? Gumbo.DEFAULT_MAX_ERRORS;
    }
    options.maxTreeDepth ??= Gumbo.DEFAULT_MAX_TREE_DEPTH;
    const noscriptContentAsText = (options.parseNoscriptContentAsText = this.noscriptParsingMode(
      doc,
      options,
    ));

    Gumbo.fragment(this, string, context, options);
    if (doc.parseNoscriptContentAsText == null) {
      doc.parseNoscriptContentAsText = noscriptContentAsText;
    }
  }

  /** @internal */
  private noscriptParsingMode(doc: Document, options: Record<string, unknown>): boolean {
    const docMode = doc.parseNoscriptContentAsText;
    const fetched = Object.hasOwn(options, "parseNoscriptContentAsText")
      ? options.parseNoscriptContentAsText
      : docMode;
    const mode = fetched != null && fetched !== false;

    if (docMode != null && mode !== docMode) {
      throw new ArgumentError(
        `parse_noscript_content_as_text: ${mode} does not match the document's value ${docMode}`,
      );
    }

    return mode;
  }

  get errors(): SyntaxError[] {
    return this.#errors;
  }

  set errors(errors: SyntaxError[]) {
    this.#errors = errors;
  }

  static parse(
    input: unknown,
    encoding: string | null = null,
    options: { context?: Node | string | null; [key: string]: unknown } = {},
  ): DocumentFragment {
    const { context = null, ...rest } = options;

    const document = new Document();
    document.encoding = "UTF-8";
    input = HTML5.readAndEncode(input, encoding);

    return new DocumentFragment(document, input, context, rest);
  }

  dup(): DocumentFragment {
    const newDocument = this.document.dup();
    const newFragment = new (this.constructor as typeof DocumentFragment)(newDocument);
    for (const child of this.children) {
      child.dup(1, newDocument).parent = newFragment;
    }
    return newFragment;
  }

  addChild(nodeOrTags: Node): Node {
    defaultTreeAdapter.detachNode(nodeOrTags._node);
    defaultTreeAdapter.appendChild(this._node, nodeOrTags._node);
    return nodeOrTags;
  }

  get children(): NodeSet {
    return new NodeSet(this.document, childNodes(this._node, this.document));
  }

  get elements(): NodeSet {
    return new NodeSet(
      this.document,
      this.children.toA().filter((child) => child.isElement()),
    );
  }

  serialize(...args: unknown[]): string {
    return XmlNode.prototype.serialize.call(this, ...args);
  }

  /** @internal */
  extractParams(
    params: unknown[],
  ): [string[], unknown, Record<string, string>, Record<string, unknown> | undefined] {
    const handler = params.find(
      (param) => !(typeof param === "string" || (param !== null && isHash(param))),
    );
    if (handler !== undefined) params = params.filter((param) => param !== handler);

    params = [...params];
    const hashes: unknown[] = [];
    while ((params.length > 0 && isHash(params.at(-1))) || params.at(-1) == null) {
      hashes.push(params.pop());
      if (params.length === 0) break;
    }
    const [nsGiven, binds] = hashes.reverse() as [
      Record<string, string> | undefined,
      Record<string, unknown> | undefined,
    ];

    const ns =
      nsGiven ??
      (() => {
        const ns: Record<string, string> = {};
        this.children.each((child) => Object.assign(ns, child.namespaces));
        return ns;
      })();

    return [params as string[], handler, ns, binds];
  }
}

HTML5.DocumentFragment = DocumentFragment;
