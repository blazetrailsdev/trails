import type { Node } from "../html5/node.js";
import type { NodeSet } from "./node-set.js";
import type { ContextHost, XPathContext } from "./xpath-context.js";

/**
 * Late binding for `NodeSet`, to keep `searchable.ts` out of an import cycle.
 *
 * `searchable.ts` provides the `css`/`xpath` mixin that `node-set.ts` and
 * `html5/document.ts` `include` at module scope, and it needs `NodeSet` only to
 * *construct* results. Importing it directly made the cycle
 * `node-set -> searchable -> node-set`, so whichever module initialised second
 * observed the other mid-initialisation. That is fragile on any runtime — Node
 * throws a TDZ `ReferenceError` for the equivalent shape — and under perry the
 * namespace object for a half-initialised module is `undefined`, so
 * `include(Document, Searchable)` received `undefined` and threw
 * `TypeError: Cannot convert undefined or null to object` during boot.
 *
 * `node-set.ts` registers the constructor as the last step of its own
 * initialisation; `searchable.ts` resolves it when a query actually runs, which
 * is always after boot. The type-only import above erases, so no runtime edge
 * remains.
 */
export type NodeSetCtor = new (document: unknown, list?: Node[]) => NodeSet;

let ctor: NodeSetCtor | undefined;

/** @internal Called by `node-set.ts` once `NodeSet` is fully defined. */
export function registerNodeSetCtor(value: NodeSetCtor): void {
  ctor = value;
}

/** @internal The registered `NodeSet`, for modules that must not import it. */
export function nodeSetCtor(): NodeSetCtor {
  if (ctor === undefined) {
    throw new Error("NodeSet was used before xml/node-set.js finished initialising");
  }
  return ctor;
}

export type XPathContextCtor = new (node: ContextHost) => XPathContext;

let xpathCtor: XPathContextCtor | undefined;

/** @internal Called by `xpath-context.ts` once `XPathContext` is fully defined. */
export function registerXPathContextCtor(value: XPathContextCtor): void {
  xpathCtor = value;
}

/**
 * @internal The registered `XPathContext`.
 *
 * `searchable.ts` must not import `xpath-context.js` at runtime: that was its
 * only edge into nokogiri's 8-module import cycle
 * (`searchable -> xpath-context -> {html5/node, xml/node, xml/attr} -> searchable`),
 * and being inside the cycle is what left its namespace half-built when the
 * five `include(X, Searchable)` call sites read it during boot.
 */
export function xpathContextCtor(): XPathContextCtor {
  if (xpathCtor === undefined) {
    throw new Error("XPathContext was used before xml/xpath-context.js finished initialising");
  }
  return xpathCtor;
}
