/**
 * Builds eslint/rails-private-methods.json from
 * scripts/api-compare/output/rails-api.json.
 *
 * The manifest maps each TS source path (relative to repo root) to the
 * set of method/function names whose Rails counterpart is *exclusively*
 * private/protected on every Rails entity that contributes the name to
 * that TS file.
 *
 * Resolution model: for each Rails class/module C, the "effective" method
 * set is C's own methods plus the methods of every entity C includes
 * (transitively via `include` / `extend`). Each method's effective
 * visibility is the visibility on the entity that defines it. The
 * effective methods are projected onto C's source file — so a thin
 * TS wrapper like `Base.computeType` (where Rails Base inherits the
 * private `compute_type` from `Inheritance::ClassMethods` via
 * `extend`) lands in the manifest entry for `base.ts`.
 *
 * Then for each (TS file, name), we tag iff the name is private on
 * every entity that contributes it to that file. Names that are public
 * anywhere on the file's contributors stay out of the manifest. This
 * removes the need for a separate `packageGlobals` set and avoids
 * spurious matches against unrelated Rails-private accessors that
 * happen to share a name.
 *
 * Run after `pnpm api:compare` (or `ruby scripts/api-compare/extract-ruby-api.rb`):
 *   pnpm rails-privates:manifest
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { rubyMethodToTs, rubyFileToTs } from "./api-compare/conventions.js";
import { libPathsManifest } from "../vendor/sources.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Reuses the package layout from scripts/api-compare/config.ts so the
// two stay in lockstep. Paths are POSIX (forward slashes) — the ESLint
// rule looks up entries built from `path.relative(...).split(sep).join("/")`.
const PACKAGE_DIRS: Record<string, string> = {
  arel: "packages/arel/src",
  activemodel: "packages/activemodel/src",
  activerecord: "packages/activerecord/src",
  activesupport: "packages/activesupport/src",
  actiondispatch: "packages/actionpack/src/actiondispatch",
  actioncontroller: "packages/actionpack/src/actioncontroller",
  actionview: "packages/actionview/src",
  trailties: "packages/trailties/src",
};

const RAILS_API_PATH = path.join(ROOT, "scripts/api-compare/output/rails-api.json");
const OUT = path.join(ROOT, "eslint/rails-private-methods.json");

// The deprecation-parity manifest scans the vendored Ruby source directly and
// does NOT depend on rails-api.json, so emit it up front — before the early
// exit below that fires when rails-api.json is missing.
emitDeprecatedManifest();

if (!fs.existsSync(RAILS_API_PATH)) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ files: {} }, null, 2) + "\n");
  console.warn(
    `[build-rails-privates-manifest] ${RAILS_API_PATH} missing; wrote empty manifest. ` +
      `Run \`pnpm api:compare\` to regenerate with real data.`,
  );
  process.exit(0);
}

interface RubyMethod {
  name: string;
  visibility: "public" | "private" | "protected";
}
interface RubyEntity {
  fqn: string;
  file: string;
  includes?: string[];
  extends?: string[];
  instanceMethods?: RubyMethod[];
  classMethods?: RubyMethod[];
  __pkg?: string;
}

const railsApi = JSON.parse(fs.readFileSync(RAILS_API_PATH, "utf8"));

// Build a global entity index keyed by FQN. We need cross-package
// lookup so includes like `ActiveModel::API` resolve from activerecord
// into activemodel.
const entityByFqn = new Map<string, RubyEntity>();
for (const [pkg, rubyPkg] of Object.entries<any>(railsApi.packages)) {
  for (const e of [
    ...Object.values<RubyEntity>(rubyPkg.classes ?? {}),
    ...Object.values<RubyEntity>(rubyPkg.modules ?? {}),
  ]) {
    e.__pkg = pkg;
    entityByFqn.set(e.fqn, e);
  }
}

// Resolve a possibly-unqualified include reference to a full FQN.
// Walks parent namespaces of the host entity, then falls back to a
// global lookup. Returns null if no entity matches.
function resolveInclude(host: RubyEntity, ref: string): RubyEntity | null {
  if (entityByFqn.has(ref)) return entityByFqn.get(ref)!;
  const parts = host.fqn.split("::");
  // Strip trailing namespace segments and try `<prefix>::<ref>`.
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = [...parts.slice(0, i), ref].join("::");
    if (entityByFqn.has(candidate)) return entityByFqn.get(candidate)!;
  }
  return null;
}

// Walk the include / extend graph of `host` and return every entity
// that contributes methods to host's effective surface (host included).
// `kind` controls which graph edge to follow: "instance" walks
// `includes` (Module included into a class — adds instance methods),
// "class" walks `extends` (Module extended onto a class — adds class
// methods, plus the convention of `include FooModule` mixing in any
// nested `ClassMethods` module via `extended` hook).
function ancestorsFor(host: RubyEntity): { instance: RubyEntity[]; klass: RubyEntity[] } {
  const seenI = new Set<string>([host.fqn]);
  const seenC = new Set<string>([host.fqn]);
  const instance: RubyEntity[] = [host];
  const klass: RubyEntity[] = [host];

  const queue: RubyEntity[] = [host];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const ref of cur.includes ?? []) {
      const target = resolveInclude(host, ref);
      if (!target || seenI.has(target.fqn)) continue;
      seenI.add(target.fqn);
      instance.push(target);
      queue.push(target);
      // The Rails convention: `include Foo` triggers `extend Foo::ClassMethods`
      // automatically via the included hook. Mirror that.
      const cmFqn = `${target.fqn}::ClassMethods`;
      const cm = entityByFqn.get(cmFqn);
      if (cm && !seenC.has(cm.fqn)) {
        seenC.add(cm.fqn);
        klass.push(cm);
      }
    }
    for (const ref of cur.extends ?? []) {
      const target = resolveInclude(host, ref);
      if (!target || seenC.has(target.fqn)) continue;
      seenC.add(target.fqn);
      klass.push(target);
    }
  }
  return { instance, klass };
}

interface Manifest {
  files: Record<string, string[]>;
}
const manifest: Manifest = { files: {} };

for (const [pkg, rubyPkg] of Object.entries<any>(railsApi.packages)) {
  const pkgDir = PACKAGE_DIRS[pkg];
  if (!pkgDir) continue;

  // For each entity in this package, project its own + ancestor methods
  // onto its source file. Track per-file per-name visibility: a name is
  // marked all-private if every contributor declares it private/protected.
  // rubyFile → name → "all-private" | "mixed"
  const fileVis = new Map<string, Map<string, "all-private" | "mixed">>();
  const note = (file: string, name: string, vis: string) => {
    let m = fileVis.get(file);
    if (!m) {
      m = new Map();
      fileVis.set(file, m);
    }
    const isPriv = vis !== "public";
    const prev = m.get(name);
    if (prev === undefined) m.set(name, isPriv ? "all-private" : "mixed");
    else if (prev === "all-private" && !isPriv) m.set(name, "mixed");
  };

  const visit = (entities: Record<string, RubyEntity>) => {
    for (const host of Object.values(entities)) {
      if (!host.file) continue;
      const { instance, klass } = ancestorsFor(host);
      for (const ent of instance) {
        for (const m of ent.instanceMethods ?? []) note(host.file, m.name, m.visibility);
      }
      // Extend / extended-via-Concern: a module's *instance* methods
      // become class methods on the host. Plus the host's own class
      // methods.
      for (const ent of klass) {
        if (ent === host) {
          for (const m of ent.classMethods ?? []) note(host.file, m.name, m.visibility);
        } else {
          for (const m of ent.instanceMethods ?? []) note(host.file, m.name, m.visibility);
          for (const m of ent.classMethods ?? []) note(host.file, m.name, m.visibility);
        }
      }
    }
  };
  visit(rubyPkg.classes ?? {});
  visit(rubyPkg.modules ?? {});

  for (const [rubyFile, names] of fileVis) {
    const tsRel = path.posix.join(pkgDir, rubyFileToTs(rubyFile).split(path.sep).join("/"));
    const tsNames = new Set<string>();
    for (const [ruby, status] of names) {
      if (status !== "all-private") continue;
      for (const c of rubyMethodToTs(ruby) ?? []) tsNames.add(c);
    }
    if (tsNames.size === 0) continue;
    const existing = manifest.files[tsRel] ?? [];
    manifest.files[tsRel] = [...new Set([...existing, ...tsNames])].sort();
  }
}

const sortedFiles: Record<string, string[]> = {};
for (const k of Object.keys(manifest.files).sort()) sortedFiles[k] = manifest.files[k];
const final: Manifest = { files: sortedFiles };

fs.writeFileSync(OUT, JSON.stringify(final, null, 2) + "\n");
const fileCount = Object.keys(final.files).length;
const fileNames = Object.values(final.files).reduce((n, a) => n + a.length, 0);
console.log(`Wrote ${OUT} — ${fileCount} files (${fileNames} names)`);

// --- Deprecation-parity pass ---
//
// Independently of the private-method projection above, scan the vendored
// Ruby source for methods Rails marks deprecated and emit a sibling manifest
// keyed the same way (TS rel path → TS method names). The
// `rails-deprecated-jsdoc` ESLint rule consumes it to require `@deprecated`
// JSDoc on the matching TS declarations.
//
// Two Rails idioms mark a method deprecated:
//   - a class-body `deprecate :foo, :bar, deprecator: …` / `deprecate foo: "msg"`
//     macro naming already-defined methods, and
//   - a method body emitting `<Const>.deprecator.warn(…)` (e.g.
//     `ActiveRecord.deprecator.warn`). The `@deprecator.warn` form inside the
//     Deprecation proxy infrastructure itself is deliberately NOT matched —
//     it's the warning machinery, not a deprecated public method.
function indentLen(line: string): number {
  return line.match(/^[ \t]*/)?.[0].length ?? 0;
}

// Strip a trailing `# comment` (heredoc/string edge cases are rare in the
// lines we inspect and tolerated — a false negative just misses a tag).
function stripComment(line: string): string {
  const hash = line.indexOf("#");
  return hash === -1 ? line : line.slice(0, hash);
}

// Collect symbol / keyword targets from a `deprecate …` argument list,
// ignoring the `deprecator:` option.
function collectDeprecateTargets(argText: string, out: Set<string>): void {
  for (const partRaw of argText.split(",")) {
    const part = partRaw.trim();
    const sym = part.match(/^:([a-zA-Z_]\w*[?!=]?)/);
    if (sym) {
      out.add(sym[1]);
      continue;
    }
    const kw = part.match(/^([a-zA-Z_]\w*[?!=]?):/);
    if (kw && kw[1] !== "deprecator") out.add(kw[1]);
  }
}

// Nearest preceding `def` whose indentation is shallower than the warn line —
// method bodies are always indented deeper than their `def`.
function enclosingMethod(lines: string[], idx: number): string | null {
  const warnIndent = indentLen(lines[idx]);
  for (let j = idx - 1; j >= 0; j--) {
    const dm = lines[j].match(/^([ \t]*)def\s+(?:self\.)?([a-zA-Z_]\w*[?!=]?)/);
    if (dm && dm[1].length < warnIndent) return dm[2];
  }
  return null;
}

// Decide whether a `deprecator.warn` marks the *enclosing method itself*
// deprecated, versus merely warning about a deprecated argument or behavior
// from inside a still-live method. The two read very differently:
//
//   method:   "Called deprecated `…connection` method."
//             "`Benchmark.ms` is deprecated and will be removed …"
//   behavior: "Mapping a route with multiple paths is deprecated …"
//             "Passing an instance of … to …#since is deprecated"
//
// The grammatical subject of "… is deprecated" is the method name (in
// backticks) for a method deprecation, and some action/argument otherwise.
// We bias toward dropping when unsure — a missed tag is harmless (no false
// lint error), a spurious tag would demand `@deprecated` on live API.
function warnDeprecatesMethod(messageBlob: string, method: string): boolean {
  if (/called\s+deprecated[\s\S]*?\bmethod\b/i.test(messageBlob)) return true;
  // A backticked token ending in the method name, as the subject of
  // "is/are/will be … deprecated": e.g. `Benchmark.ms` is deprecated.
  const esc = method.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("`[^`]*\\b" + esc + "`\\s+(?:is|are|will be)\\b[^`]*?deprecated", "i");
  return re.test(messageBlob);
}

function deprecatedMethodsInRuby(src: string): Set<string> {
  const names = new Set<string>();
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const code = stripComment(lines[i]);
    const dep = code.match(/^\s*deprecate\s+(.+)$/);
    if (dep) {
      // `deprecate :foo` macro — unambiguously a method deprecation.
      collectDeprecateTargets(dep[1], names);
      continue;
    }
    if (/\b[A-Z][\w:]*\.deprecator\.warn\b/.test(code)) {
      const m = enclosingMethod(lines, i);
      // Join a small window so heredoc / multi-line message bodies are
      // visible to the classifier.
      const blob = lines.slice(i, i + 8).join("\n");
      if (m && warnDeprecatesMethod(blob, m)) names.add(m);
    }
  }
  return names;
}

function walkRubyFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkRubyFiles(full, out);
    else if (entry.isFile() && entry.name.endsWith(".rb")) out.push(full);
  }
}

function emitDeprecatedManifest(): void {
  const DEPRECATED_OUT = path.join(ROOT, "eslint/rails-deprecated-methods.json");
  const libPaths = libPathsManifest();
  const files: Record<string, string[]> = {};
  for (const [pkg, pkgDir] of Object.entries(PACKAGE_DIRS)) {
    const libDir = libPaths[pkg];
    if (!libDir || !fs.existsSync(libDir)) continue;
    const rubyFiles: string[] = [];
    walkRubyFiles(libDir, rubyFiles);
    for (const rubyAbs of rubyFiles) {
      const rubyNames = deprecatedMethodsInRuby(fs.readFileSync(rubyAbs, "utf8"));
      if (rubyNames.size === 0) continue;
      const rubyRel = path.relative(libDir, rubyAbs).split(path.sep).join("/");
      const tsRel = path.posix.join(pkgDir, rubyFileToTs(rubyRel).split(path.sep).join("/"));
      const tsNames = new Set<string>(files[tsRel] ?? []);
      for (const ruby of rubyNames) for (const c of rubyMethodToTs(ruby) ?? []) tsNames.add(c);
      if (tsNames.size > 0) files[tsRel] = [...tsNames].sort();
    }
  }

  const sorted: Record<string, string[]> = {};
  for (const k of Object.keys(files).sort()) sorted[k] = files[k];
  fs.writeFileSync(DEPRECATED_OUT, JSON.stringify({ files: sorted }, null, 2) + "\n");
  const fc = Object.keys(sorted).length;
  const nc = Object.values(sorted).reduce((n, a) => n + a.length, 0);
  console.log(`Wrote ${DEPRECATED_OUT} — ${fc} files (${nc} names)`);
}
