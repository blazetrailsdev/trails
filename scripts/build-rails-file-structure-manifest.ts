/**
 * Builds the manifest(s) consumed by the `rails-file-structure-*`
 * ESLint rule family (docs/infrastructure/rails-file-structure-mirror-plan.md) from
 * scripts/api-compare/output/rails-api.json.
 *
 * Currently emits:
 *   eslint/rails-file-structure-method-order.json — maps each TS source
 *     path (relative to repo root) to `{ classes, functions }`: per-class
 *     ordered member-name lists plus the file's top-level function order,
 *     derived from the Rails source's method order. Keyed per class so a
 *     file defining several classes with overlapping member names can
 *     express each class's own order. Read by
 *     `blazetrails/rails-file-structure-method-order`.
 *
 * Future sibling rules (include-position, visibility-grouping, module-
 * nesting) will emit additional manifests here as they land.
 *
 * Unmapped TS members (those not present in the method-order list) stay
 * in their existing relative position, after the mapped block.
 *
 * Run after `pnpm parity:api` — invoked from run.sh alongside the
 * privates manifest builder.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { rubyMethodToTs, rubyFileToTs } from "@blazetrails/parity/conventions";
import { writeJsonManifest } from "@blazetrails/parity/write-json-manifest";
import { mergeBySourceLine } from "./api-compare/source-order.js";
import {
  operatorSpelling,
  unusedOperatorSpellings,
} from "./api-compare/operator-order-spelling.js";
import { resolveMixinParent } from "./rails-file-structure-mixins.js";
import { lastSegment, resolveLastSegmentCollision } from "./rails-file-structure-collisions.js";
import { railsApiAvailable } from "./api-compare/require-rails-api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Mirrors scripts/build-rails-privates-manifest.ts.
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
const OUT = path.join(ROOT, "eslint/rails-file-structure-method-order.json");

if (
  !railsApiAvailable({
    scriptName: "build-rails-file-structure-manifest",
    railsApiPath: RAILS_API_PATH,
    manifestName: "eslint/rails-file-structure-method-order.json",
    ruleName: "rails-file-structure-method-order",
    argv: process.argv.slice(2),
  })
) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  writeJsonManifest(OUT, { files: {} });
  process.exit(0);
}

interface RubyMethod {
  name: string;
  visibility: "public" | "private" | "protected";
  file?: string;
  line?: number;
}
interface RubyEntity {
  fqn: string;
  file: string;
  instanceMethods?: RubyMethod[];
  classMethods?: RubyMethod[];
}
interface RubyPackage {
  classes?: Record<string, RubyEntity>;
  modules?: Record<string, RubyEntity>;
}
type TaggedMethod = RubyMethod & { isStatic: boolean };
// Attach staticness to each method so it survives the source-line merge — the
// manifest needs to know whether the interleaved entry was a class method.
const tagStatic = (methods: RubyMethod[] = [], isStatic: boolean): TaggedMethod[] =>
  methods.map((m) => ({ ...m, isStatic }));

const railsApi = JSON.parse(fs.readFileSync(RAILS_API_PATH, "utf8"));

// Order data is keyed per TS container, not per file: `classes[Name]` holds
// the member order for the class `Name`, and `functions` holds the order for
// the file's top-level functions. A single Ruby file may define several
// classes whose members share names (e.g. `casted.rb`'s `Casted` and `Quoted`
// both define `value_for_database` / `value_before_type_cast` in OPPOSITE
// order); a flat per-file list collapsed them and forced one order on both.
// Keying per class lets each express its own Rails order.
interface FileOrder {
  classes: Record<string, string[]>;
  functions: string[];
  // Top-level declaration order: the Ruby file's classes in source order, by
  // the name their TS port carries (the fqn's last segment). `classes` orders
  // the MEMBERS inside one class; this orders the classes against each other,
  // which a file holding several Rails classes (`nodes/window.rb` declares
  // Window, NamedWindow, Rows, Range, CurrentRow, Preceding, Following) can
  // otherwise get wrong while staying green.
  declarations: string[];
}
interface Manifest {
  files: Record<string, FileOrder>;
}
const manifest: Manifest = { files: {} };

// Universal Object methods that api-compare's SKIP set drops (they don't count
// toward method-existence coverage — every object inherits them). But when a
// Rails class *overrides* one it is a real definition with a real source
// POSITION and a real TS spelling, so method-ORDER must place it. Without this,
// `rubyMethodToTs("nil?")` returns null and the rule treats the override (e.g.
// `Casted#nil?` at casted.rb:15, which sits BETWEEN value_before_type_cast and
// value_for_database) as an unmapped TS-only helper and shoves it past the
// mapped block — actively degrading fidelity. Map the common overridables to
// the candidates rubyMethodToTs would produce if they weren't skipped.
const ORDER_ONLY_CANDIDATES: Record<string, string[]> = {
  "nil?": ["isNil", "nil"],
  hash: ["hash"],
  "eql?": ["isEql", "eql"],
  // Ruby OPERATORS (`[]`, `==`, `<=>`, …) are NOT resolved here: their TS
  // spelling is class-specific (`[]`→`get` in `Arel::Table` but `getAttribute`
  // in `ActiveModel::AttributeSet`), so they resolve PER-CLASS via
  // `operatorSpelling` (operator-order-spelling.ts) instead of a name-only map.
};

// Append TS candidate names for a Ruby method onto `list`, deduping against
// `seen`. Emits ALL candidates from rubyMethodToTs, not just the first. Some
// Ruby predicates camelize to multiple acceptable TS names (e.g. `empty?` →
// `["isEmpty", "empty"]`, `has_attribute?` → `["hasAttribute",
// "isHasAttribute"]`). Recording only the first means a TS port that chose the
// alternate spelling becomes "unmapped" and skips ordering. The rule filters
// each container's expected names to those actually present, so emitting both
// is a safe no-op for whichever spelling wasn't used.
// `isStatic` records whether the Ruby method was a CLASS method, emitted as a
// `static ` prefix on the manifest entry. Without it, a Ruby class that defines
// both `def foo` and `def self.foo` — or a TS class that adds an instance member
// alongside a real Rails class method — collapses to ONE expected slot, and the
// rule moves whichever member it happens to match. `Arel::Table` is the live
// case: `engine` exists only as a class-level `attr_accessor` (table.rb:9), but
// trails also has an invented instance `get engine()`; a bare `engine` entry let
// that invention be repositioned against the class accessor's slot. Entries in
// the `functions` bucket stay bare — top-level functions have no staticness.
// `operatorCandidates` (when supplied by a caller that knows the container's
// Ruby fqn) resolves a class-specific operator spelling; it takes lowest
// precedence so a real `rubyMethodToTs` mapping always wins.
const pushMethod = (
  list: string[],
  seen: Set<string>,
  name: string,
  isStatic: boolean,
  operatorCandidates?: string[],
) => {
  const candidates = rubyMethodToTs(name) ?? ORDER_ONLY_CANDIDATES[name] ?? operatorCandidates;
  if (!candidates || candidates.length === 0) return;
  for (const ts of candidates) {
    const entry = isStatic ? `static ${ts}` : ts;
    if (seen.has(entry)) continue;
    seen.add(entry);
    list.push(entry);
  }
};

// A TS container: `{ file, key }` where `key` is a class name or the sentinel
// `FUNCTIONS_KEY` for the file's top-level functions. Ruby methods are bucketed
// per (rubyFile, container) so each class keeps its own dedup scope.
const FUNCTIONS_KEY = Symbol("functions");
interface Bucket {
  names: string[];
  seen: Set<string>;
}

// Reviewed `<pkg>/<file>::<Segment>` rows for collisions resolveLastSegmentCollision
// cannot decide; without a row such a collision fails the build below.
const EXPECTED_UNRESOLVED_COLLISIONS: string[] = [];

const unresolvedCollisions: string[] = [];
const usedExpectedCollisions = new Set<string>();

const resolveCollision = (pkg: string, collKey: string, fqns: Set<string>): string | undefined => {
  const winner = resolveLastSegmentCollision(fqns);
  if (winner) return winner;
  const [file, seg] = collKey.split("\0");
  const row = `${pkg}/${file}::${seg}`;
  if (EXPECTED_UNRESOLVED_COLLISIONS.includes(row)) {
    usedExpectedCollisions.add(row);
    return undefined;
  }
  unresolvedCollisions.push(`${row} shared by ${[...fqns].join(", ")}`);
  return undefined;
};

for (const [pkg, rubyPkg] of Object.entries<RubyPackage>(railsApi.packages)) {
  const pkgDir = PACKAGE_DIRS[pkg];
  if (!pkgDir) continue;

  // (rubyFile) → (containerKey) → Bucket. Map preserves insertion order — we
  // walk Rails entities in extraction order, then each entity's instance
  // methods + class methods in Rails source order. Method-level `file` is
  // preferred over the entity's `file` so methods reopen-defined in sibling
  // files land in the correct bucket (Rails reopens `class Foo` across files).
  const byFile = new Map<string, Map<string | symbol, Bucket>>();

  const bucketFor = (rubyFile: string, key: string | symbol): Bucket => {
    let byKey = byFile.get(rubyFile);
    if (!byKey) {
      byKey = new Map();
      byFile.set(rubyFile, byKey);
    }
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { names: [], seen: new Set() };
      byKey.set(key, bucket);
    }
    return bucket;
  };

  // Buckets are keyed by FQN, but the manifest the rule reads is keyed by the TS
  // class NAME — the fqn's last segment. Track the fqns competing for each
  // (bucketFile, last-segment) so the collapse below can pick a winner; see
  // resolveLastSegmentCollision.
  const classFqnsByKey = new Map<string, Set<string>>();
  const noteClass = (bucketFile: string, className: string, fqn: string) => {
    const collKey = `${bucketFile}\0${className}`;
    let fqns = classFqnsByKey.get(collKey);
    if (!fqns) classFqnsByKey.set(collKey, (fqns = new Set()));
    fqns.add(fqn);
  };

  // (rubyFile) → class fqns in Rails declaration order.
  const declarationsByFile = new Map<string, string[]>();
  const declarationsFor = (rubyFile: string): string[] => {
    let list = declarationsByFile.get(rubyFile);
    if (!list) declarationsByFile.set(rubyFile, (list = []));
    return list;
  };

  // fqn → class host, so a `Foo::InstanceMethods` / `Foo::ClassMethods` mixin
  // module can find the CLASS it is mixed into (see visitModules).
  const classByFqn = new Map<string, RubyEntity>();
  for (const host of Object.values<RubyEntity>(rubyPkg.classes ?? {})) {
    classByFqn.set(host.fqn, host);
  }

  // Ruby classes port to TS classes: instance + static members live in the
  // class container keyed by the fqn's last segment (`Arel::Nodes::Casted` →
  // `Casted`). Ruby modules port to top-level `this`-typed / mixin functions
  // (CLAUDE.md "Module mixins"), so their methods go in the functions bucket.
  const visitClasses = (entities: Record<string, RubyEntity>) => {
    for (const host of Object.values(entities)) {
      if (!host.file) continue;
      const className = host.fqn.split("::").pop() ?? host.fqn;
      // Declaration order comes from the ENTITY's own file and the order the
      // Ruby extractor encountered it in (`@classes` is a Hash keyed by fqn,
      // filled as the walker descends each file), which is Rails source order
      // within a file. Methods are bucketed by their own `file` because Rails
      // reopens classes across files; a declaration has exactly one site.
      // Noting the class HERE and not only per-method is what lets a
      // last-segment collision involving a method-less class be seen at all.
      noteClass(host.file, className, host.fqn);
      declarationsFor(host.file).push(host.fqn);
      // Order by source line rather than appending classMethods after
      // instanceMethods — see mergeBySourceLine for why. Tag each method with
      // `isStatic` BEFORE merging so the interleaved order keeps the class-vs-
      // instance distinction the manifest needs (`static name` vs `name`).
      // Bucketing by `file` happens below, after ordering; the merge is a total
      // order on `line`, so each file's slice is still ascending.
      for (const m of mergeBySourceLine(
        tagStatic(host.instanceMethods, false),
        tagStatic(host.classMethods, true),
      )) {
        const file = m.file ?? host.file;
        noteClass(file, className, host.fqn);
        const b = bucketFor(file, host.fqn);
        // Operators are instance-only ports; resolve the class-specific spelling.
        const opCandidates = m.isStatic ? undefined : operatorSpelling(host.fqn, m.name);
        pushMethod(b.names, b.seen, m.name, m.isStatic, opCandidates);
      }
    }
  };
  const visitModules = (entities: Record<string, RubyEntity>) => {
    for (const host of Object.values(entities)) {
      if (!host.file) continue;
      // A `Foo::InstanceMethods` / `Foo::ClassMethods` module whose PARENT is a
      // CLASS is a mixin flattened onto that class's TS port (Rails
      // `include`/`extend`), NOT a standalone module ported to top-level
      // functions. Its order lands on the class container so it is enforced
      // rather than dropped into `functions` (which no class body reads) — see
      // resolveMixinParent. The methods append AFTER the class's own members
      // (the class defines its body, then includes the mixin), and
      // `ClassMethods` entries become `static` since `extend` promotes them to
      // singleton methods.
      const mixin = resolveMixinParent(host.fqn, (fqn) => classByFqn.has(fqn));
      if (mixin) {
        for (const m of mergeBySourceLine(
          tagStatic(host.instanceMethods, false),
          tagStatic(host.classMethods, true),
        )) {
          const file = m.file ?? host.file;
          noteClass(file, mixin.className, mixin.parentFqn);
          const b = bucketFor(file, mixin.parentFqn);
          const isStatic = mixin.extendsSingleton || m.isStatic;
          const opCandidates = isStatic ? undefined : operatorSpelling(mixin.parentFqn, m.name);
          pushMethod(b.names, b.seen, m.name, isStatic, opCandidates);
        }
        continue;
      }
      // Standalone modules port to top-level functions, which have no
      // staticness — every entry stays bare regardless of whether Ruby declared
      // it on the module or its singleton. Operator SPELLINGS still apply
      // (`ActiveRecord::Core#==` → core.ts `equals`); only staticness is lost.
      for (const m of mergeBySourceLine(
        tagStatic(host.instanceMethods, false),
        tagStatic(host.classMethods, true),
      )) {
        const b = bucketFor(m.file ?? host.file, FUNCTIONS_KEY);
        pushMethod(b.names, b.seen, m.name, false, operatorSpelling(host.fqn, m.name));
      }
    }
  };
  visitClasses(rubyPkg.classes ?? {});
  visitModules(rubyPkg.modules ?? {});

  // (bucketFile\0className) → the one fqn that owns that manifest key.
  const winnerByKey = new Map<string, string>();
  for (const [collKey, fqns] of classFqnsByKey) {
    const winner = resolveCollision(pkg, collKey, fqns);
    if (winner) winnerByKey.set(collKey, winner);
  }
  const owns = (rubyFile: string, fqn: string): boolean =>
    winnerByKey.get(`${rubyFile}\0${lastSegment(fqn)}`) === fqn;

  const orderFor = (rubyFile: string): FileOrder => {
    const tsRel = path.posix.join(pkgDir, rubyFileToTs(rubyFile, pkg).split(path.sep).join("/"));
    let order = manifest.files[tsRel];
    if (!order) {
      order = { classes: {}, functions: [], declarations: [] };
      manifest.files[tsRel] = order;
    }
    return order;
  };

  for (const [rubyFile, fqns] of declarationsByFile) {
    const order = orderFor(rubyFile);
    const have = new Set(order.declarations);
    for (const fqn of fqns) {
      if (!owns(rubyFile, fqn)) continue;
      const n = lastSegment(fqn);
      if (have.has(n)) continue;
      have.add(n);
      order.declarations.push(n);
    }
  }

  for (const [rubyFile, byKey] of byFile) {
    const order = orderFor(rubyFile);
    for (const [key, bucket] of byKey) {
      // A losing fqn is dropped rather than blended into the winner's order.
      if (key !== FUNCTIONS_KEY && !owns(rubyFile, key as string)) continue;
      // Multiple Ruby files may map to the same TS file (rare); append novel
      // names in encounter order, existing order wins for dupes.
      const target =
        key === FUNCTIONS_KEY
          ? order.functions
          : (order.classes[lastSegment(key as string)] ??= []);
      const have = new Set(target);
      for (const n of bucket.names) if (!have.has(n)) target.push(n);
    }
  }
}

// Drop empty containers and files with no order data at all, then sort keys
// for a stable, diff-friendly manifest.
const sortedFiles: Record<string, FileOrder> = {};
for (const k of Object.keys(manifest.files).sort()) {
  const order = manifest.files[k];
  const classes: Record<string, string[]> = {};
  for (const cn of Object.keys(order.classes).sort()) {
    if (order.classes[cn].length > 0) classes[cn] = order.classes[cn];
  }
  const hasFns = order.functions.length > 0;
  // A single declaration orders nothing.
  const declarations = order.declarations.length > 1 ? order.declarations : [];
  if (Object.keys(classes).length === 0 && !hasFns && declarations.length === 0) continue;
  const out: FileOrder = { classes, functions: order.functions, declarations };
  sortedFiles[k] = out;
}
const final: Manifest = { files: sortedFiles };

writeJsonManifest(OUT, final);
const fileCount = Object.keys(final.files).length;
const nameCount = Object.values(final.files).reduce(
  (n, o) =>
    n +
    o.functions.length +
    o.declarations.length +
    Object.values(o.classes).reduce((m, a) => m + a.length, 0),
  0,
);
console.log(`Wrote ${OUT} — ${fileCount} files (${nameCount} ordered names)`);

// A manifest with no entries reads as unavailable to eslint.config.mjs, which
// then leaves the rule unregistered — silently, and green. Reaching here means
// rails-api.json WAS present, so an empty result is a broken extract, not the
// documented `--allow-missing` path.
if (fileCount === 0) {
  throw new Error(
    `[build-rails-file-structure-manifest] built manifest has no entries, so ` +
      `blazetrails/rails-file-structure-method-order would not be registered. ` +
      `Check that ${RAILS_API_PATH} holds a real extract.`,
  );
}

// Fail after the manifest is written, so the emitted order stays usable and the
// failure is purely the signal.
if (unresolvedCollisions.length > 0) {
  throw new Error(
    `[build-rails-file-structure-manifest] ${unresolvedCollisions.length} unresolvable ` +
      `last-segment collision(s): ${unresolvedCollisions.join("; ")} — rename the TS ` +
      `classes or split the Ruby file so each resolves independently, or add the ` +
      `\`<pkg>/<file>::<Segment>\` row to EXPECTED_UNRESOLVED_COLLISIONS in this script.`,
  );
}
const staleExpectedCollisions = EXPECTED_UNRESOLVED_COLLISIONS.filter(
  (row) => !usedExpectedCollisions.has(row),
);
if (staleExpectedCollisions.length > 0) {
  throw new Error(
    `[build-rails-file-structure-manifest] stale EXPECTED_UNRESOLVED_COLLISIONS ` +
      `entr${staleExpectedCollisions.length === 1 ? "y" : "ies"}: ` +
      `${staleExpectedCollisions.join(", ")} — the collision is gone; drop the row.`,
  );
}

// Every package has been visited, so an operator entry that never resolved names a
// class/operator the Ruby extract does not have. Like an unresolvable last-segment
// collision, a dead entry enforces nothing and reports nothing, which is
// how the `ActiveModel::AttributeSet::LazyAttributeHash` key survived. Fail after
// the manifest is written, so the emitted order is still correct/usable and the
// failure is purely the signal.
const deadOperatorEntries = unusedOperatorSpellings();
if (deadOperatorEntries.length > 0) {
  throw new Error(
    `[build-rails-file-structure-manifest] ${deadOperatorEntries.length} dead ` +
      `OPERATOR_SPELLING_BY_FQN entr${deadOperatorEntries.length === 1 ? "y" : "ies"} ` +
      `(fqn/operator absent from the Ruby API): ${deadOperatorEntries.join(", ")} — ` +
      `fix the fqn or drop the entry (scripts/api-compare/operator-order-spelling.ts).`,
  );
}
