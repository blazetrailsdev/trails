import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { methodName } from "./naming.js";
import { rubyAbsPathFor } from "./files.js";

const RUBY_DEF = /^\s*def\s+(?:self\.)?([A-Za-z_][\w]*[?!=]?)/gm;
const MIXIN_LINE = /^[ \t]*(?:include|extend)[ \t]+([A-Z][\w:]*(?:[ \t]*,[ \t]*[A-Z][\w:]*)*)/gm;

export function rubyDefinedMethods(rubySource: string): Set<string> {
  const defs = new Set<string>();
  for (const m of rubySource.matchAll(RUBY_DEF)) defs.add(methodName(m[1]));
  return defs;
}

/**
 * The `include Foo` / `extend Foo::Bar` constant names in a Ruby source. One
 * `include` can name several modules — `Relation` mixes in seven of them on a
 * single line — so every constant on the line is returned, not just the first.
 */
export function parseMixinNames(rubySource: string): string[] {
  return [...rubySource.matchAll(MIXIN_LINE)].flatMap((m) => m[1].split(",").map((n) => n.trim()));
}

function underscore(segment: string): string {
  return segment
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function stripPrefix(rel: string): string {
  return rel.replace(/^active_record\//, "");
}

/**
 * Where a mixin constant referenced from `fromRel` could live. Ruby resolves
 * the constant lexically, which we cannot do from a path alone, so we try the
 * three layouts Rails actually uses: nested under the includer's own file
 * (`relation.rb` → `relation/finder_methods.rb`), a sibling of it, and the
 * `active_record/` root. `resolveMixinPath` picks between them by asking which
 * one really defines the constant.
 */
export function mixinPathCandidates(fromRel: string, moduleName: string): string[] {
  const segments = moduleName
    .split("::")
    .map(underscore)
    .filter((s) => s !== "active_record");
  if (!segments.length) return [];
  const tail = `${segments.join("/")}.rb`;
  const from = stripPrefix(fromRel);
  const nested = `${from.replace(/\.rb$/, "")}/${tail}`;
  const dir = path.posix.dirname(from);
  const sibling = dir === "." ? tail : `${dir}/${tail}`;
  return [...new Set([nested, sibling, tail])];
}

const MODULE_DECL = /^([ \t]*)(?:module|class)[ \t]+([A-Z][\w:]*)[ \t]*(?:<[^<]|;|$)/;
const HEREDOC_OPEN = /<<[-~]?([A-Z_]+)/;
const COMMENT = /#(?!\{).*$/;

/**
 * The full constant paths a Ruby source defines, e.g. `active_record/
 * relation/calculations.rb` → `ActiveRecord::Relation::Calculations`. Nesting
 * is read off the indentation rather than by matching `end`s: Rails indents
 * consistently, and an `end`-counting scanner has to model every block-opening
 * keyword to stay in sync, where a miscount silently corrupts every later path.
 *
 * Comments are stripped before matching and heredoc bodies are skipped
 * wholesale: a `module Foo` line inside an embedded SQL/Ruby string defines
 * nothing, and pushing it would corrupt every path derived after it. The
 * declaration pattern's trailing alternation keeps `class << self` out — a
 * singleton body defines no constant — while admitting the `< Superclass` of a
 * class and the `; end` of a one-line declaration.
 */
function moduleDefinitionPaths(rubySource: string): Set<string> {
  const paths = new Set<string>();
  const stack: { indent: number; name: string }[] = [];
  let heredoc: string | undefined;
  for (const line of rubySource.split("\n")) {
    if (heredoc !== undefined) {
      if (line.trim() === heredoc) heredoc = undefined;
      continue;
    }
    const code = line.replace(COMMENT, "");
    const opened = HEREDOC_OPEN.exec(code);
    if (opened) heredoc = opened[1];
    const m = MODULE_DECL.exec(code);
    if (!m) continue;
    const indent = m[1].replace(/\t/g, "  ").length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    stack.push({ indent, name: m[2] });
    paths.add(stack.map((s) => s.name).join("::"));
  }
  return paths;
}

function definesModule(rubySource: string, moduleName: string): boolean {
  const wanted = moduleName.replace(/^::/, "");
  for (const defined of moduleDefinitionPaths(rubySource)) {
    if (defined === wanted || defined.endsWith(`::${wanted}`)) return true;
  }
  return false;
}

/**
 * Every file that could define `moduleName`, nearest lexical scope first. A
 * nested constant is often defined inside its parent's file rather than a file
 * of its own (`QueryCache::ClassMethods` lives in `query_cache.rb`), so the
 * paths of the enclosing constants are candidates too — with the full name
 * still required, so `query_cache.rb` only answers for what it really defines.
 */
function resolutionCandidates(fromRel: string, moduleName: string): string[] {
  const segments = moduleName.split("::");
  const candidates = [
    stripPrefix(fromRel),
    ...segments.flatMap((_, i) =>
      mixinPathCandidates(fromRel, segments.slice(0, segments.length - i).join("::")),
    ),
  ];
  return [...new Set(candidates)];
}

/** An `include`/`extend` constant no file in the corpus was found to define. */
export interface UnresolvedMixin {
  fromRel: string;
  moduleName: string;
}

const unresolvedMixins = new Map<string, UnresolvedMixin>();

/**
 * Every mixin constant that resolved to no file, deduplicated by call site.
 * An unresolvable constant under-scopes the await decision for the file that
 * includes it, so the misses are reported rather than silently dropped.
 */
export function unresolvedMixinReport(): UnresolvedMixin[] {
  return [...unresolvedMixins.values()];
}

/** Clears the report — for tests, and for a caller that reports per run. */
export function resetUnresolvedMixins(): void {
  unresolvedMixins.clear();
}

/**
 * The file a mixin constant referenced from `fromRel` resolves to, or
 * `undefined` when nothing in the corpus defines it. The candidates are tried
 * nearest-first, which is the order Ruby's lexical lookup uses, and each one
 * has to actually define the constant — existing on disk is not enough, since
 * Rails has same-named constants at different nesting levels.
 */
export function resolveMixinPath(
  fromRel: string,
  moduleName: string,
  readSource: RubySourceReader,
): string | undefined {
  for (const candidate of resolutionCandidates(fromRel, moduleName)) {
    const source = readSource(candidate);
    if (source !== undefined && definesModule(source, moduleName)) return candidate;
  }
  unresolvedMixins.set(`${stripPrefix(fromRel)} :: ${moduleName}`, {
    fromRel: stripPrefix(fromRel),
    moduleName,
  });
  return undefined;
}

/** Reads one Rails source by its `active_record/`-relative path. */
export type RubySourceReader = (railsRelPath: string) => string | undefined;

const readRuby: RubySourceReader = (rel) => {
  const abs = rubyAbsPathFor(rel);
  return existsSync(abs) ? readFileSync(abs, "utf8") : undefined;
};

/** Ruby method names defined directly in one Rails file. */
export function ownRailsDefs(railsRelPath: string): Set<string> {
  return rubyDefinedMethods(readRuby(stripPrefix(railsRelPath)) ?? "");
}

const reachableCache = new Map<string, Set<string>>();

/**
 * Every Ruby method name reachable from `railsRelPath` — the file's own `def`s
 * plus those of the modules it includes/extends, transitively. `readSource`
 * defaults to the vendored Rails checkout.
 *
 * The await rule is taken on a bare callee name, so the set it consults has to
 * be the set of methods the generated file's `self` could actually dispatch
 * to. Scoping it to the whole target corpus made two same-named Rails methods
 * in unrelated files indistinguishable, and the async one dragged an await
 * onto the sync one's self-call.
 *
 * `def`s are collected flat, so a `def` in an inner class (`Relation`'s
 * `ExplainProxy`) counts as reachable. That errs toward the old, wider scope
 * and never drops a name the file really can dispatch to.
 */
export function reachableRailsDefs(
  railsRelPath: string,
  readSource: RubySourceReader = readRuby,
): Set<string> {
  const cached = readSource === readRuby ? reachableCache.get(railsRelPath) : undefined;
  if (cached) return cached;
  const defs = new Set<string>();
  const seen = new Set<string>();
  const queue = [stripPrefix(railsRelPath)];
  while (queue.length) {
    const rel = queue.shift() as string;
    if (seen.has(rel)) continue;
    seen.add(rel);
    const source = readSource(rel);
    if (source === undefined) continue;
    for (const name of rubyDefinedMethods(source)) defs.add(name);
    for (const mixin of parseMixinNames(source)) {
      const resolved = resolveMixinPath(rel, mixin, readSource);
      if (resolved !== undefined && !seen.has(resolved)) queue.push(resolved);
    }
  }
  if (readSource === readRuby) reachableCache.set(railsRelPath, defs);
  return defs;
}
