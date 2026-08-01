import { loadPrism } from "@ruby/prism";
import type { PrismNode } from "./types.js";

export interface ResolvedSuper {
  kind: "resolved";
  module: string;
  method: string;
}
export interface OutsideCorpusSuper {
  kind: "outside-corpus";
}
export type SuperResolution = ResolvedSuper | OutsideCorpusSuper;

export const OUTSIDE_CORPUS = "__PRISM_SUPER_OUTSIDE_CORPUS";
const AR = "ActiveRecord::";
const INCLUDE_LINE = /^[ \t]*include[ \t]+([A-Z][\w:]*)[ \t]*$/gm;

export function normalizeModuleName(name: string): string {
  return name.startsWith(AR) ? name.slice(AR.length) : name;
}

/**
 * The `include Foo` names in `ActiveRecord::Base`, in source order. Ruby
 * inserts each included module directly above the includer, so the last
 * `include` wins — the ancestry is this list reversed.
 */
export function parseIncludeOrder(baseSource: string): string[] {
  return [...baseSource.matchAll(INCLUDE_LINE)].map((m) => normalizeModuleName(m[1]));
}

export class Linearization {
  /** Nearest-first ancestry: `ancestry[0]` is the module `Base` sees first. */
  constructor(
    readonly ancestry: readonly string[],
    private readonly defs: ReadonlyMap<string, ReadonlySet<string>>,
  ) {}

  /** Ruby method names defined directly by `module`. */
  definitionsOf(module: string): ReadonlySet<string> {
    return this.defs.get(normalizeModuleName(module)) ?? new Set();
  }

  /**
   * The module a `super` inside `module`'s `method` dispatches to, or an
   * outside-corpus decline when the remaining ancestry has no definer (the
   * real target is ActiveModel/Object, which we do not index).
   */
  resolve(module: string, method: string): SuperResolution {
    const from = this.ancestry.indexOf(normalizeModuleName(module));
    if (from < 0) return { kind: "outside-corpus" };
    for (const next of this.ancestry.slice(from + 1)) {
      if (this.definitionsOf(next).has(method)) return { kind: "resolved", module: next, method };
    }
    return { kind: "outside-corpus" };
  }
}

/**
 * Ruby method names defined directly under each `module`/`class` path.
 * `def self.x` and `class << self` bodies are skipped: singleton methods live
 * on a separate ancestry from the instance chain `super` resolution walks.
 */
export async function indexModuleDefs(
  sources: Iterable<string>,
): Promise<Map<string, Set<string>>> {
  const parse = await loadPrism();
  const index = new Map<string, Set<string>>();
  for (const source of sources) {
    walk((parse(source).value as unknown as PrismNode) ?? null, [], index);
  }
  return index;
}

export async function buildLinearization(
  baseSource: string,
  moduleSources: Iterable<string>,
): Promise<Linearization> {
  const defs = await indexModuleDefs(moduleSources);
  return new Linearization([...parseIncludeOrder(baseSource)].reverse(), defs);
}

function walk(node: PrismNode | null, path: string[], index: Map<string, Set<string>>): void {
  if (!node?.constructor) return;
  const kind = node.constructor.name;
  if (kind === "ModuleNode" || kind === "ClassNode") {
    const nested = [...path, constPath(node.constantPath as PrismNode | undefined, node.name)];
    for (const child of node.compactChildNodes()) walk(child, nested, index);
    return;
  }
  if (kind === "SingletonClassNode") return;
  if (kind === "DefNode" && !node.receiver && path.length) {
    const owner = normalizeModuleName(path.join("::"));
    const set = index.get(owner) ?? new Set<string>();
    set.add(String(node.name));
    index.set(owner, set);
    return;
  }
  for (const child of node.compactChildNodes()) walk(child, path, index);
}

/** Full constant path of a `module`/`class` node, e.g. `ActiveRecord::Scoping`. */
export function constPath(path: PrismNode | undefined, name: unknown): string {
  if (path?.constructor.name === "ConstantPathNode") {
    const parts: string[] = [];
    let cur: PrismNode | undefined = path;
    while (cur && cur.constructor.name === "ConstantPathNode") {
      parts.unshift(String(cur.name));
      cur = cur.parent as PrismNode | undefined;
    }
    if (cur) parts.unshift(String(cur.name));
    return parts.join("::");
  }
  return String(name ?? "Anon");
}
