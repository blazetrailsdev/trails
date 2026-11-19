import { defaultTreeAdapter } from "parse5";

import { XML, Nokogiri } from "../namespaces.js";

import { XmlDocument } from "./document.js";
import { XmlNode } from "./node.js";
import { NodeSet } from "./node-set.js";
import { ParseOptions } from "./parse-options.js";
import type { SyntaxError } from "./syntax-error.js";

export class DocumentFragment extends XmlNode {
  parseOptions: ParseOptions | undefined;
  errors: SyntaxError[] = [];

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
      !(document instanceof XmlNode)
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
      children = new NodeSet(document, XML.DocumentFragment.parse(tags, options).children as never);
    } else {
      const wrapperDoc = XmlDocument.parse(`<root>${tags}</root>`, null, null, options);
      this.errors = wrapperDoc.errors;
      children = wrapperDoc.xpath("/root/node()");
    }
    children.each((child) => this.addChildNodeAndReparentAttrs(child as unknown as XmlNode));
  }

  get name(): string {
    return "#document-fragment";
  }
}

XML.DocumentFragment = DocumentFragment;
