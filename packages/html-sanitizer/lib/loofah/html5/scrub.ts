import { CGI } from "@blazetrails/ruby-compat";
import { usesLibxml, type Html5Document, type Html5Node } from "@blazetrails/nokogiri";

import { Crass } from "../../crass.js";
import type { Node as CrassNode } from "../../crass/tokenizer.js";
import { LibxmlWorkarounds } from "./libxml2-workarounds.js";
import { SafeList } from "./safelist.js";

type Attr = Html5Node["attributeNodes"][number];

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[`\u0000-\u0020\u007f\u0080-\u0101]/g;
const CSS_KEYWORDISH =
  /^(#[0-9a-fA-F]+|rgb\(\d+%?,\d*%?,?\d*%?\)?|-?\d{0,3}\.?\d{0,10}(ch|cm|r?em|ex|in|lh|mm|pc|pt|px|Q|vmax|vmin|vw|vh|%|,|\))?)$/;
const CRASS_SEMICOLON = { node: "semicolon", raw: ";" };
const CSS_IMPORTANT = "!important";
const CSS_WHITESPACE = " ";
const CSS_PROPERTY_STRING_WITHOUT_EMBEDDED_QUOTES = /^(["'])?[^"']+\1$/;
const CSS_URLISH_NODES = ["url", "bad_url", "bad_string"];
const DATA_ATTRIBUTE_NAME = /^data-[\w-]+$/;

const NUMERIC_CHARACTER_REFERENCE = /&#(x[0-9a-f]+|[0-9]+);?/gi;

const URI_PROTOCOL_REGEX = new RegExp(
  String.raw`^[a-z][a-z0-9+\-.]*(?:${SafeList.PROTOCOL_SEPARATOR.source})`,
  "i",
);

const DATA_URI_MEDIATYPE = /^[a-z0-9!#$%&'*+\-.^_`|~]+\/[a-z0-9!#$%&'*+\-.^_`|~]+$/;

const WHITESPACE_CHARACTER_REFERENCES = /&(Tab|NewLine);/g;

const DELIMITER_CHARACTER_REFERENCES: Readonly<Record<string, string>> = Object.freeze({
  "&colon;": ":",
  "&sol;": "/",
});
const DELIMITER_CHARACTER_REFERENCE = /&colon;|&sol;/g;

export const Scrub = {
  CONTROL_CHARACTERS,
  CSS_KEYWORDISH,
  CRASS_SEMICOLON,
  CSS_IMPORTANT,
  CSS_WHITESPACE,
  CSS_PROPERTY_STRING_WITHOUT_EMBEDDED_QUOTES,
  CSS_URLISH_NODES,
  DATA_ATTRIBUTE_NAME,
  NUMERIC_CHARACTER_REFERENCE,
  URI_PROTOCOL_REGEX,
  DATA_URI_MEDIATYPE,
  WHITESPACE_CHARACTER_REFERENCES,
  DELIMITER_CHARACTER_REFERENCES,
  DELIMITER_CHARACTER_REFERENCE,

  isAllowedElement(elementName: string): boolean {
    return SafeList.ALLOWED_ELEMENTS_WITH_LIBXML2.has(elementName);
  },

  scrubAttributes(node: Html5Node): void {
    for (const attrNode of node.attributeNodes) {
      const attrName = this.prefixedAttributeName(attrNode);

      if (DATA_ATTRIBUTE_NAME.test(attrName)) {
        continue;
      }

      if (!SafeList.ALLOWED_ATTRIBUTES.has(attrName)) {
        attrNode.remove();
        continue;
      }

      this.scrubAttributeValue(node, attrNode, attrName);
    }

    this.scrubCssAttribute(node);

    for (const attrNode of node.attributeNodes) {
      if (!/\S/.test(attrNode.value) && !DATA_ATTRIBUTE_NAME.test(attrNode.name)) {
        node.removeAttribute(attrNode.name);
      }
    }

    this.forceCorrectAttributeEscapingBang(node);
  },

  prefixedAttributeName(attrNode: Attr): string {
    if (attrNode.namespace) {
      return `${attrNode.namespace.prefix}:${attrNode.nodeName}`;
    } else {
      return attrNode.nodeName;
    }
  },

  scrubAttributeValue(
    node: Html5Node,
    attrNode: Attr,
    attrName: string = Scrub.prefixedAttributeName(attrNode),
  ): boolean {
    if (SafeList.ATTR_VAL_IS_URI.has(attrName)) {
      if (this.scrubUriAttribute(attrNode)) return true;
    }

    if (SafeList.SVG_ATTR_VAL_ALLOWS_REF.has(attrName)) {
      this.scrubAttributeThatAllowsLocalRef(attrNode);
    }

    if (
      SafeList.SVG_ALLOW_LOCAL_HREF.has(node.name) &&
      SafeList.SVG_HREF_ATTRIBUTES.has(attrName) &&
      /^[^\S\n]*[^#\s]/m.test(attrNode.value)
    ) {
      attrNode.remove();
    }

    return false;
  },

  scrubCssAttribute(node: Html5Node): void {
    const style = node.attributes["style"];
    if (style) style.value = this.scrubCss(style.value);
  },

  /** @missingRailsArgs join — PERMANENT */
  scrubCss(style: string): string {
    const styleTree = Crass.parseProperties(style);
    const sanitizedTree: CrassNode[] = [];

    for (const node of styleTree) {
      if (node.node !== "property") continue;
      if ((node.children as CrassNode[]).some((child) => CSS_URLISH_NODES.includes(child.node))) {
        continue;
      }

      const name = (node.name as string).toLowerCase();
      if (
        !(
          SafeList.ALLOWED_CSS_PROPERTIES.has(name) ||
          SafeList.ALLOWED_SVG_PROPERTIES.has(name) ||
          SafeList.SHORTHAND_CSS_PROPERTIES.has(name.split("-")[0])
        )
      ) {
        continue;
      }

      let value = (node.children as CrassNode[])
        .map((child) => {
          switch (child.node) {
            case "whitespace":
              return CSS_WHITESPACE;
            case "string":
              if (CSS_PROPERTY_STRING_WITHOUT_EMBEDDED_QUOTES.test(child.raw)) {
                return Crass.Parser.stringify(child);
              }
              return null;
            case "function":
              if (SafeList.ALLOWED_CSS_FUNCTIONS.has(child.name.toLowerCase())) {
                return Crass.Parser.stringify(child);
              }
              return null;
            case "ident": {
              const keyword: string = child.value;
              if (
                !SafeList.SHORTHAND_CSS_PROPERTIES.has(name.split("-")[0]) ||
                SafeList.ALLOWED_CSS_KEYWORDS.has(keyword) ||
                CSS_KEYWORDISH.test(keyword)
              ) {
                return child.raw as string;
              }
              return null;
            }
            default:
              return child.raw as string;
          }
        })
        .filter((x) => x != null)
        .join("")
        .trim();

      if (value.length === 0) continue;

      if (node.important) value += CSS_WHITESPACE + CSS_IMPORTANT;
      const propstring = `${name}:${value}`;
      const sanitizedNode = Crass.parseProperties(propstring)[0];
      if (Crass.Parser.stringify(sanitizedNode) !== propstring) continue;
      if (this.isCssPropertyUnsafe(sanitizedNode)) continue;

      sanitizedTree.push(sanitizedNode, CRASS_SEMICOLON);
    }

    return Crass.Parser.stringify(sanitizedTree);
  },

  isCssPropertyUnsafe(node: CrassNode): boolean {
    return (node.children as CrassNode[]).some((child) => {
      if (CSS_URLISH_NODES.includes(child.node)) {
        return true;
      } else if (child.node === "string") {
        return !CSS_PROPERTY_STRING_WITHOUT_EMBEDDED_QUOTES.test(child.raw);
      } else if (child.node === "function") {
        return !SafeList.ALLOWED_CSS_FUNCTIONS.has(
          (child.name as string).replace(/[A-Z]/g, (c) => c.toLowerCase()),
        );
      } else {
        return false;
      }
    });
  },

  scrubAttributeThatAllowsLocalRef(attrNode: Attr): void {
    if (!attrNode.value) return;

    const nodes = new Crass.Parser(attrNode.value).parseComponentValues();

    const values = nodes
      .map((node) => {
        switch (node.node) {
          case "url":
            if ((node.value as string).startsWith("#")) {
              return node.raw as string;
            }
            return null;
          case "hash":
          case "ident":
          case "string":
            return node.raw as string;
        }
        return null;
      })
      .filter((x) => x != null);

    attrNode.value = values.join(" ");
  },

  isAllowedUri(uriString: string): boolean {
    uriString = CGI.unescapeHTML(this.decodeNumericCharacterReferences(uriString));
    uriString = uriString.replace(CONTROL_CHARACTERS, "");
    uriString = uriString.replace(WHITESPACE_CHARACTER_REFERENCES, "");
    uriString = uriString.replace(
      DELIMITER_CHARACTER_REFERENCE,
      (m) => DELIMITER_CHARACTER_REFERENCES[m],
    );
    uriString = uriString.toLowerCase();
    if (URI_PROTOCOL_REGEX.test(uriString)) {
      const protocol = uriString.split(SafeList.PROTOCOL_SEPARATOR)[0];
      if (!SafeList.ALLOWED_PROTOCOLS.has(protocol)) return false;

      if (protocol === "data") {
        const mediatype = this.dataUriMediatype(uriString);
        if (mediatype == null || !SafeList.ALLOWED_URI_DATA_MEDIATYPES.has(mediatype)) {
          return false;
        }
      }
    }
    return true;
  },

  decodeNumericCharacterReferences(string: string): string {
    return string.replace(NUMERIC_CHARACTER_REFERENCE, (reference, $1: string) => {
      let digits = $1;
      const hexadecimal = digits.startsWith("x") || digits.startsWith("X");
      if (hexadecimal) digits = digits.slice(1);
      const significantDigits = digits.replace(/^0+/, "");

      if (significantDigits.length > (hexadecimal ? 6 : 7)) return reference;

      const codepoint =
        significantDigits === "" ? 0 : parseInt(significantDigits, hexadecimal ? 16 : 10);
      if (codepoint > 0x10ffff || (codepoint >= 0xd800 && codepoint <= 0xdfff)) return reference;
      return String.fromCodePoint(codepoint);
    });
  },

  scrubUriAttribute(attrNode: Attr): boolean {
    if (this.isAllowedUri(attrNode.value)) {
      return false;
    } else {
      attrNode.remove();
      return true;
    }
  },

  forceCorrectAttributeEscapingBang(node: Html5Node): void {
    if (!usesLibxml()) return;

    for (const attrNode of node.attributeNodes) {
      if (!LibxmlWorkarounds.BROKEN_ESCAPING_ATTRIBUTES.has(attrNode.name)) continue;

      const tagName = LibxmlWorkarounds.BROKEN_ESCAPING_ATTRIBUTES_QUALIFYING_TAG[attrNode.name];
      if (!(tagName == null || tagName === node.name)) continue;

      attrNode.value = attrNode.value.replace(
        /[ "]/g,
        (m) => "%" + m.charCodeAt(0).toString(16).toUpperCase(),
      );
    }
  },

  isCdataNeedsEscaping(node: Html5Node): boolean {
    return node.isCdata();
  },

  cdataEscape(node: Html5Node): Html5Node {
    const escapedText = this.escapeTags(node.text);
    if (node.isCdata()) {
      return (node.document as Html5Document).createCdata(escapedText);
    } else {
      return (node.document as Html5Document).createTextNode(escapedText);
    }
  },

  TABLE_FOR_ESCAPE_HTML__: {
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
  } as Record<string, string>,

  escapeTags(string: string): string {
    return string.replace(/[<>&]/g, (m) => this.TABLE_FOR_ESCAPE_HTML__[m]);
  },

  /** @internal */
  dataUriMediatype(uriString: string): string | null {
    const rest = uriString.startsWith("data:") ? uriString.slice("data:".length) : uriString;
    const at = rest.indexOf(",");
    const [metadata, comma] = at === -1 ? [rest, ""] : [rest.slice(0, at), ","];
    if (comma === "") return null;

    const mediatype = (
      metadata.endsWith(";base64") ? metadata.slice(0, -";base64".length) : metadata
    )
      .split(";", 2)[0]
      .trim();
    return DATA_URI_MEDIATYPE.test(mediatype) ? mediatype : "text/plain";
  },
};
