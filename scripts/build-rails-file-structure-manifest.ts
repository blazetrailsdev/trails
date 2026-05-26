/**
 * Builds the manifest(s) consumed by the `rails-file-structure-*`
 * ESLint rule family (docs/infrastructure/rails-file-structure-mirror-plan.md) from
 * scripts/api-compare/output/rails-api.json.
 *
 * Currently emits:
 *   eslint/rails-file-structure-method-order.json — maps each TS source
 *     path (relative to repo root) to an ordered list of TS member
 *     names, derived from the Rails source file's method order. Read by
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
  fs.writeFileSync(OUT, JSON.stringify({ files: {} }, null, 2) + "\n");
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
}
interface RubyEntity {
  fqn: string;
  file: string;
  instanceMethods?: RubyMethod[];
  classMethods?: RubyMethod[];
}

const railsApi = JSON.parse(fs.readFileSync(RAILS_API_PATH, "utf8"));

interface Manifest {
  files: Record<string, string[]>;
}
const manifest: Manifest = { files: {} };

for (const [pkg, rubyPkg] of Object.entries<any>(railsApi.packages)) {
  const pkgDir = PACKAGE_DIRS[pkg];
  if (!pkgDir) continue;

  // rubyFile → ordered list of TS candidate names (first candidate wins).
  // Map preserves insertion order — we walk Rails entities in extraction
  // order, then walk each entity's instance methods + class methods in
  // Rails source order. Method-level `file` is preferred over the
  // entity's `file` so methods reopen-defined in sibling files land in
  // the correct bucket (Rails does this with `class Foo` blocks reopened
  // across files in the same namespace).
  const byFile = new Map<string, string[]>();
  const seenPerFile = new Map<string, Set<string>>();

  // Emit ALL candidates from rubyMethodToTs, not just the first. Some
  // Ruby predicates camelize to multiple acceptable TS names (e.g.
  // `empty?` → `["isEmpty", "empty"]`, `has_attribute?` → `["hasAttribute",
  // "isHasAttribute"]`). Recording only the first means a TS port that
  // chose the alternate spelling becomes "unmapped" and skips ordering.
  // The rule's `for (const name of expectedOrder)` loop naturally
  // handles alternates: candidates that aren't present in the container
  // are no-ops, so emitting both is safe.
  const push = (rubyFile: string, name: string) => {
    const candidates = rubyMethodToTs(name);
    if (!candidates || candidates.length === 0) return;
    let seen = seenPerFile.get(rubyFile);
    if (!seen) {
      seen = new Set();
      seenPerFile.set(rubyFile, seen);
    }
    let list = byFile.get(rubyFile);
    if (!list) {
      list = [];
      byFile.set(rubyFile, list);
    }
    for (const ts of candidates) {
      if (seen.has(ts)) continue;
      seen.add(ts);
      list.push(ts);
    }
  };

  const visit = (entities: Record<string, RubyEntity>) => {
    for (const host of Object.values(entities)) {
      if (!host.file) continue;
      for (const m of host.instanceMethods ?? []) {
        push(m.file ?? host.file, m.name);
      }
      for (const m of host.classMethods ?? []) {
        push(m.file ?? host.file, m.name);
      }
    }
  };
  visit(rubyPkg.classes ?? {});
  visit(rubyPkg.modules ?? {});

  for (const [rubyFile, names] of byFile) {
    const tsRel = path.posix.join(pkgDir, rubyFileToTs(rubyFile, pkg).split(path.sep).join("/"));
    const existing = manifest.files[tsRel];
    if (existing) {
      // Multiple Ruby files may map to the same TS file (rare). Append
      // novel names in encounter order; existing order wins for dupes.
      const have = new Set(existing);
      for (const n of names) if (!have.has(n)) existing.push(n);
    } else {
      manifest.files[tsRel] = [...names];
    }
  }
}

const sortedFiles: Record<string, string[]> = {};
for (const k of Object.keys(manifest.files).sort()) sortedFiles[k] = manifest.files[k];
const final: Manifest = { files: sortedFiles };

fs.writeFileSync(OUT, JSON.stringify(final, null, 2) + "\n");
const fileCount = Object.keys(final.files).length;
const nameCount = Object.values(final.files).reduce((n, a) => n + a.length, 0);
console.log(`Wrote ${OUT} — ${fileCount} files (${nameCount} ordered names)`);
