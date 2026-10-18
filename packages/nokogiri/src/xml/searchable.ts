import type { DefaultTreeAdapterMap } from "parse5";

import { Node } from "../html5/node.js";
import { NodeSet } from "./node-set.js";

type Parse5Node = DefaultTreeAdapterMap["node"];
type Parse5Element = DefaultTreeAdapterMap["element"];

export interface Searchable {
  readonly document?: unknown;
  readonly _node: Parse5Node;
  css(...args: unknown[]): NodeSet;
}

interface Compound {
  tag: string | null;
  ids: string[];
  classes: string[];
  attrs: [string, string | null, string][];
  pseudos: [string, string | null][];
}
type Path = { contexts: readonly string[]; groups: [string, Compound][][] };

export function css(this: Searchable, ...args: unknown[]): NodeSet {
  const [rules, handler] = extractParams(args);

  return cssInternal(this, rules, handler);
}

export function atCss(this: Searchable, ...args: unknown[]): Node | undefined {
  return this.css(...args).first();
}

/** @internal */
export function extractParams(params: unknown[]): [string[], unknown] {
  const handler = params.find(
    (param) => typeof param !== "string" && Object.getPrototypeOf(param) !== Object.prototype,
  );
  if (handler !== undefined) params = params.filter((param) => param !== handler);

  return [params.filter((param): param is string => typeof param === "string"), handler];
}

function cssInternal(node: Searchable, rules: string[], handler: unknown): NodeSet {
  return xpathInternal(node, cssRulesToXpath(node, rules), handler);
}

/** @internal */
export function cssRulesToXpath(node: Searchable, rules: string[]): Path[] {
  return rules.map((rule) => xpathQueryFromCssRule(node, rule));
}

function xpathQueryFromCssRule(node: Searchable, rule: string): Path {
  const contexts = (node.constructor as unknown as { IMPLIED_XPATH_CONTEXTS: readonly string[] })
    .IMPLIED_XPATH_CONTEXTS;
  return { contexts, groups: new Parser(rule).parse() };
}

/** @internal */
export function xpathInternal(node: Searchable, paths: Path[], handler: unknown): NodeSet {
  const found = new Set<Parse5Node>();
  for (const path of paths) {
    for (const context of path.contexts) {
      const start =
        context === "self::"
          ? [node._node]
          : descendants(context === "//" ? rootOf(node._node) : node._node);
      for (const steps of path.groups) {
        for (const el of evaluate(start, steps, handler)) found.add(el);
      }
    }
  }
  const ordered = descendants(rootOf(node._node), true).filter((n) => found.has(n));
  return new NodeSet(
    node.document ?? null,
    ordered.map((n) => new Node(n as DefaultTreeAdapterMap["childNode"])),
  );
}

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
      const nth = args === "odd" ? index % 2 === 1 : args === "even" ? index % 2 === 0 : null;
      if (nth === false || (nth === null && index !== Number(args))) return false;
    } else if (name === "empty") {
      if (n.childNodes.length > 0) return false;
    } else if (name === "not") {
      if (matches(n, new Parser(args!).compound(), handler)) return false;
    } else {
      const fn = (handler as Record<string, (...a: unknown[]) => unknown[]> | undefined)?.[name];
      if (typeof fn !== "function") throw new Error(`Invalid pseudo-class: ${name}`);
      if (fn.call(handler, [new Node(n)], ...splitArgs(args ?? "")).length === 0) return false;
    }
  }
  return true;
}

function splitArgs(args: string): string[] {
  return [...args.matchAll(/\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[^,]+)\s*(?:,|$)/g)].map(
    ([, arg]) => unquote(arg.trim()),
  );
}

function unquote(value: string): string {
  return /^(['"]).*\1$/s.test(value) ? value.slice(1, -1).replace(/\\(['"])/g, "$1") : value;
}

function parentOf(n: Parse5Node): Parse5Node {
  return (n as { parentNode?: Parse5Node }).parentNode ?? n;
}

function rootOf(n: Parse5Node): Parse5Node {
  while ((n as { parentNode?: Parse5Node | null }).parentNode) n = parentOf(n);
  return n;
}

function elementChildren(n: Parse5Node): Parse5Element[] {
  const children = (n as { childNodes?: Parse5Node[] }).childNodes ?? [];
  return children.filter((c): c is Parse5Element => "tagName" in c);
}

function descendants(n: Parse5Node, includeSelf = false): Parse5Node[] {
  const result: Parse5Node[] = includeSelf ? [n] : [];
  const content = (n as { content?: Parse5Node }).content;
  for (const c of [...elementChildren(n), ...(content ? elementChildren(content) : [])]) {
    result.push(...descendants(c, true));
  }
  return result;
}

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
      if (this.pos >= this.src.length) break;
      if (comb === ",") {
        groups.push(steps);
        steps = [[" ", this.compound()]];
      } else if (comb || ws) steps.push([comb || " ", this.compound()]);
      else throw new Error(`unexpected '${this.src[this.pos]}' in ${this.src}`);
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
          /\s*[-\w:]+\s*(?:[~^$*|!]?=\s*(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[^\]\s]+)\s*)?\]/,
        )!;
        const [, name, op, value] = /^\s*([-\w:]+)\s*(?:([~^$*|!]?=)\s*(.*?))?\s*\]$/.exec(m)!;
        c.attrs.push([name, op ?? null, unquote(value ?? "")]);
      } else if (sigil === ":") {
        const name = this.eat(/[-\w]+/)!;
        c.pseudos.push([name, this.src[this.pos] === "(" ? this.balanced() : null]);
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
