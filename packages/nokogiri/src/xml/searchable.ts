import type { DefaultTreeAdapterMap } from "parse5";
import { XmlDocument as LibXmlDocument, XmlTreeNode } from "libxml2-wasm";

import type { Node } from "../html5/node.js";
import type { NodeSet } from "./node-set.js";
import { HTML5, XML } from "../namespaces.js";
import { SyntaxError } from "../css/syntax-error.js";
import { SyntaxError as XPathSyntaxError } from "./xpath/syntax-error.js";

type Parse5Node = DefaultTreeAdapterMap["node"];
type Parse5Element = DefaultTreeAdapterMap["element"];

export interface SearchableHost {
  readonly document: unknown;
  readonly _node: Parse5Node | XmlTreeNode | LibXmlDocument | null;
  css(...args: unknown[]): NodeSet;
}

/** @noRailsEquivalent CONVERGEABLE port-nokogiri-css-xpath-visitor */
interface Compound {
  tag: string | null;
  ids: string[];
  classes: string[];
  attrs: [string, string | null, string][];
  pseudos: [string, string | null][];
}

export function css(this: SearchableHost, ...args: unknown[]): NodeSet {
  const [rules, handler, ns] = extractParams(args);

  return cssInternal(this, rules, handler, ns);
}

export function atCss(this: SearchableHost, ...args: unknown[]): Node | undefined {
  return this.css(...args).first();
}

export const Searchable = { css, atCss };

/** @internal */
export function extractParams(
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
  const [ns, binds] = hashes.reverse() as [
    Record<string, string> | undefined,
    Record<string, unknown> | undefined,
  ];

  return [params as string[], handler, ns ?? {}, binds];
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
export function cssRulesToXpath(node: SearchableHost, rules: string[], ns: Record<string, string>) {
  return rules.map((rule) => xpathQueryFromCssRule(node, rule, ns));
}

function xpathQueryFromCssRule(node: SearchableHost, rule: string, _ns: Record<string, string>) {
  return (
    node.constructor as unknown as { IMPLIED_XPATH_CONTEXTS: readonly string[] }
  ).IMPLIED_XPATH_CONTEXTS.map((impliedXpathContext) => ({
    prefix: impliedXpathContext,
    groups: new Parser(rule).parse(),
  }));
}

/** @noRailsEquivalent CONVERGEABLE port-nokogiri-css-xpath-visitor */
type Path = ReturnType<typeof xpathQueryFromCssRule>;

/** @internal */
export function xpathInternal(
  node: SearchableHost,
  paths: Path[],
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

/** @noRailsEquivalent CONVERGEABLE port-nokogiri-css-xpath-visitor */
function xpathImpl(
  node: SearchableHost,
  path: Path,
  handler: unknown,
  ns: Record<string, string>,
  _binds: Record<string, unknown> | null,
): NodeSet {
  const host = node._node;
  if (host instanceof XmlTreeNode || host instanceof LibXmlDocument) {
    const xpath = path
      .flatMap(({ prefix, groups }) => groups.map((steps) => prefix + xpathFromSteps(steps)))
      .join(" | ");
    return new XML.NodeSet(
      node.document,
      host
        .find(xpath, ns)
        .map((n) => new XML.Node(n as XmlTreeNode, node.document) as unknown as Node),
    );
  }
  if (host === null) return new XML.NodeSet(node.document);
  const found = new Set<Parse5Node>();
  for (const { prefix, groups } of path) {
    const start = prefix === "self::" ? [host] : descendants(prefix === "//" ? rootOf(host) : host);
    for (const steps of groups) {
      for (const el of evaluate(start, steps, handler)) found.add(el);
    }
  }
  const ordered = descendants(rootOf(host), true).filter((n) => found.has(n));
  return new XML.NodeSet(
    node.document,
    ordered.map((n) => new HTML5.Node(n as DefaultTreeAdapterMap["childNode"], node.document)),
  );
}

/** @noRailsEquivalent CONVERGEABLE port-nokogiri-css-xpath-visitor */
function xpathFromSteps(steps: [string, Compound][]): string {
  return steps
    .map(([combinator, compound], i) => {
      const axis =
        i === 0
          ? ""
          : combinator === ">"
            ? "/"
            : combinator === "+"
              ? "/following-sibling::*[1]/self::"
              : combinator === "~"
                ? "/following-sibling::"
                : "//";
      return axis + xpathFromCompound(compound);
    })
    .join("");
}

/** @noRailsEquivalent CONVERGEABLE port-nokogiri-css-xpath-visitor */
function xpathFromCompound(c: Compound): string {
  const literal = (value: string) => {
    if (!value.includes("'")) return `'${value}'`;
    if (!value.includes('"')) return `"${value}"`;
    return `concat("${value.split('"').join(`",'"',"`)}","")`;
  };
  const cssClass = (hay: string, needle: string) =>
    `contains(concat(' ',normalize-space(${hay}),' '),' ${needle} ')`;
  const predicates = [
    ...c.ids.map((id) => `@id=${literal(id)}`),
    ...c.classes.map((klass) => cssClass("@class", klass)),
    ...c.attrs.map(([name, op, value]) => {
      const attribute = `@${name}`;
      const v = literal(value);
      if (op === null) return attribute;
      if (op === "=") return `${attribute}=${v}`;
      if (op === "!=") return `${attribute}!=${v}`;
      if (op === "*=") return `contains(${attribute},${v})`;
      if (op === "^=") return `starts-with(${attribute},${v})`;
      if (op === "|=") return `${attribute}=${v} or starts-with(${attribute},concat(${v},'-'))`;
      if (op === "~=") return cssClass(attribute, value);
      return `substring(${attribute},string-length(${attribute})-string-length(${v})+1,string-length(${v}))=${v}`;
    }),
    ...c.pseudos.map(([name, args]) => {
      if (name === "root") return "not(parent::*)";
      if (name === "first-child") return "count(preceding-sibling::*)=0";
      if (name === "last-child") return "count(following-sibling::*)=0";
      if (name === "only-child")
        return "count(preceding-sibling::*)=0 and count(following-sibling::*)=0";
      if (name === "empty") return "not(node())";
      if (name === "not") return `not(self::${xpathFromCompound(new Parser(args!).compound())})`;
      if (name === "nth-child") {
        const [a, b] = nthChild(args);
        const index = "(count(preceding-sibling::*)+1)";
        return a === 0
          ? `${index}=${b}`
          : `(${index}-${b}) mod ${a}=0 and (${index}-${b}) div ${a}>=0`;
      }
      throw new XPathSyntaxError(`Unregistered function: ${name}`);
    }),
  ];
  return (c.tag ?? "*") + predicates.map((p) => `[${p}]`).join("");
}

/** @noRailsEquivalent CONVERGEABLE port-nokogiri-css-xpath-visitor */
function evaluate(start: Parse5Node[], steps: [string, Compound][], handler: unknown) {
  let set = start.filter((n) => matches(n, steps[0][1], handler));
  for (const [combinator, compound] of steps.slice(1)) {
    const next = new Set<Parse5Node>();
    for (const n of set) {
      let candidates: Parse5Node[];
      if (combinator === ">") candidates = elementChildren(n);
      else if (combinator === "+" || combinator === "~") {
        const siblings = elementChildren(parentOf(n));
        const after = siblings.slice(siblings.indexOf(n as Parse5Element) + 1);
        candidates = combinator === "+" ? after.slice(0, 1) : after;
      } else candidates = descendants(n);
      for (const c of candidates) if (matches(c, compound, handler)) next.add(c);
    }
    set = [...next];
  }
  return set;
}

/** @noRailsEquivalent CONVERGEABLE port-nokogiri-css-xpath-visitor */
function matches(n: Parse5Node, c: Compound, handler: unknown): boolean {
  if (!("tagName" in n)) return false;
  const attr = (name: string) => n.attrs.find((a) => a.name === name)?.value ?? null;
  if (c.tag !== null && c.tag !== "*" && n.tagName !== c.tag.toLowerCase()) return false;
  if (c.ids.some((id) => attr("id") !== id)) return false;
  const classes = (attr("class") ?? "").split(/\s+/);
  if (c.classes.some((klass) => !classes.includes(klass))) return false;
  for (const [name, op, value] of c.attrs) {
    const v = attr(name);
    if (op === "!=") {
      if (v === value) return false;
      continue;
    }
    if (v === null) return false;
    if (op === "=" && v !== value) return false;
    if (op === "~=" && !v.split(/\s+/).includes(value)) return false;
    if (op === "^=" && !v.startsWith(value)) return false;
    if (op === "$=" && !v.endsWith(value)) return false;
    if (op === "*=" && !v.includes(value)) return false;
    if (op === "|=" && v !== value && !v.startsWith(`${value}-`)) return false;
  }
  for (const [name, args] of c.pseudos) {
    const siblings = elementChildren(parentOf(n));
    const index = siblings.indexOf(n as Parse5Element) + 1;
    if (name === "root") {
      if ("tagName" in parentOf(n)) return false;
    } else if (name === "first-child") {
      if (index !== 1) return false;
    } else if (name === "last-child") {
      if (index !== siblings.length) return false;
    } else if (name === "only-child") {
      if (siblings.length !== 1) return false;
    } else if (name === "nth-child") {
      const [a, b] = nthChild(args);
      if (a === 0 ? index !== b : (index - b) / a < 0 || (index - b) % a !== 0) return false;
    } else if (name === "empty") {
      if (n.childNodes.length > 0) return false;
    } else if (name === "not") {
      if (matches(n, new Parser(args!).compound(), handler)) return false;
    } else {
      const fn = (handler as Record<string, (...a: unknown[]) => unknown[]> | undefined)?.[name];
      if (typeof fn !== "function") throw new XPathSyntaxError(`Unregistered function: ${name}`);
      if (fn.call(handler, [new HTML5.Node(n, null)], ...splitArgs(args ?? "")).length === 0)
        return false;
    }
  }
  return true;
}

/** @noRailsEquivalent CONVERGEABLE port-nokogiri-css-xpath-visitor */
function nthChild(args: string | null): [number, number] {
  const nth = /^\s*(?:([+-]?\d*)n\s*(?:([+-])\s*(\d+))?|([+-]?\d+))\s*$/.exec(
    args === "odd" ? "2n+1" : args === "even" ? "2n" : (args ?? ""),
  );
  if (nth === null) throw new SyntaxError(`unexpected '${args}' in nth-child`);
  const a =
    nth[4] !== undefined
      ? 0
      : nth[1] === "" || nth[1] === "+"
        ? 1
        : nth[1] === "-"
          ? -1
          : Number(nth[1]);
  const b = nth[4] !== undefined ? Number(nth[4]) : Number(`${nth[2] ?? "+"}${nth[3] ?? "0"}`);
  return [a, b];
}

/** @noRailsEquivalent CONVERGEABLE port-nokogiri-css-xpath-visitor */
function splitArgs(args: string): string[] {
  return [...args.matchAll(/\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[^,]+)\s*(?:,|$)/g)].map(
    ([, arg]) => unquote(arg.trim()),
  );
}

/** @noRailsEquivalent CONVERGEABLE port-nokogiri-css-xpath-visitor */
function unquote(value: string): string {
  return /^(['"]).*\1$/s.test(value) ? value.slice(1, -1).replace(/\\(['"])/g, "$1") : value;
}

/** @noRailsEquivalent CONVERGEABLE port-nokogiri-css-xpath-visitor */
function parentOf(n: Parse5Node): Parse5Node {
  return (n as { parentNode?: Parse5Node }).parentNode ?? n;
}

/** @noRailsEquivalent CONVERGEABLE port-nokogiri-css-xpath-visitor */
function rootOf(n: Parse5Node): Parse5Node {
  while ((n as { parentNode?: Parse5Node | null }).parentNode) n = parentOf(n);
  return n;
}

/** @noRailsEquivalent CONVERGEABLE port-nokogiri-css-xpath-visitor */
function elementChildren(n: Parse5Node): Parse5Element[] {
  const children = (n as { childNodes?: Parse5Node[] }).childNodes ?? [];
  return children.filter((c): c is Parse5Element => "tagName" in c);
}

/** @noRailsEquivalent CONVERGEABLE port-nokogiri-css-xpath-visitor */
function descendants(n: Parse5Node, includeSelf = false): Parse5Node[] {
  const result: Parse5Node[] = includeSelf ? [n] : [];
  const content = (n as { content?: Parse5Node }).content;
  for (const c of [...elementChildren(n), ...(content ? elementChildren(content) : [])]) {
    result.push(...descendants(c, true));
  }
  return result;
}

/** @noRailsEquivalent CONVERGEABLE port-nokogiri-css-xpath-visitor */
class Parser {
  private pos = 0;

  constructor(private readonly src: string) {}

  parse(): [string, Compound][][] {
    const groups: [string, Compound][][] = [];
    let steps: [string, Compound][] = [[" ", this.compound()]];
    for (;;) {
      const ws = this.eat(/\s*/);
      const comb = this.eat(/[>+~,]/);
      this.eat(/\s*/);
      if (this.pos >= this.src.length) {
        if (comb)
          throw new SyntaxError(`unexpected end of selector after '${comb}' in ${this.src}`);
        break;
      }
      if (comb === ",") {
        groups.push(steps);
        steps = [[" ", this.compound()]];
      } else if (comb || ws) steps.push([comb || " ", this.compound()]);
      else throw new SyntaxError(`unexpected '${this.src[this.pos]}' in ${this.src}`);
    }
    groups.push(steps);
    return groups;
  }

  compound(): Compound {
    const c: Compound = {
      tag: this.eat(/\*|[-\w]+/),
      ids: [],
      classes: [],
      attrs: [],
      pseudos: [],
    };
    for (;;) {
      const sigil = this.eat(/[#.[:]/);
      if (sigil === "#") c.ids.push(this.eat(/[-\w]+/)!);
      else if (sigil === ".") c.classes.push(this.eat(/[-\w]+/)!);
      else if (sigil === "[") {
        const m = this.eat(
          /\s*[-\w:]+\s*(?:[~^$*|!]?=\s*(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[-\w]+)\s*)?\]/,
        );
        if (m === null) throw new SyntaxError(`unexpected '${this.src[this.pos]}' in ${this.src}`);
        const [, name, op, value] = /^\s*([-\w:]+)\s*(?:([~^$*|!]?=)\s*(.*?))?\s*\]$/s.exec(m)!;
        c.attrs.push([name, op ?? null, unquote(value ?? "")]);
      } else if (sigil === ":") {
        const name = this.eat(/[-\w]+/)!;
        c.pseudos.push([name, this.src[this.pos] === "(" ? this.balanced() : null]);
      } else if (
        c.tag === null &&
        c.ids.length + c.classes.length + c.attrs.length + c.pseudos.length === 0
      ) {
        throw new SyntaxError(`unexpected '${this.src[this.pos] ?? "$"}' in ${this.src}`);
      } else return c;
    }
  }

  private balanced(): string {
    let depth = 0;
    const start = this.pos + 1;
    for (; this.pos < this.src.length; this.pos++) {
      if (this.src[this.pos] === "(") depth++;
      else if (this.src[this.pos] === ")" && --depth === 0) break;
    }
    return this.src.slice(start, this.pos++);
  }

  private eat(re: RegExp): string | null {
    const sticky = new RegExp(re.source, "y");
    sticky.lastIndex = this.pos;
    const m = sticky.exec(this.src);
    if (!m || m[0] === "") return null;
    this.pos += m[0].length;
    return m[0];
  }
}
