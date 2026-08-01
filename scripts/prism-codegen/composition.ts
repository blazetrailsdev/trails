/**
 * Composition-point ↔ MRO check (RFC 0086).
 *
 * Rails realizes a chain like `initialize_internals_callback` through `super`:
 * every module in `ActiveRecord::Base`'s ancestry contributes a fragment, and
 * the execution order falls out of the include order plus where each body puts
 * its `super`. The port has no `super` chain — `base.ts` calls each module's
 * contribution explicitly at a *composition point*. That call order is
 * hand-maintained and can silently drift from `base.rb`'s include order; until
 * now the only record of a realized chain was a per-row sign-off.
 *
 * A composition point declares itself in the port source with a marker:
 *
 *   // prism-mro: initialize_internals_callback Inheritance=ensureProperType \
 *   //   Scoping=_applyScopeAttributes Core=~
 *
 * `Module=identifier` binds a definer to the port symbol that realizes its
 * contribution; `Module=~` records a definer whose body contributes nothing
 * (Rails' `Core#initialize_internals_callback` is empty). Every definer the
 * MRO reaches must be declared — omission is drift, not silence.
 *
 * The check derives the expected execution order from the ancestry and the
 * super position of each Ruby body, reads the realized order out of the port
 * source below the marker, and fails when they differ.
 *
 * Hard rules: no node:* imports, no process.*, async fs only — this module is
 * pure (prism aside); score-cli.ts supplies the sources.
 */

import { loadPrism } from "@ruby/prism";
import { constPath, normalizeModuleName, type Linearization } from "./linearization.js";
import type { PrismNode } from "./types.js";

/** A definer's body relative to its `super` call. */
export interface SuperPosition {
  /** The body calls `super` at all — the chain continues past this module. */
  hasSuper: boolean;
  /** Statements run before `super` (so: in ancestry order). */
  before: boolean;
  /** Statements run after `super` (so: in reverse ancestry order). */
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
  /** Port file the marker lives in, relative to the port root. */
  file: string;
  /** Ruby method name of the chain, e.g. `initialize_internals_callback`. */
  method: string;
  contributions: Contribution[];
  /** Offset of the marker in the source; the realized order is read below it. */
  offset: number;
}

export function parseCompositionMarkers(file: string, source: string): CompositionMarker[] {
  return [...source.matchAll(MARKER)].map((m) => ({
    file,
    method: m[1],
    contributions: [...m[2].matchAll(BINDING)].map((b) => ({
      module: normalizeModuleName(b[1]),
      identifier: b[2],
    })),
    offset: m.index + m[0].length,
  }));
}

/**
 * Where each `Module#method` body puts its `super`. Keyed `Module#method`,
 * mirroring `indexModuleDefs`' module paths so both indexes agree on naming.
 */
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
 * The order the contributions to `method` actually run in, nearest-definer
 * first. A body's pre-`super` statements run on the way down the ancestry and
 * its post-`super` statements on the way back up, so the expected order is the
 * pre-super definers in ancestry order followed by the post-super definers in
 * reverse. The walk stops at the first definer that never calls `super`: the
 * rest of the ancestry is unreachable.
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
 * Every module the chain actually dispatches through, nearest first —
 * contributing ones and no-ops alike (Rails' `Core#initialize_internals_callback`
 * is empty). The port must declare all of them, so that a body growing a
 * contribution cannot slip in unnoticed.
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
 * The order the port realizes the contributions in: the declared identifiers
 * sorted by where they are first called below the marker. Identifiers bound to
 * `~` have no call site and are not part of the realized order.
 */
export function realizedCompositionOrder(
  marker: CompositionMarker,
  source: string,
): { order: string[]; missing: string[] } {
  const below = source.slice(marker.offset);
  const order: { module: string; at: number }[] = [];
  const missing: string[] = [];
  for (const { module, identifier } of marker.contributions) {
    if (identifier === UNREALIZED) continue;
    const at = below.search(new RegExp(`\\b${identifier}\\b[\\s(.]`));
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
      `  definers reached by the MRO but not declared: ${undeclared.join(", ")} ` +
        `(declare each as Module=identifier, or Module=~ when it contributes nothing)`,
    );
  }
  if (missing.length) {
    problems.push(
      `  declared identifiers with no call site below the marker: ${missing.join(", ")}`,
    );
  }
  if (problems.length === 0 && sameOrder(order, expectedRealized)) return undefined;
  if (!sameOrder(order, expectedRealized)) {
    problems.push(
      `  MRO order:      ${expectedRealized.join(" → ") || "(none)"}\n` +
        `  realized order: ${order.join(" → ") || "(none)"}`,
    );
  }
  return (
    `prism-codegen composition point: ${marker.file} :: ${marker.method} drifted ` +
    `from ActiveRecord::Base's MRO.\n${problems.join("\n")}`
  );
}

/**
 * Vendored path a `Base` ancestry entry's source lives at, by Rails' own
 * file-per-module convention (`Locking::Optimistic` → `locking/optimistic.rb`).
 * The check needs every ancestor's body, not just the codegen target set:
 * `Scoping` contributes to `initialize_internals_callback` and is not a target.
 */
export function rubyPathForModule(name: string): string {
  const parts = normalizeModuleName(name)
    .split("::")
    .map((part) => part.replace(/([a-z\d])([A-Z])/g, "$1_$2").toLowerCase());
  return `active_record/${parts.join("/")}.rb`;
}

export function compositionFailureMessage(failures: readonly string[]): string | undefined {
  if (failures.length === 0) return undefined;
  return [
    `prism-codegen composition check: ${failures.length} composition point(s) drifted.`,
    "",
    "The port calls each module's contribution explicitly where Rails uses `super`,",
    "so the call order at the composition point IS the MRO. Reorder the calls (or",
    "the marker's bindings) to match, or fix the marker if the chain changed.",
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
