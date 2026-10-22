import type { DefaultTreeAdapterMap } from "parse5";
import {
  XmlAttribute as LibXmlAttribute,
  XmlComment as LibXmlComment,
  XmlDocument as LibXmlDocument,
  XmlElement as LibXmlElement,
  XmlNode,
  XmlTreeNode,
} from "libxml2-wasm";
import {
  RuntimeError,
  stringValue,
  toS,
  rbFSend,
  rbModConstSet,
  rbObjRespondTo,
  warn,
} from "@blazetrails/ruby-compat";

import type { Node } from "../html5/node.js";
import { HTML5, XML } from "../namespaces.js";
import type { NodeSet } from "./node-set.js";
import "./namespace.js";
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
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";

class NamespaceNode<E> {
  constructor(
    readonly owner: E,
    readonly prefix: string | null,
    readonly href: string,
  ) {}
}

function namespaceNodes<E>(owner: E, inScope: Record<string, string>): NamespaceNode<E>[] {
  const result = [new NamespaceNode(owner, "xml", XML_NAMESPACE)];
  for (const [prefix, href] of Object.entries(inScope)) {
    if (prefix === "xml" || (prefix === "" && href === "")) continue;
    result.push(new NamespaceNode(owner, prefix === "" ? null : prefix, href));
  }
  return result;
}

class Parse5AttrNode {
  constructor(
    readonly owner: Parse5Element,
    readonly attr: Parse5Attr,
  ) {}

  get name(): string {
    return this.attr.name;
  }

  get value(): string {
    return this.attr.value;
  }
}

type Parse5XPathNode = Parse5Node | Parse5AttrNode | NamespaceNode<Parse5Element>;

const parse5Attrs = new WeakMap<Parse5Element, Parse5AttrNode[]>();
const parse5Namespaces = new WeakMap<Parse5Element, NamespaceNode<Parse5Element>[]>();

function isParse5Attr(node: Parse5XPathNode): node is Parse5AttrNode {
  return node instanceof Parse5AttrNode;
}

function parse5InScopeNamespaces(element: Parse5Element): Record<string, string> {
  const inScope: Record<string, string> = {};
  for (let n: Parse5Node | null = element; n !== null && "tagName" in n; n = n.parentNode) {
    for (const attr of n.attrs) {
      let prefix: string | null = null;
      if (attr.prefix === "xmlns") prefix = attr.name;
      else if (attr.name === "xmlns") prefix = "";
      else if (attr.name.startsWith("xmlns:")) prefix = attr.name.slice(6);
      if (prefix !== null && !Object.hasOwn(inScope, prefix)) inScope[prefix] = attr.value;
    }
  }
  return inScope;
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
    if (node instanceof NamespaceNode) return "namespace";
    if (isParse5Attr(node)) return "attribute";
    if (node.nodeName === "#text") return "text";
    if (node.nodeName === "#comment") return "comment";
    if ("tagName" in node) return "element";
    return "root";
  },
  parent(node) {
    if (isParse5Attr(node) || node instanceof NamespaceNode) return node.owner;
    return (node as { parentNode?: Parse5Node | null }).parentNode ?? null;
  },
  children(node) {
    return isParse5Attr(node) || node instanceof NamespaceNode ? [] : parse5Children(node);
  },
  attributes(node) {
    if (isParse5Attr(node) || node instanceof NamespaceNode || !("tagName" in node)) return [];
    let attrs = parse5Attrs.get(node);
    if (attrs === undefined || attrs.length !== node.attrs.length) {
      attrs = node.attrs.map((attr) => new Parse5AttrNode(node, attr));
      parse5Attrs.set(node, attrs);
    }
    return attrs;
  },
  namespaces(node) {
    if (isParse5Attr(node) || node instanceof NamespaceNode || !("tagName" in node)) return [];
    let namespaces = parse5Namespaces.get(node);
    if (namespaces === undefined) {
      namespaces = namespaceNodes(node, parse5InScopeNamespaces(node));
      parse5Namespaces.set(node, namespaces);
    }
    return namespaces;
  },
  localName(node) {
    if (node instanceof NamespaceNode) return node.prefix ?? "";
    if (isParse5Attr(node)) return node.attr.name.replace(/^.*:/, "");
    return "tagName" in node ? node.tagName : "";
  },
  qualifiedName(node) {
    if (node instanceof NamespaceNode) return node.prefix ?? "";
    if (isParse5Attr(node))
      return node.attr.prefix ? `${node.attr.prefix}:${node.attr.name}` : node.attr.name;
    return "tagName" in node ? node.tagName : "";
  },
  namespaceUri(node) {
    if (node instanceof NamespaceNode) return null;
    if (isParse5Attr(node)) return node.attr.namespace ?? null;
    if (!("tagName" in node)) return null;
    return node.namespaceURI === HTML_NAMESPACE ? null : node.namespaceURI;
  },
  stringValue(node) {
    if (node instanceof NamespaceNode) return node.href;
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

type LibXmlXPathNode = XmlNode | LibXmlRoot | NamespaceNode<LibXmlElement>;

const libXmlRoots = new WeakMap<LibXmlDocument, LibXmlRoot>();

function libXmlRoot(doc: LibXmlDocument): LibXmlRoot {
  let root = libXmlRoots.get(doc);
  if (root === undefined) libXmlRoots.set(doc, (root = new LibXmlRoot(doc)));
  return root;
}

function libXmlPtr(node: XmlNode): number {
  return (node as unknown as { _nodePtr: number })._nodePtr;
}

const LIBXML_TREE: Tree<LibXmlXPathNode> = {
  kind(node): NodeKind {
    if (node instanceof NamespaceNode) return "namespace";
    if (node instanceof LibXmlRoot) return "root";
    if (node instanceof LibXmlAttribute) return "attribute";
    if (node instanceof LibXmlElement) return "element";
    if (node instanceof LibXmlComment) return "comment";
    if (node.eval("boolean(self::processing-instruction())") === true) {
      return "processing-instruction";
    }
    return "text";
  },
  parent(node) {
    if (node instanceof LibXmlRoot) return null;
    if (node instanceof NamespaceNode) return node.owner;
    return node.parent ?? libXmlRoot(node.doc);
  },
  children(node) {
    if (node instanceof LibXmlRoot) return node.doc.find("/node()") as LibXmlXPathNode[];
    if (!(node instanceof LibXmlElement)) return [];
    return node.find("node()") as LibXmlXPathNode[];
  },
  attributes(node) {
    return node instanceof LibXmlElement ? node.attrs : [];
  },
  namespaces(node) {
    return node instanceof LibXmlElement ? namespaceNodes(node, node.namespaces) : [];
  },
  localName(node) {
    if (node instanceof NamespaceNode) return node.prefix ?? "";
    if (node instanceof LibXmlElement || node instanceof LibXmlAttribute) return node.name;
    if (node instanceof LibXmlRoot) return "";
    return node.eval("local-name()") as string;
  },
  qualifiedName(node) {
    if (node instanceof NamespaceNode) return node.prefix ?? "";
    if (!(node instanceof LibXmlElement || node instanceof LibXmlAttribute)) return "";
    return node.prefix ? `${node.prefix}:${node.name}` : node.name;
  },
  namespaceUri(node) {
    if (!(node instanceof LibXmlElement || node instanceof LibXmlAttribute)) return null;
    return node.namespaceUri || null;
  },
  stringValue(node) {
    if (node instanceof LibXmlRoot) return node.doc.root.content;
    if (node instanceof NamespaceNode) return node.href;
    if (node instanceof LibXmlAttribute) return node.value;
    return node.content;
  },
  key(node) {
    if (node instanceof NamespaceNode) return `${libXmlPtr(node.owner)} xmlns:${node.prefix}`;
    return node instanceof LibXmlRoot ? node : libXmlPtr(node);
  },
};

interface ContextHost {
  readonly document: unknown;
  readonly _node: unknown;
}

type XPathNode = Parse5XPathNode | LibXmlXPathNode;

function isBlankCh(c: string | undefined): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r";
}

function cssClass(str: string, val: string): string | null {
  const valLen = val.length;
  if (valLen === 0) return str;

  let i = 0;
  while (i < str.length) {
    if (str[i] === val[0] && str.startsWith(val, i)) {
      const nextByte = str[i + valLen];

      if (nextByte === undefined || isBlankCh(nextByte)) {
        return str.slice(i);
      }
    }

    while (i < str.length && !isBlankCh(str[i])) {
      i++;
    }

    while (i < str.length && isBlankCh(str[i])) {
      i++;
    }
  }

  return null;
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
      return cssClass(hay, needle) !== null;
    });
    this._functions.set(`${NOKOGIRI_BUILTIN_URI} local-name-is`, (context, args) => {
      if (args.length !== 1) return XPathContext.arityError();
      return context.tree.localName(context.node) === toXPathString(this._tree, args[0]);
    });
  }

  registerNamespaces(namespaces: Record<string, string | null>): void {
    for (const entry of Object.entries(namespaces)) {
      let key = entry[0];
      const value = entry[1];
      key = key.replace(/.*:/, "");

      this.registerNs(key, value);
    }
  }

  registerVariables(binds: Record<string, unknown> | null | undefined): void {
    if (binds == null) return;

    for (const entry of Object.entries(binds)) {
      let key: unknown = entry[0];
      const value = entry[1];
      key = toS(key);

      this.registerVariable(key as string, value);
    }
  }

  registerNs(prefix: string, uri: string | null): this {
    if (uri === null) this._namespaces.delete(prefix);
    else this._namespaces.set(prefix, uri);

    return this;
  }

  registerVariable(name: string, value: unknown): this {
    if (value == null) this._variables.delete(name);
    else this._variables.set(name, stringValue(value));

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
            this.marshalFuncallAndReturnValues(
              { ...context, valueStack: [...args] },
              args.length,
              handler,
              name,
            );
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
    if (node instanceof NamespaceNode) {
      return new XML.Namespace(node, this._document) as unknown as Node;
    }
    if (node instanceof LibXmlAttribute || node instanceof Parse5AttrNode) {
      return new XML.Attr(node, this._document) as unknown as Node;
    }
    if (node instanceof XmlNode)
      return new XML.Node(node as XmlTreeNode, this._document) as unknown as Node;
    if (this._tree.kind(node) === "root") return this._document as Node;
    return new HTML5.Node(node as DefaultTreeAdapterMap["childNode"], this._document);
  }

  private xpath2ruby(value: Value<XPathNode>): NodeSet | string | number | boolean {
    if (Array.isArray(value)) {
      return new XML.NodeSet(
        this._document,
        value.map((n) => this.wrap(n)),
      );
    }
    return value;
  }

  private marshalFuncallAndReturnValues(
    ctxt: FunctionContext<XPathNode> & { valueStack: Value<XPathNode>[] },
    argc: number,
    rbXpathHandler: unknown,
    methodName: string,
  ): Value<XPathNode> | null {
    const argv: unknown[] = new Array(argc);
    for (let j = argc - 1; j >= 0; --j) {
      argv[j] = this.xpath2ruby(ctxt.valueStack.pop()!);
    }

    const rbRetval = rbFSend(rbXpathHandler, methodName, ...argv);

    if (typeof rbRetval === "number") return rbRetval;
    if (typeof rbRetval === "bigint") return Number(rbRetval);
    if (typeof rbRetval === "string") return rbRetval;
    if (rbRetval === true) return true;
    if (rbRetval === false) return false;
    if (rbRetval == null) return null;
    if (Array.isArray(rbRetval)) {
      const rbNodeSet = new XML.NodeSet(this._document, rbRetval as Node[]);
      return rbNodeSet.map((n) => (n as unknown as { _node: XPathNode })._node);
    }
    if (rbRetval instanceof XML.NodeSet) {
      return rbRetval.map((n) => (n as unknown as { _node: XPathNode })._node);
    }
    throw new RuntimeError("Invalid return type");
  }
}

rbModConstSet(XML, "XPathContext", XPathContext);
