import { SaveOptions, type Html5DocumentFragment, type Html5Node } from "@blazetrails/nokogiri";
import { ActionText } from "./action-text.js";

export const HtmlConversion = {
  nodeToHtml(node: Html5Node | Html5DocumentFragment): string {
    return node.toHtml({ saveWith: SaveOptions.AS_HTML });
  },

  fragmentForHtml(html: string): Html5DocumentFragment {
    return this.document().fragment(html);
  },

  createElement(tagName: string, attributes: Record<string, unknown> = {}): Html5Node {
    return this.document().createElement(tagName, attributes);
  },

  /** @internal */
  document() {
    const doc = new (ActionText.htmlDocumentClass())();
    doc.encoding = "UTF-8";
    return doc;
  },
};

ActionText.HtmlConversion = HtmlConversion;
