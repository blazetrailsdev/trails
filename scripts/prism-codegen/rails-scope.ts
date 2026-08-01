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
 * `active_record/` root. Non-existent candidates are dropped by the caller.
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

/** Ruby method names defined directly in one Rails file. */
export function ownRailsDefs(railsRelPath: string): Set<string> {
  return rubyDefinedMethods(readRuby(stripPrefix(railsRelPath)) ?? "");
}

function readRuby(rel: string): string | undefined {
  const abs = rubyAbsPathFor(rel);
  return existsSync(abs) ? readFileSync(abs, "utf8") : undefined;
}

const reachableCache = new Map<string, Set<string>>();

/**
 * Every Ruby method name reachable from `railsRelPath` — the file's own `def`s
 * plus those of the modules it includes/extends, transitively.
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
export function reachableRailsDefs(railsRelPath: string): Set<string> {
  const cached = reachableCache.get(railsRelPath);
  if (cached) return cached;
  const defs = new Set<string>();
  const seen = new Set<string>();
  const queue = [stripPrefix(railsRelPath)];
  while (queue.length) {
    const rel = queue.shift() as string;
    if (seen.has(rel)) continue;
    seen.add(rel);
    const source = readRuby(rel);
    if (source === undefined) continue;
    for (const name of rubyDefinedMethods(source)) defs.add(name);
    for (const mixin of parseMixinNames(source)) {
      for (const candidate of mixinPathCandidates(rel, mixin)) {
        if (!seen.has(candidate) && existsSync(rubyAbsPathFor(candidate))) queue.push(candidate);
      }
    }
  }
  reachableCache.set(railsRelPath, defs);
  return defs;
}
