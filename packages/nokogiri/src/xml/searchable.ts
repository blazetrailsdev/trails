import { aryJoin } from "@blazetrails/ruby-compat";

import type { Node } from "../html5/node.js";
import type { NodeSet } from "./node-set.js";
import { XML } from "../namespaces.js";
import { xpathFor } from "../css.js";
import { BuiltinsConfig, XPathVisitor } from "../css/xpath-visitor.js";
import { usesLibxml } from "../version/info.js";
import { XPathContext } from "./xpath-context.js";

export interface SearchableHost {
  readonly document: unknown;
  readonly _node: unknown;
  css(...args: unknown[]): NodeSet;
}

export function css(this: SearchableHost, ...args: unknown[]): NodeSet {
  const [rules, handler, ns] = extractParams.call(this, args);

  return cssInternal(this, rules, handler, ns);
}

export function atCss(this: SearchableHost, ...args: unknown[]): Node | undefined {
  return this.css(...args).first();
}

export const Searchable = { css, atCss };

/** @internal */
export function extractParams(
  this: SearchableHost,
  params: unknown[],
): [string[], unknown, Record<string, string>, Record<string, unknown> | undefined] {
  const handler = params.find(
    (param) => param != null && typeof param !== "string" && !isHash(param),
  );
  if (handler !== undefined) params = params.filter((param) => param !== handler);

  const hashes: unknown[] = [];
  while (isHash(params.at(-1)) || params.at(-1) == null) {
    hashes.push(params.pop());
    if (params.length === 0) break;
  }
  hashes.reverse();
  let ns = hashes[0] as Record<string, string> | undefined;
  const binds = hashes[1] as Record<string, unknown> | undefined;

  ns ??=
    (this.document as { root?: { namespaces?: Record<string, string> } | null }).root?.namespaces ??
    {};

  return [params as string[], handler, ns, binds];
}

function isHash(param: unknown): param is Record<string, unknown> {
  return param != null && Object.getPrototypeOf(param) === Object.prototype;
}

function cssInternal(
  node: SearchableHost,
  rules: string[],
  handler: unknown,
  ns: Record<string, string>,
): NodeSet {
  return xpathInternal(node, cssRulesToXpath(node, rules, ns), handler, ns, null);
}

/** @internal */
export function cssRulesToXpath(
  node: SearchableHost,
  rules: string[],
  ns: Record<string, string>,
): string[] {
  return rules.map((rule) => xpathQueryFromCssRule(node, rule, ns));
}

function xpathQueryFromCssRule(node: SearchableHost, rule: string, ns: Record<string, string>) {
  return aryJoin(
    (
      node.constructor as unknown as { IMPLIED_XPATH_CONTEXTS: readonly string[] }
    ).IMPLIED_XPATH_CONTEXTS.map((impliedXpathContext) => {
      const visitor = new XPathVisitor({
        builtins: BuiltinsConfig.OPTIMAL,
        doctype: (node.document as { xpathDoctype(): XPathVisitor["doctype"] }).xpathDoctype(),
        prefix: impliedXpathContext,
        namespaces: ns,
      });
      return xpathFor(String(rule), { visitor });
    }),
    " | ",
  );
}

/** @internal */
export function xpathInternal(
  node: SearchableHost,
  paths: string[],
  handler: unknown,
  ns: Record<string, string>,
  binds: Record<string, unknown> | null,
): NodeSet {
  const document = node.document;
  if (document == null) return new XML.NodeSet(document);

  if (paths.length === 1) return xpathImpl(node, paths[0], handler, ns, binds);

  return paths.reduce(
    (combined, path) => combined.plus(xpathImpl(node, path, handler, ns, binds)),
    new XML.NodeSet(document),
  );
}

function xpathImpl(
  node: SearchableHost,
  path: string,
  handler: unknown,
  ns: Record<string, string>,
  binds: Record<string, unknown> | null,
): NodeSet {
  const context = new XPathContext(node);
  context.registerNamespaces(ns);
  context.registerVariables(binds);

  if (!usesLibxml()) path = path.replaceAll("xmlns:", " :");

  return context.evaluate(path, handler) as NodeSet;
}
