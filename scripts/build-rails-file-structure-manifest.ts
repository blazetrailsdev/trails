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
 * Run after `pnpm api:compare` — invoked from run.sh alongside the
 * privates manifest builder.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { rubyMethodToTs, rubyFileToTs } from "./api-compare/conventions.js";
import { writeJsonManifest } from "./api-compare/write-json-manifest.js";

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

if (!fs.existsSync(RAILS_API_PATH)) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  writeJsonManifest(OUT, { files: {} });
  console.warn(
    `[build-rails-file-structure-manifest] ${RAILS_API_PATH} missing; wrote empty manifest. ` +
      `Run \`pnpm api:compare\` to regenerate with real data.`,
  );
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
  // Ruby OPERATORS are deliberately NOT mapped. Unlike the three universal
  // predicates above — each with one canonical trails spelling — operator
  // ports are class-specific and ambiguous, so a name-only global map is unsafe:
  // `[]` ports to `get` in `Arel::Table` / `ActiveModel::Errors` /
  // `LazyAttributeHash` but to `getAttribute` in `ActiveModel::AttributeSet`,
  // where `get` is instead a non-Rails Map-compat helper (attribute_set.rb:16
  // `[]` → `getAttribute` at attribute-set.ts:298; the `get` at :63 has no Rails
  // counterpart). Mapping `[]`→`get` would promote that invention into Rails'
  // `[]` slot. `==` / `<=>` similarly vary (`equals` / `isEqualTo` / `compare`).
  // Such operator ports — rare — sort after the mapped block; if one becomes a
  // real fidelity gap, the RAILS_STRUCTURE_REPORT class-level surface flags it.
};

// Append TS candidate names for a Ruby method onto `list`, deduping against
// `seen`. Emits ALL candidates from rubyMethodToTs, not just the first. Some
// Ruby predicates camelize to multiple acceptable TS names (e.g. `empty?` →
// `["isEmpty", "empty"]`, `has_attribute?` → `["hasAttribute",
// "isHasAttribute"]`). Recording only the first means a TS port that chose the
// alternate spelling becomes "unmapped" and skips ordering. The rule filters
// each container's expected names to those actually present, so emitting both
// is a safe no-op for whichever spelling wasn't used.
const pushMethod = (list: string[], seen: Set<string>, name: string) => {
  const candidates = rubyMethodToTs(name) ?? ORDER_ONLY_CANDIDATES[name];
  if (!candidates || candidates.length === 0) return;
  for (const ts of candidates) {
    if (seen.has(ts)) continue;
    seen.add(ts);
    list.push(ts);
  }
};

// An entity's methods in Rails SOURCE order, rather than instanceMethods then
// classMethods. A `class << self` block at the TOP of a Rails file
// (active_model/attribute.rb:7-24 defines from_database/from_user/… before
// `initialize` at :33) would otherwise be demanded LAST, inverting Rails order.
// Methods without a `line` (a rails-api.json predating the field) sort last,
// reproducing the historical instance-then-class append.
const orderBySourceLine = (host: RubyEntity): RubyMethod[] =>
  [...(host.instanceMethods ?? []), ...(host.classMethods ?? [])]
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const al = a.m.line ?? Infinity;
      const bl = b.m.line ?? Infinity;
      return al === bl ? a.i - b.i : al - bl;
    })
    .map(({ m }) => m);

// A TS container: `{ file, key }` where `key` is a class name or the sentinel
// `FUNCTIONS_KEY` for the file's top-level functions. Ruby methods are bucketed
// per (rubyFile, container) so each class keeps its own dedup scope.
const FUNCTIONS_KEY = Symbol("functions");
interface Bucket {
  names: string[];
  seen: Set<string>;
}

for (const [pkg, rubyPkg] of Object.entries<any>(railsApi.packages)) {
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

  // The bucket key is the fqn's last segment, so two class entities in one file
  // whose last segments collide across namespaces (e.g. `Foo::Builder` and
  // `Bar::Builder`) would silently merge into one blended order. Track fqns per
  // (bucketFile, last-segment); a colliding bucket is DROPPED (not emitted) and
  // warned — enforcing a blended order would be worse than no order at all.
  // (Repo-wide this is currently vanishingly rare.)
  const classFqnsByKey = new Map<string, Set<string>>();
  const noteClass = (bucketFile: string, className: string, fqn: string) => {
    const collKey = `${bucketFile}\0${className}`;
    let fqns = classFqnsByKey.get(collKey);
    if (!fqns) classFqnsByKey.set(collKey, (fqns = new Set()));
    fqns.add(fqn);
  };

  // Ruby classes port to TS classes: instance + static members live in the
  // class container keyed by the fqn's last segment (`Arel::Nodes::Casted` →
  // `Casted`). Ruby modules port to top-level `this`-typed / mixin functions
  // (CLAUDE.md "Module mixins"), so their methods go in the functions bucket.
  const visitClasses = (entities: Record<string, RubyEntity>) => {
    for (const host of Object.values(entities)) {
      if (!host.file) continue;
      const className = host.fqn.split("::").pop() ?? host.fqn;
      for (const m of orderBySourceLine(host)) {
        const file = m.file ?? host.file;
        noteClass(file, className, host.fqn);
        const b = bucketFor(file, className);
        pushMethod(b.names, b.seen, m.name);
      }
    }
  };
  const visitModules = (entities: Record<string, RubyEntity>) => {
    for (const host of Object.values(entities)) {
      if (!host.file) continue;
      for (const m of orderBySourceLine(host)) {
        const b = bucketFor(m.file ?? host.file, FUNCTIONS_KEY);
        pushMethod(b.names, b.seen, m.name);
      }
    }
  };
  visitClasses(rubyPkg.classes ?? {});
  visitModules(rubyPkg.modules ?? {});

  const collided = new Set<string>();
  for (const [collKey, fqns] of classFqnsByKey) {
    if (fqns.size > 1) {
      collided.add(collKey);
      const [file, seg] = collKey.split("\0");
      console.warn(
        `[build-rails-file-structure-manifest] last-segment collision in ${pkg}/${file}: ` +
          `\`${seg}\` shared by ${[...fqns].join(", ")} — bucket DROPPED (no order enforced). ` +
          `Rename the TS classes or split the file so each resolves independently.`,
      );
    }
  }

  for (const [rubyFile, byKey] of byFile) {
    const tsRel = path.posix.join(pkgDir, rubyFileToTs(rubyFile, pkg).split(path.sep).join("/"));
    let order = manifest.files[tsRel];
    if (!order) {
      order = { classes: {}, functions: [] };
      manifest.files[tsRel] = order;
    }
    for (const [key, bucket] of byKey) {
      // A colliding class bucket is dropped so the lint step never enforces a
      // blended order (see the warning above).
      if (key !== FUNCTIONS_KEY && collided.has(`${rubyFile}\0${key as string}`)) continue;
      // Multiple Ruby files may map to the same TS file (rare); append novel
      // names in encounter order, existing order wins for dupes.
      const target =
        key === FUNCTIONS_KEY ? order.functions : (order.classes[key as string] ??= []);
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
  if (Object.keys(classes).length === 0 && !hasFns) continue;
  const out: FileOrder = { classes, functions: order.functions };
  sortedFiles[k] = out;
}
const final: Manifest = { files: sortedFiles };

writeJsonManifest(OUT, final);
const fileCount = Object.keys(final.files).length;
const nameCount = Object.values(final.files).reduce(
  (n, o) => n + o.functions.length + Object.values(o.classes).reduce((m, a) => m + a.length, 0),
  0,
);
console.log(`Wrote ${OUT} — ${fileCount} files (${nameCount} ordered names)`);
