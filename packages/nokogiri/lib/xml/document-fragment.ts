import { defaultTreeAdapter } from "parse5";

import { XML, Nokogiri } from "../namespaces.js";

import { XmlDocument } from "./document.js";
import { XmlNode } from "./node.js";
import { NodeSet } from "./node-set.js";
import * as Searchable from "./searchable.js";
import type { SearchableHost } from "./searchable.js";
import { ParseOptions } from "./parse-options.js";
import type { SyntaxError } from "./syntax-error.js";

export class DocumentFragment extends XmlNode {
  parseOptions: ParseOptions | undefined;

  static parse(
    tags: string | null,
    options: ParseOptions | number = ParseOptions.DEFAULT_XML,
    block?: (options: ParseOptions) => void,
  ): DocumentFragment {
    return new this(new XmlDocument(), tags, null, options, block);
  }

  /**
   * @inventedArm createRoot — CONVERGEABLE nokogiri-xml-document-fragment-native-new
   * @inventedArm createDocumentFragment — CONVERGEABLE nokogiri-xml-document-fragment-native-new
   */
  constructor(
    document: XmlDocument | XmlNode,
    tags: string | null = null,
    context: XmlNode | null = null,
    options: ParseOptions | number = ParseOptions.DEFAULT_XML,
    block?: (options: ParseOptions) => void,
  ) {
    super(
      document.isXml()
        ? Nokogiri.LibXml2!.XmlDocument.create().createRoot("root")
        : defaultTreeAdapter.createDocumentFragment(),
      document,
    );
    if (tags == null) return;

    if (typeof options === "number") options = new ParseOptions(options);
    this.parseOptions = options;
    if (block !== undefined) block(options);

    let children;
    if (context !== null) {
      /** @missingRailsCall parse — CONVERGEABLE nokogiri-xml-node-parse-in-context */
      children = XML.DocumentFragment.parse(tags, options).children;
    } else {
      const wrapperDoc = XmlDocument.parse(`<root>${tags}</root>`, null, null, options);
      this.errors = wrapperDoc.errors;
      children = wrapperDoc.xpath("/root/node()");
    }
    children.each((child) => this.addChildNodeAndReparentAttrs(child));
  }

  get name(): string {
    return "#document-fragment";
  }

  toString(): string {
    return this.children.toString();
  }

  toHtml(options: { saveWith?: number } = {}): string {
    return this.children.toHtml(options);
  }

  toXhtml(options: { saveWith?: number } = {}): string {
    return this.children.toXhtml(options);
  }

  toXml(options: { saveWith?: number; encoding?: string | null } = {}): string {
    return this.children.toXml(options);
  }

  css(...args: unknown[]): NodeSet {
    if (this.children.length > 0) {
      return this.children.css(...args);
    } else {
      return new NodeSet(this.document);
    }
  }

  search(...rules: unknown[]): NodeSet {
    const [paths, handler, ns, binds] = (this as unknown as SearchableHost).extractParams(rules);

    return paths.reduce<NodeSet>(
      (set, rule) =>
        set.plus(
          Searchable.LOOKS_LIKE_XPATH.test(String(rule))
            ? this.xpath(...[rule, ns, handler, binds].filter((x) => x != null))
            : this.children.css(...[rule, ns, handler].filter((x) => x != null)),
        ),
      new NodeSet(this.document),
    );
  }

  get errors(): SyntaxError[] {
    return (this.document as XmlDocument).errors;
  }

  set errors(things: SyntaxError[]) {
    (this.document as XmlDocument).errors = things;
  }

  serialize(): string {
    return this.toString();
  }

  fragment(data: string): DocumentFragment {
    return (this.document as XmlDocument).fragment(data);
  }
}

XML.DocumentFragment = DocumentFragment;
