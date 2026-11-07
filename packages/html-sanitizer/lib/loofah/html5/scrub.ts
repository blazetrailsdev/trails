import { CGI, stringSplit } from "@blazetrails/ruby-compat";
import { usesLibxml, type Html5Document, type Html5Node } from "@blazetrails/nokogiri";

import { Crass } from "../../crass.js";
import type { Node as CrassNode } from "../../crass/tokenizer.js";
import { LibxmlWorkarounds } from "./libxml2-workarounds.js";
import { SafeList } from "./safelist.js";

type Attr = Html5Node["attributeNodes"][number];

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[`\u0000- \u007f\u0080-ā]/g;
const CSS_KEYWORDISH =
  /^(#[0-9a-fA-F]+|rgb\(\d+%?,\d*%?,?\d*%?\)?|-?\d{0,3}\.?\d{0,10}(ch|cm|r?em|ex|in|lh|mm|pc|pt|px|Q|vmax|vmin|vw|vh|%|,|\))?)$/;
const CRASS_SEMICOLON = { node: "semicolon", raw: ";" };
const CSS_IMPORTANT = "!important";
const CSS_WHITESPACE = " ";
const CSS_PROPERTY_STRING_WITHOUT_EMBEDDED_QUOTES = /^(["'])?[^"']+\1$/;
const DATA_ATTRIBUTE_NAME = /^data-[\w-]+$/;

export const Scrub = {
  CONTROL_CHARACTERS,
  CSS_KEYWORDISH,
  CRASS_SEMICOLON,
  CSS_IMPORTANT,
  CSS_WHITESPACE,
  CSS_PROPERTY_STRING_WITHOUT_EMBEDDED_QUOTES,
  DATA_ATTRIBUTE_NAME,

  isAllowedElement(elementName: string): boolean {
    return SafeList.ALLOWED_ELEMENTS_WITH_LIBXML2.has(elementName);
  },

  scrubAttributes(node: Html5Node): void {
    for (const attrNode of node.attributeNodes) {
      const attrName = attrNode.namespace
        ? `${attrNode.namespace.prefix}:${attrNode.nodeName}`
        : attrNode.nodeName;

      if (DATA_ATTRIBUTE_NAME.test(attrName)) {
        continue;
      }

      if (!SafeList.ALLOWED_ATTRIBUTES.has(attrName)) {
        attrNode.remove();
        continue;
      }

      if (SafeList.ATTR_VAL_IS_URI.has(attrName)) {
        if (this.scrubUriAttribute(attrNode)) continue;
      }

      if (SafeList.SVG_ATTR_VAL_ALLOWS_REF.has(attrName)) {
        this.scrubAttributeThatAllowsLocalRef(attrNode);
      }

      if (
        !(
          SafeList.SVG_ALLOW_LOCAL_HREF.has(node.name) &&
          attrName === "xlink:href" &&
          /^\s*[^#\s].*/ms.test(attrNode.value)
        )
      ) {
        continue;
      }

      attrNode.remove();
      continue;
    }

    this.scrubCssAttribute(node);

    for (const attrNode of node.attributeNodes) {
      if (!/\S/.test(attrNode.value) && !DATA_ATTRIBUTE_NAME.test(attrNode.name)) {
        node.removeAttribute(attrNode.name);
      }
    }

    this.forceCorrectAttributeEscapingBang(node);
  },

  scrubCssAttribute(node: Html5Node): void {
    const style = node.attributes["style"];
    if (style) style.value = this.scrubCss(style.value);
  },

  scrubCss(style: string): string {
    const urlFlags = ["url", "bad_url"];
    const styleTree = Crass.parseProperties(style);
    const sanitizedTree: CrassNode[] = [];

    for (const node of styleTree) {
      if (node.node !== "property") continue;
      if ((node.children as CrassNode[]).some((child) => urlFlags.includes(child.node))) continue;

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
                return keyword;
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
      sanitizedTree.push(sanitizedNode, CRASS_SEMICOLON);
    }

    return Crass.Parser.stringify(sanitizedTree);
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

  scrubUriAttribute(attrNode: Attr): boolean {
    const valUnescaped = CGI.unescapeHTML(attrNode.value)
      .replace(CONTROL_CHARACTERS, "")
      .toLowerCase();
    if (
      /^[a-z0-9][-+.a-z0-9]*:/m.test(valUnescaped) &&
      !SafeList.ALLOWED_PROTOCOLS.has(stringSplit(valUnescaped, SafeList.PROTOCOL_SEPARATOR)[0])
    ) {
      attrNode.remove();
      return true;
    } else if (stringSplit(valUnescaped, SafeList.PROTOCOL_SEPARATOR)[0] === "data") {
      let mediatype: string | undefined = stringSplit(valUnescaped, SafeList.PROTOCOL_SEPARATOR)[1];
      if (mediatype) [mediatype] = mediatype.split(";");
      if (mediatype && !SafeList.ALLOWED_URI_DATA_MEDIATYPES.has(mediatype)) {
        attrNode.remove();
        return true;
      }
    }
    return false;
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
    return (node.document as Html5Document).createCdata(escapedText);
  },

  TABLE_FOR_ESCAPE_HTML__: {
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
  } as Record<string, string>,

  escapeTags(string: string): string {
    return string.replace(/[<>&]/g, (m) => this.TABLE_FOR_ESCAPE_HTML__[m]);
  },
};
