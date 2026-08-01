/**
 * Composition-point ↔ MRO check (RFC 0086).
 *
 * Rails realizes a chain like `initialize_internals_callback` through `super`,
 * so its execution order falls out of `Base`'s include order plus where each
 * body puts its `super`. The port has no `super` chain — `base.ts` calls the
 * contributions explicitly at a *composition point*, in a hand-maintained
 * order that can silently drift. A composition point declares itself with a
 * marker:
 *
 *   // prism-mro: initialize_internals_callback Inheritance=ensureProperType \
 *   //   Scoping=_applyScopeAttributes Core=~
 *
 * `Module=identifier` binds a definer to the port symbol realizing it;
 * `Module=~` records a definer whose Ruby body contributes nothing. Every
 * definer the MRO reaches must be declared — omission is drift, not silence.
 *
 * Hard rules: no node:* imports, no process.*, async fs only — this module is
 * pure (prism aside); score-cli.ts supplies the sources.
 */

import { loadPrism } from "@ruby/prism";
import { constPath, normalizeModuleName, type Linearization } from "./linearization.js";
import type { PrismNode } from "./types.js";

/**
 * A definer's body relative to its `super` call: whether the chain continues
 * past this module, and whether statements run before it (in ancestry order)
 * or after it (in reverse).
 */
export interface SuperPosition {
  hasSuper: boolean;
  before: boolean;
  after: boolean;
}

/** Marker syntax: `prism-mro: <ruby_method> Module=identifier ...` */
const MARKER = /prism-mro:[ \t]*([a-z_][\w?!]*)((?:[\s/*]+[A-Z][\w:]*=[\w~$]+)+)/g;
const BINDING = /([A-Z][\w:]*)=([\w~$]+)/g;
/** A definer whose contribution the port does not realize (empty Ruby body). */
const UNREALIZED = "~";

export interface Contribution {
  module: string;
  /** Port symbol realizing the contribution, or `~` when there is none. */
  identifier: string;
}

export interface CompositionMarker {
  file: string;
  /** Ruby method name of the chain, e.g. `initialize_internals_callback`. */
  method: string;
  contributions: Contribution[];
  /** The marker's own region — `[offset, end)`, ending at the next marker or
   * the file's end. A file can hold several composition points (base.ts has
   * one per constructor branch) and each must read only its own call sites. */
  offset: number;
  end: number;
}

export function parseCompositionMarkers(file: string, source: string): CompositionMarker[] {
  const matches = [...source.matchAll(MARKER)];
  return matches.map((m, i) => ({
    file,
    method: m[1],
    contributions: [...m[2].matchAll(BINDING)].map((b) => ({
      module: normalizeModuleName(b[1]),
      identifier: b[2],
    })),
    offset: m.index + m[0].length,
    end: matches[i + 1]?.index ?? source.length,
  }));
}

/** Where each body puts its `super`, keyed `Module#method` as `indexModuleDefs` keys modules. */
export async function indexSuperPositions(
  sources: Iterable<string>,
): Promise<Map<string, SuperPosition>> {
  const parse = await loadPrism();
  const index = new Map<string, SuperPosition>();
  for (const source of sources) {
    walk((parse(source).value as unknown as PrismNode) ?? null, [], index);
  }
  return index;
}

/**
 * The order the contributions to `method` run in. A body's pre-`super`
 * statements run on the way down the ancestry and its post-`super` statements
 * on the way back up, so it is the pre-super definers in ancestry order
 * followed by the post-super definers in reverse.
 */
export function expectedCompositionOrder(
  linearization: Linearization,
  positions: ReadonlyMap<string, SuperPosition>,
  method: string,
): string[] {
  const before: string[] = [];
  const after: string[] = [];
  for (const module of reachedDefiners(linearization, positions, method)) {
    const position = positions.get(`${module}#${method}`)!;
    if (position.before) before.push(module);
    if (position.after) after.unshift(module);
  }
  return [...before, ...after];
}

/**
 * Every module the chain dispatches through, nearest first — contributing ones
 * and no-ops alike, so a body that grows a contribution cannot slip in
 * unnoticed. Stops at the first definer that never calls `super`: the rest of
 * the ancestry is unreachable.
 */
export function reachedDefiners(
  linearization: Linearization,
  positions: ReadonlyMap<string, SuperPosition>,
  method: string,
): string[] {
  const reached: string[] = [];
  for (const module of linearization.ancestry) {
    if (!linearization.definitionsOf(module).has(method)) continue;
    const position = positions.get(`${module}#${method}`);
    if (!position) continue;
    reached.push(module);
    if (!position.hasSuper) break;
  }
  return reached;
}

/**
 * The declared identifiers, ordered by where they are first *called* in the
 * marker's region. A bare reference (`const cb = ensureProperType`) is not a
 * call site: what the MRO orders is when each contribution runs, and only an
 * invocation places one in that order. `~` bindings have no call site.
 */
export function realizedCompositionOrder(
  marker: CompositionMarker,
  source: string,
): { order: string[]; missing: string[] } {
  const below = source.slice(marker.offset, marker.end);
  const order: { module: string; at: number }[] = [];
  const missing: string[] = [];
  for (const { module, identifier } of marker.contributions) {
    if (identifier === UNREALIZED) continue;
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const at = below.search(new RegExp(`\\b${escaped}\\s*(?:\\(|\\.(?:call|apply)\\s*\\()`));
    if (at < 0) missing.push(identifier);
    else order.push({ module, at });
  }
  return { order: order.sort((a, b) => a.at - b.at).map((c) => c.module), missing };
}

/**
 * Drift at one composition point, or `undefined` when the realized order
 * matches the MRO. Three ways to drift: an undeclared definer (the port either
 * dropped a contribution or the include order grew one), a declared identifier
 * with no call site below the marker, and a realized order that does not match
 * the expected one.
 */
export function checkCompositionPoint(
  marker: CompositionMarker,
  source: string,
  linearization: Linearization,
  positions: ReadonlyMap<string, SuperPosition>,
): string | undefined {
  const expected = expectedCompositionOrder(linearization, positions, marker.method);
  const declared = new Set(marker.contributions.map((c) => c.module));
  const undeclared = reachedDefiners(linearization, positions, marker.method).filter(
    (m) => !declared.has(m),
  );
  const { order, missing } = realizedCompositionOrder(marker, source);
  const expectedRealized = expected.filter((m) =>
    marker.contributions.some((c) => c.module === m && c.identifier !== UNREALIZED),
  );
  const problems: string[] = [];
  if (undeclared.length) {
    problems.push(
      `  reached by the MRO but not declared: ${undeclared.join(", ")} ` +
        "(declare each as Module=identifier, or Module=~ when it contributes nothing)",
    );
  }
  if (missing.length) {
    problems.push(`  declared with no call site below the marker: ${missing.join(", ")}`);
  }
  if (!sameOrder(order, expectedRealized)) {
    problems.push(
      `  MRO order:      ${expectedRealized.join(" → ") || "(none)"}\n` +
        `  realized order: ${order.join(" → ") || "(none)"}`,
    );
  }
  if (problems.length === 0) return undefined;
  return (
    `prism-codegen composition point: ${marker.file} :: ${marker.method} drifted ` +
    `from ActiveRecord::Base's MRO.\n${problems.join("\n")}`
  );
}

/**
 * Vendored paths a `Base` ancestry entry's source may live at, most specific
 * first: Rails is mostly file-per-module (`Locking::Optimistic` →
 * `locking/optimistic.rb`), but a nested module can also be declared in its
 * parent's file (`Marshalling::Methods` lives in `marshalling.rb`). The check
 * needs every ancestor's body, not just the codegen target set — `Scoping`
 * contributes to `initialize_internals_callback` and is not a target.
 */
export function rubyPathCandidatesForModule(name: string): string[] {
  const parts = normalizeModuleName(name)
    .split("::")
    .map((part) => part.replace(/([a-z\d])([A-Z])/g, "$1_$2").toLowerCase());
  return parts.map((_, i) => `active_record/${parts.slice(0, parts.length - i).join("/")}.rb`);
}

/**
 * Ancestry entries living in another Rails component, which no path under
 * `activerecord/lib/active_record/` resolves — outside the corpus in the sense
 * `Linearization#resolve` means it. Every OTHER unresolved entry must fail
 * loudly: a definer whose source never loaded is invisible to both indexes.
 */
export function isExternalAncestor(name: string): boolean {
  return /^Active(Model|Support)::/.test(name);
}

export function unresolvedAncestryMessage(unresolved: readonly string[]): string | undefined {
  const real = unresolved.filter((name) => !isExternalAncestor(name));
  if (real.length === 0) return undefined;
  return [
    `prism-codegen composition check: ${real.length} ancestry module(s) of ` +
      "ActiveRecord::Base have no vendored source at the path derived for them.",
    "",
    "Their bodies are invisible to the check, so a contribution they make to a",
    "guarded chain would be dropped without a word. Fix the path derivation, or",
    "teach `isExternalAncestor` where the module really lives.",
    "",
    ...real.map((name) => `  ${name} → ${rubyPathCandidatesForModule(name).join(", ")}`),
  ].join("\n");
}

export function compositionFailureMessage(failures: readonly string[]): string | undefined {
  if (failures.length === 0) return undefined;
  return [
    `prism-codegen composition check: ${failures.length} composition point(s) drifted.`,
    "",
    "The port calls each contribution explicitly where Rails uses `super`, so the",
    "call order at a composition point IS the MRO. Reorder the calls to match, or",
    "fix the marker if the chain itself changed.",
    "",
    ...failures,
  ].join("\n");
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((m, i) => m === b[i]);
}

function walk(node: PrismNode | null, path: string[], index: Map<string, SuperPosition>): void {
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
    index.set(`${owner}#${String(node.name)}`, superPositionOf(node));
    return;
  }
  for (const child of node.compactChildNodes()) walk(child, path, index);
}

function superPositionOf(def: PrismNode): SuperPosition {
  const statements = ((def.body as PrismNode | undefined)?.body as PrismNode[] | undefined) ?? [];
  const at = statements.findIndex(containsSuper);
  if (at < 0) return { hasSuper: false, before: statements.length > 0, after: false };
  return { hasSuper: true, before: at > 0, after: at < statements.length - 1 };
}

function containsSuper(node: PrismNode | null): boolean {
  if (!node?.constructor) return false;
  const kind = node.constructor.name;
  if (kind === "SuperNode" || kind === "ForwardingSuperNode") return true;
  if (kind === "DefNode" || kind === "ModuleNode" || kind === "ClassNode") return false;
  return node.compactChildNodes().some((child) => containsSuper(child as PrismNode | null));
}
