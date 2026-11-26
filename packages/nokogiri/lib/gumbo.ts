import { ArgumentError, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Parser, defaultTreeAdapter, html, type DefaultTreeAdapterMap } from "parse5";

import { HTML5, Nokogiri } from "./namespaces.js";
import { SyntaxError } from "./xml/syntax-error.js";

import type { DocumentFragment } from "./html5/document-fragment.js";
import type { Node } from "./html5/node.js";

export const DEFAULT_MAX_ATTRIBUTES = 400;

export const DEFAULT_MAX_ERRORS = 0;

export const DEFAULT_MAX_TREE_DEPTH = 400;

function lookupNamespace(node: Node, requireKnownNs: boolean): html.NS | null {
  const ns = node.namespace;
  if (ns == null) return html.NS.HTML;
  const href = ns.href;
  if (href === "http://www.w3.org/1999/xhtml") return html.NS.HTML;
  if (href === "http://www.w3.org/1998/Math/MathML") return html.NS.MATHML;
  if (href === "http://www.w3.org/2000/svg") return html.NS.SVG;
  if (requireKnownNs) throw new ArgumentError(`Unexpected namespace URI "${href}"`);
  return null;
}

export function fragment(
  docFragment: DocumentFragment,
  tags: string,
  ctx: Node | string | null,
  options: {
    maxAttributes?: number;
    maxErrors?: number;
    maxTreeDepth?: number;
    parseNoscriptContentAsText?: boolean;
  } = {},
): void {
  let ctxTag: string;
  let ctxNs: html.NS;
  let encoding: string | null = null;
  let form = false;
  if (ctx === null) {
    ctxTag = "body";
    ctxNs = html.NS.HTML;
  } else if (typeof ctx === "string") {
    ctxTag = ctx;
    ctxNs = html.NS.HTML;
    const colon = ctxTag.indexOf(":");
    if (colon !== -1) {
      const prefix = ctxTag.slice(0, colon).toLowerCase();
      if (prefix === "svg") ctxNs = html.NS.SVG;
      else if (prefix === "html") ctxNs = html.NS.HTML;
      else if (prefix === "math") ctxNs = html.NS.MATHML;
      else throw new ArgumentError(`Invalid context namespace '${ctxTag.slice(0, colon)}'`);
      ctxTag = ctxTag.slice(colon + 1);
    } else if (ctxTag.toLowerCase() === "svg") {
      ctxNs = html.NS.SVG;
    } else if (ctxTag.toLowerCase() === "math") {
      ctxNs = html.NS.MATHML;
    }
    form = ctxNs === html.NS.HTML && ctxTag.toLowerCase() === "form";
  } else {
    const tagName = ctx.name;
    ctxTag = tagName;
    ctxNs = lookupNamespace(ctx, true)!;
    for (
      let node: Node | null = ctx;
      node != null;
      node = rbObjRespondTo(node, "parent") ? node.parent : null
    ) {
      if (!node.isElement()) continue;
      const elementName = node.name;
      if (
        elementName.length === 4 &&
        elementName.toLowerCase() === "form" &&
        lookupNamespace(node, false) === html.NS.HTML
      ) {
        form = true;
        break;
      }
    }
    if (
      ctxNs === html.NS.MATHML &&
      tagName.length === 14 &&
      ctxTag.toLowerCase() === "annotation-xml"
    ) {
      const enc = ctx.get("encoding");
      if (enc != null) encoding = enc;
    }
  }
  const ctxElement = defaultTreeAdapter.createElement(
    ctxTag,
    ctxNs,
    encoding === null ? [] : [{ name: "encoding", value: encoding }],
  );
  if (form) {
    defaultTreeAdapter.appendChild(
      defaultTreeAdapter.createElement("form", html.NS.HTML, []),
      ctxElement,
    );
  }

  const doc = docFragment.document;
  const docNode = doc._node as unknown as DefaultTreeAdapterMap["document"];
  const dtd = defaultTreeAdapter
    .getChildNodes(docNode)
    .find((node) => defaultTreeAdapter.isDocumentTypeNode(node));
  const docQuirksMode = doc.quirksMode;
  let quirksMode: number;
  if (ctx === null || typeof ctx === "string" || docQuirksMode == null) {
    quirksMode = HTML5.QuirksMode.NO_QUIRKS;
  } else if (dtd === undefined) {
    quirksMode = HTML5.QuirksMode.QUIRKS;
  } else {
    quirksMode = {
      [html.DOCUMENT_MODE.NO_QUIRKS]: HTML5.QuirksMode.NO_QUIRKS,
      [html.DOCUMENT_MODE.QUIRKS]: HTML5.QuirksMode.QUIRKS,
      [html.DOCUMENT_MODE.LIMITED_QUIRKS]: HTML5.QuirksMode.LIMITED_QUIRKS,
    }[defaultTreeAdapter.getDocumentMode(docNode)];
  }

  const maxErrors = options.maxErrors ?? DEFAULT_MAX_ERRORS;
  const rerrors: SyntaxError[] = [];
  const parser = Parser.getFragmentParser<DefaultTreeAdapterMap>(ctxElement, {
    scriptingEnabled: options.parseNoscriptContentAsText === true,
    onParseError: (err) => {
      if (maxErrors < 0 || rerrors.length < maxErrors) {
        rerrors.push(new SyntaxError(err.code, 2, err.startLine, err.startCol, "#fragment"));
      }
    },
  });
  defaultTreeAdapter.setDocumentMode(
    parser.document,
    [html.DOCUMENT_MODE.NO_QUIRKS, html.DOCUMENT_MODE.QUIRKS, html.DOCUMENT_MODE.LIMITED_QUIRKS][
      quirksMode
    ],
  );
  parser.tokenizer.write(tags, true);
  (docFragment as { _node: DefaultTreeAdapterMap["parentNode"] })._node = parser.getFragment();
  const maxAttributes = options.maxAttributes ?? DEFAULT_MAX_ATTRIBUTES;
  const maxTreeDepth = options.maxTreeDepth ?? DEFAULT_MAX_TREE_DEPTH;
  const stack: [DefaultTreeAdapterMap["parentNode"], number][] = [[docFragment._node, 0]];
  while (stack.length > 0) {
    const [node, depth] = stack.pop()!;
    for (const child of defaultTreeAdapter.getChildNodes(node)) {
      if (!defaultTreeAdapter.isElementNode(child)) continue;
      if (maxAttributes >= 0 && child.attrs.length > maxAttributes) {
        throw new ArgumentError("Attributes per element limit exceeded");
      }
      if (maxTreeDepth >= 0 && depth + 1 > maxTreeDepth) {
        throw new ArgumentError("Document tree depth limit exceeded");
      }
      stack.push(["content" in child ? child.content : child, depth + 1]);
    }
  }

  docFragment.quirksMode = quirksMode;
  if (rerrors.length > 0) docFragment.errors = rerrors;
}

export const Gumbo = {
  name: "Nokogiri::Gumbo",
  DEFAULT_MAX_ATTRIBUTES,
  DEFAULT_MAX_ERRORS,
  DEFAULT_MAX_TREE_DEPTH,
  fragment,
};

(Nokogiri as { Gumbo?: typeof Gumbo }).Gumbo = Gumbo;
