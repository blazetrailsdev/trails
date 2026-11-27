import {
  ArgumentError,
  methodMissingPrototype,
  rbInspect,
  stringSplit,
} from "@blazetrails/ruby-compat";

import { XML } from "../namespaces.js";

import { XmlDocument } from "./document.js";
import { XmlNode } from "./node.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a block takes whatever its caller yields.
type Block = (...args: any[]) => unknown;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- a tag name is any string `methodMissing` answers.
export class Builder {
  declare static NodeBuilder: typeof NodeBuilder;

  static readonly DEFAULT_DOCUMENT_OPTIONS = { namespaceInheritance: true };

  doc: XmlDocument;
  parent: XmlNode;
  context: unknown;
  arity: number | null;
  private nsPrefix: string | null;

  static with(root: XmlNode, block?: Block): Builder {
    return new this({}, root, block);
  }

  constructor(
    options: Record<string, unknown> | Block = {},
    root: XmlNode | Block | null = null,
    block?: Block,
  ) {
    if (typeof options === "function") {
      block = options;
      options = {};
    }
    if (typeof root === "function") {
      block = root;
      root = null;
    }

    if (root) {
      this.doc = root.document as XmlDocument;
      this.parent = root;
    } else {
      this.parent = this.doc = new XmlDocument();
    }

    this.context = null;
    this.arity = null;
    this.nsPrefix = null;

    options = { ...Builder.DEFAULT_DOCUMENT_OPTIONS, ...options };
    for (const [k, v] of Object.entries(options)) {
      (this.doc as unknown as Record<string, unknown>)[k] = v;
    }

    if (!block) return;

    this.arity = block.length;
    if (this.arity <= 0) {
      block.call(this);
    } else {
      block(this);
    }

    this.parent = this.doc;
  }

  text(string: unknown): NodeBuilder {
    return this.insert(this.doc.createTextNode(string));
  }

  cdata(string: unknown): NodeBuilder {
    return this.insert(this.doc.createCdata(string));
  }

  comment(string: unknown): NodeBuilder {
    return this.insert(this.doc.createComment(string));
  }

  get(nsPrefix: unknown): this {
    this.nsPrefix = String(nsPrefix);
    return this;
  }

  toXml(...args: Parameters<XmlDocument["toXml"]>): string {
    return this.doc.toXml(...args);
  }

  append(string: string): void {
    this.doc
      .fragment(string)
      .children.toA()
      .forEach((x) => this.insert(x));
  }

  methodMissing(method: string, ...args: unknown[]): unknown {
    const block = typeof args.at(-1) === "function" ? (args.pop() as Block) : undefined;
    const context = this.context as Record<string, unknown> | null;
    if (context != null && method in context) {
      return (context[method] as Block).call(context, ...args, ...(block ? [block] : []));
    } else {
      const node = this.doc.createElement(
        method.replace(/[_!]$/, ""),
        ...(args as (string | Record<string, unknown>)[]),
      );
      this.bindNs(node);
      return this.insert(node, block);
    }
  }

  /** @internal */
  private bindNs(node: XmlNode): void {
    if (this.nsPrefix === null) return;

    const ancestors = [node, this.parent, ...this.parent.ancestors().toA()] as (XmlNode | null)[];
    for (const ancestor of ancestors) {
      if (ancestor == null || ancestor.equals(this.doc)) break;

      const ns = ancestor.namespaceDefinitions.find((x) => x.prefix === this.nsPrefix);
      if (ns !== undefined) {
        this.nsPrefix = null;
        node.namespace = ns;
        break;
      }
    }

    if (this.nsPrefix === null) return;

    throw new ArgumentError(`Namespace prefix ${rbInspect(this.nsPrefix)} has not been defined`);
  }

  /** @internal */
  private insert(node: XmlNode, block?: Block): NodeBuilder {
    node = this.parent.addChild(node) as XmlNode;
    if (block) {
      const oldParent = this.parent;
      try {
        this.parent = node;
        this.arity ??= block.length;
        if (this.arity <= 0) {
          block.call(this);
        } else {
          block(this);
        }
      } finally {
        this.parent = oldParent;
      }
    }
    return new NodeBuilder(node, this);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- a tag name is any string `methodMissing` answers.
export interface Builder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [tag: string]: any;
}

methodMissingPrototype(Builder, { delegate: (receiver) => receiver.context });

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see Builder above.
export class NodeBuilder {
  private node: XmlNode;
  private docBuilder: Builder;

  constructor(node: XmlNode, docBuilder: Builder) {
    this.node = node;
    this.docBuilder = docBuilder;
  }

  set(k: string, v: unknown): void {
    this.node.set(String(k), String(v));
  }

  get(k: string): string | null {
    return this.node.get(k);
  }

  methodMissing(method: string, ...args: unknown[]): unknown {
    const block = typeof args.at(-1) === "function" ? (args.pop() as Block) : undefined;
    const last = args.at(-1);
    const opts = (
      last !== null && typeof last === "object" && Object.getPrototypeOf(last) === Object.prototype
        ? args.pop()
        : {}
    ) as Record<string, unknown>;
    let match: RegExpMatchArray | null;
    if ((match = String(method).match(/^(.*)!$/))) {
      this.node.set("id", match[1]);
      if (args[0] != null && args[0] !== false) this.node.content = args[0];
    } else if ((match = String(method).match(/^(.*)=/))) {
      this.node.set(match[1], String(args[0]));
    } else {
      this.node.set(
        "class",
        [...stringSplit(this.node.get("class") ?? "", /\s/), String(method)].join(" "),
      );
      if (args[0] != null && args[0] !== false) this.node.content = args[0];
    }

    for (const [k, v] of Object.entries(opts)) {
      this.node.set(String(k), [...stringSplit(this.node.get(String(k)) ?? "", /\s/), v].join(" "));
    }

    if (block) {
      const oldParent = this.docBuilder.parent;
      this.docBuilder.parent = this.node;

      const arity = this.docBuilder.arity ?? block.length;
      const value = arity <= 0 ? block.call(this.docBuilder) : block(this.docBuilder);

      this.docBuilder.parent = oldParent;
      return value;
    }
    return this;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see Builder above.
export interface NodeBuilder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [name: string]: any;
}

methodMissingPrototype(NodeBuilder, { delegate: () => null });
Builder.NodeBuilder = NodeBuilder;

XML.Builder = Builder;
