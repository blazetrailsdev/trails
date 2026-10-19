import type { DefaultTreeAdapterMap } from "parse5";
import {
  XmlAttribute as LibXmlAttribute,
  XmlComment as LibXmlComment,
  XmlDocument as LibXmlDocument,
  XmlElement as LibXmlElement,
  XmlTreeNode,
} from "libxml2-wasm";
import {
  RuntimeError,
  rbFSend,
  rbModConstSet,
  rbObjRespondTo,
  warn,
} from "@blazetrails/ruby-compat";

import type { Node } from "../html5/node.js";
import { HTML5, XML } from "../namespaces.js";
import type { NodeSet } from "./node-set.js";
import {
  evaluate,
  toXPathString,
  type FunctionContext,
  type NodeKind,
  type Tree,
  type Value,
  type XPathFunction,
} from "./xpath/evaluator.js";
import { SyntaxError } from "./xpath/syntax-error.js";

type Parse5Node = DefaultTreeAdapterMap["node"];
type Parse5Element = DefaultTreeAdapterMap["element"];
type Parse5Attr = Parse5Element["attrs"][number];

const NOKOGIRI_PREFIX = "nokogiri";
const NOKOGIRI_URI = "http://www.nokogiri.org/default_ns/ruby/extensions_functions";
const NOKOGIRI_BUILTIN_PREFIX = "nokogiri-builtin";
const NOKOGIRI_BUILTIN_URI = "https://www.nokogiri.org/default_ns/ruby/builtins";
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

interface Parse5AttrNode {
  readonly owner: Parse5Element;
  readonly attr: Parse5Attr;
}

type Parse5XPathNode = Parse5Node | Parse5AttrNode;

const parse5Attrs = new WeakMap<Parse5Element, Parse5AttrNode[]>();

function isParse5Attr(node: Parse5XPathNode): node is Parse5AttrNode {
  return "owner" in node;
}

function parse5Children(node: Parse5Node): Parse5Node[] {
  const children = (node as { childNodes?: Parse5Node[] }).childNodes ?? [];
  const content = (node as { content?: { childNodes: Parse5Node[] } }).content;
  return [...children, ...(content?.childNodes ?? [])].filter(
    (c) => c.nodeName !== "#documentType",
  );
}

const PARSE5_TREE: Tree<Parse5XPathNode> = {
  kind(node): NodeKind {
    if (isParse5Attr(node)) return "attribute";
    if (node.nodeName === "#text") return "text";
    if (node.nodeName === "#comment") return "comment";
    if ("tagName" in node) return "element";
    return "root";
  },
  parent(node) {
    if (isParse5Attr(node)) return node.owner;
    return (node as { parentNode?: Parse5Node | null }).parentNode ?? null;
  },
  children(node) {
    return isParse5Attr(node) ? [] : parse5Children(node);
  },
  attributes(node) {
    if (isParse5Attr(node) || !("tagName" in node)) return [];
    let attrs = parse5Attrs.get(node);
    if (attrs === undefined || attrs.length !== node.attrs.length) {
      attrs = node.attrs.map((attr) => ({ owner: node, attr }));
      parse5Attrs.set(node, attrs);
    }
    return attrs;
  },
  localName(node) {
    if (isParse5Attr(node)) return node.attr.name.replace(/^.*:/, "");
    return "tagName" in node ? node.tagName : "";
  },
  qualifiedName(node) {
    if (isParse5Attr(node))
      return node.attr.prefix ? `${node.attr.prefix}:${node.attr.name}` : node.attr.name;
    return "tagName" in node ? node.tagName : "";
  },
  namespaceUri(node) {
    if (isParse5Attr(node)) return node.attr.namespace ?? null;
    if (!("tagName" in node)) return null;
    return node.namespaceURI === HTML_NAMESPACE ? null : node.namespaceURI;
  },
  stringValue(node) {
    if (isParse5Attr(node)) return node.attr.value;
    if (node.nodeName === "#text") return (node as { value: string }).value;
    if (node.nodeName === "#comment") return (node as { data: string }).data;
    return parse5Children(node)
      .map((c) => (c.nodeName === "#comment" ? "" : PARSE5_TREE.stringValue(c)))
      .join("");
  },
  key(node) {
    return node;
  },
};

class LibXmlRoot {
  constructor(readonly doc: LibXmlDocument) {}
}

type LibXmlXPathNode = XmlTreeNode | LibXmlAttribute | LibXmlRoot;

const libXmlRoots = new WeakMap<LibXmlDocument, LibXmlRoot>();

function libXmlRoot(doc: LibXmlDocument): LibXmlRoot {
  let root = libXmlRoots.get(doc);
  if (root === undefined) libXmlRoots.set(doc, (root = new LibXmlRoot(doc)));
  return root;
}

function libXmlPtr(node: XmlTreeNode | LibXmlAttribute): number {
  return (node as unknown as { _nodePtr: number })._nodePtr;
}

const LIBXML_TREE: Tree<LibXmlXPathNode> = {
  kind(node): NodeKind {
    if (node instanceof LibXmlRoot) return "root";
    if (node instanceof LibXmlAttribute) return "attribute";
    if (node instanceof LibXmlElement) return "element";
    if (node instanceof LibXmlComment) return "comment";
    return "text";
  },
  parent(node) {
    if (node instanceof LibXmlRoot) return null;
    const parent = node.parent;
    if (parent !== null) return parent;
    const doc = node.doc;
    return node instanceof LibXmlElement && libXmlPtr(doc.root) === libXmlPtr(node)
      ? libXmlRoot(doc)
      : null;
  },
  children(node) {
    if (node instanceof LibXmlRoot) return [node.doc.root];
    if (!(node instanceof LibXmlElement)) return [];
    const children: XmlTreeNode[] = [];
    for (let child = node.firstChild; child !== null; child = child.next) children.push(child);
    return children;
  },
  attributes(node) {
    return node instanceof LibXmlElement ? node.attrs : [];
  },
  localName(node) {
    return node instanceof LibXmlElement || node instanceof LibXmlAttribute ? node.name : "";
  },
  qualifiedName(node) {
    if (!(node instanceof LibXmlElement || node instanceof LibXmlAttribute)) return "";
    return node.prefix ? `${node.prefix}:${node.name}` : node.name;
  },
  namespaceUri(node) {
    if (!(node instanceof LibXmlElement || node instanceof LibXmlAttribute)) return null;
    return node.namespaceUri || null;
  },
  stringValue(node) {
    if (node instanceof LibXmlRoot) return node.doc.root.content;
    return node.content;
  },
  key(node) {
    return node instanceof LibXmlRoot ? node : libXmlPtr(node);
  },
};

interface ContextHost {
  readonly document: unknown;
  readonly _node: unknown;
}

type XPathNode = Parse5XPathNode | LibXmlXPathNode;

function cssClass(str: string, val: string): boolean {
  if (val.length === 0) return true;
  return str.split(/[ \t\n\r]+/).includes(val);
}

export class XPathContext {
  private _document: unknown;
  private _tree: Tree<XPathNode>;
  private _node: XPathNode;
  private readonly _namespaces = new Map<string, string>();
  private readonly _variables = new Map<string, Value<XPathNode>>();
  private readonly _functions = new Map<string, XPathFunction<XPathNode>>();

  constructor(node: ContextHost) {
    [this._tree, this._node] = XPathContext.unwrap(node);
    this._document = node.document;

    this.registerNs(NOKOGIRI_PREFIX, NOKOGIRI_URI);
    this.registerNs(NOKOGIRI_BUILTIN_PREFIX, NOKOGIRI_BUILTIN_URI);

    this._functions.set(`${NOKOGIRI_BUILTIN_URI} css-class`, (_context, args) => {
      if (args.length !== 2) return XPathContext.arityError();
      const [hay, needle] = args.map((a) => toXPathString(this._tree, a));
      return cssClass(hay, needle);
    });
    this._functions.set(`${NOKOGIRI_BUILTIN_URI} local-name-is`, (context, args) => {
      if (args.length !== 1) return XPathContext.arityError();
      return context.tree.localName(context.node) === toXPathString(this._tree, args[0]);
    });
  }

  registerNamespaces(namespaces: Record<string, string | null>): void {
    for (const [rawKey, value] of Object.entries(namespaces)) {
      const key = rawKey.replace(/.*:/, "");

      this.registerNs(key, value);
    }
  }

  registerVariables(binds: Record<string, unknown> | null | undefined): void {
    if (binds == null) return;

    for (const [key, value] of Object.entries(binds)) {
      this.registerVariable(key, value);
    }
  }

  registerNs(prefix: string, uri: string | null): this {
    if (uri === null) this._namespaces.delete(prefix);
    else this._namespaces.set(prefix, uri);

    return this;
  }

  registerVariable(name: string, value: unknown): this {
    if (value == null) this._variables.delete(name);
    else this._variables.set(name, String(value));

    return this;
  }

  evaluate(expression: string, handler: unknown = null): NodeSet | string | number | boolean {
    const value = evaluate(expression, {
      tree: this._tree,
      node: this._node,
      namespaces: this._namespaces,
      variables: this._variables,
      lookupFunction: (name, namespaceUri) => {
        const builtin = this._functions.get(`${namespaceUri} ${name}`);
        if (builtin !== undefined) return builtin;
        if (handler != null && rbObjRespondTo(handler, name)) {
          if (namespaceUri === null) {
            warn(
              `A custom XPath or CSS handler function named '${name}' is being invoked without a namespace. Please update your query to reference this function as 'nokogiri:${name}'. Invoking custom handler functions without a namespace is deprecated and will become an error in Nokogiri v1.17.0.`,
              { category: "deprecated" },
            );
          }
          return (context, args) =>
            this.marshalFuncallAndReturnValues(context, args, handler, name);
        }
        return undefined;
      },
    });

    return this.xpath2ruby(value);
  }

  set node(node: ContextHost) {
    [this._tree, this._node] = XPathContext.unwrap(node);
    this._document = node.document;
  }

  private static unwrap(node: ContextHost): [Tree<XPathNode>, XPathNode] {
    const host = node._node;
    if (host instanceof LibXmlDocument) {
      return [LIBXML_TREE as Tree<XPathNode>, libXmlRoot(host)];
    }
    if (host instanceof XmlTreeNode) return [LIBXML_TREE as Tree<XPathNode>, host];
    return [PARSE5_TREE as Tree<XPathNode>, host as Parse5Node];
  }

  private static arityError(): never {
    throw new SyntaxError("ERROR: Invalid number of arguments");
  }

  private wrap(node: XPathNode): Node {
    if (node instanceof LibXmlRoot) return this._document as Node;
    if (node instanceof XmlTreeNode) return new XML.Node(node, this._document) as unknown as Node;
    if (this._tree.kind(node) === "root") return this._document as Node;
    return new HTML5.Node(node as DefaultTreeAdapterMap["childNode"], this._document);
  }

  private xpath2ruby(value: Value<XPathNode>): NodeSet | string | number | boolean {
    if (Array.isArray(value)) {
      return new XML.NodeSet(
        this._document,
        value.filter((n) => this._tree.kind(n) !== "attribute").map((n) => this.wrap(n)),
      );
    }
    return value;
  }

  private marshalFuncallAndReturnValues(
    _context: FunctionContext<XPathNode>,
    args: Value<XPathNode>[],
    handler: unknown,
    methodName: string,
  ): Value<XPathNode> | null {
    const argv = args.map((arg) => this.xpath2ruby(arg));

    const retval = rbFSend(handler, methodName, ...argv);

    if (typeof retval === "number") return retval;
    if (typeof retval === "string") return retval;
    if (retval === true || retval === false) return retval;
    if (retval == null) return null;
    if (Array.isArray(retval)) {
      return new XML.NodeSet(this._document, retval as Node[]).map(
        (n) => (n as unknown as { _node: XPathNode })._node,
      );
    }
    if (retval instanceof XML.NodeSet) {
      return retval.map((n) => (n as unknown as { _node: XPathNode })._node);
    }
    throw new RuntimeError("Invalid return type");
  }
}

rbModConstSet(XML, "XPathContext", XPathContext);
