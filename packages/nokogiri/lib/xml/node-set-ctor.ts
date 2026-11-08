import type { Node } from "../html5/node.js";
import type { NodeSet } from "./node-set.js";
import type { ContextHost, XPathContext } from "./xpath-context.js";

export type NodeSetCtor = new (document: unknown, list?: Node[]) => NodeSet;

let ctor: NodeSetCtor | undefined;

/** @internal */
export function registerNodeSetCtor(value: NodeSetCtor): void {
  ctor = value;
}

/** @internal */
export function nodeSetCtor(): NodeSetCtor {
  if (ctor === undefined) {
    throw new Error("NodeSet was used before xml/node-set.js finished initialising");
  }
  return ctor;
}

export type XPathContextCtor = new (node: ContextHost) => XPathContext;

let xpathCtor: XPathContextCtor | undefined;

/** @internal */
export function registerXPathContextCtor(value: XPathContextCtor): void {
  xpathCtor = value;
}

/** @internal */
export function xpathContextCtor(): XPathContextCtor {
  if (xpathCtor === undefined) {
    throw new Error("XPathContext was used before xml/xpath-context.js finished initialising");
  }
  return xpathCtor;
}
