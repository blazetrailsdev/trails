/**
 * Builds eslint/rails-private-methods.json from
 * scripts/api-compare/output/rails-api.json.
 *
 * The manifest maps each TS source path (relative to repo root) to the
 * set of method/function names whose Rails counterpart is *exclusively*
 * private/protected on every class/module hosted in the same Ruby file.
 * The `blazetrails/rails-private-jsdoc` ESLint rule consumes it.
 *
 * Run after `pnpm api:compare` (or `ruby scripts/api-compare/extract-ruby-api.rb`):
 *   pnpm rails-privates:manifest
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { rubyMethodToTs, rubyFileToTs } from "./api-compare/conventions.js";

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

if (!fs.existsSync(RAILS_API_PATH)) {
  // No Rails source extracted yet — write an empty manifest so the
  // ESLint rule no-ops gracefully. CI runs `bash fetch-rails.sh` +
  // `ruby extract-ruby-api.rb` upstream of lint to produce real data.
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ files: {}, packageGlobals: {} }, null, 2) + "\n");
  console.warn(
    `[build-rails-privates-manifest] ${RAILS_API_PATH} missing; wrote empty manifest. ` +
      `Run \`pnpm api:compare\` to regenerate with real data.`,
  );
  process.exit(0);
}

const railsApi = JSON.parse(fs.readFileSync(RAILS_API_PATH, "utf8"));

interface Manifest {
  files: Record<string, string[]>;
  // Per-package set of names that are private/protected on every Rails
  // host that defines them and *never* public anywhere in the package.
  // Catches thin TS wrappers (e.g. `Base.computeType` in base.ts that
  // delegates to `inheritance.ts#computeType`) whose host file isn't
  // the Ruby file the helper lives in.
  packageGlobals: Record<string, string[]>;
}
const manifest: Manifest = { files: {}, packageGlobals: {} };

for (const [pkg, rubyPkg] of Object.entries<any>(railsApi.packages)) {
  const pkgDir = PACKAGE_DIRS[pkg];
  if (!pkgDir) continue;

  // Per-package: name → has-public-anywhere-in-package?
  const pkgPublic = new Set<string>();
  const pkgPrivate = new Set<string>();

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
    if (isPriv) pkgPrivate.add(name);
    else pkgPublic.add(name);
  };
  const collect = (entities: Record<string, any>) => {
    for (const ent of Object.values(entities)) {
      if (!ent.file) continue;
      for (const m of ent.instanceMethods ?? []) note(ent.file, m.name, m.visibility);
      for (const m of ent.classMethods ?? []) note(ent.file, m.name, m.visibility);
    }
  };
  collect(rubyPkg.classes ?? {});
  collect(rubyPkg.modules ?? {});

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

  // Package globals: ruby names that are private *somewhere* in the
  // package and *never* public anywhere in the package.
  const globalRuby = [...pkgPrivate].filter((n) => !pkgPublic.has(n));
  const globalTs = new Set<string>();
  for (const ruby of globalRuby) {
    for (const c of rubyMethodToTs(ruby) ?? []) globalTs.add(c);
  }
  // Drop any TS name that also exists as a public Rails name in the
  // package (collision via predicate->isFoo etc).
  const publicTs = new Set<string>();
  for (const ruby of pkgPublic) {
    for (const c of rubyMethodToTs(ruby) ?? []) publicTs.add(c);
  }
  for (const n of publicTs) globalTs.delete(n);
  if (globalTs.size > 0) {
    manifest.packageGlobals[pkg] = [...globalTs].sort();
  }
}

const sortedFiles: Record<string, string[]> = {};
for (const k of Object.keys(manifest.files).sort()) sortedFiles[k] = manifest.files[k];
const sortedGlobals: Record<string, string[]> = {};
for (const k of Object.keys(manifest.packageGlobals).sort()) {
  sortedGlobals[k] = manifest.packageGlobals[k];
}
const final: Manifest = { files: sortedFiles, packageGlobals: sortedGlobals };

fs.writeFileSync(OUT, JSON.stringify(final, null, 2) + "\n");
const fileCount = Object.keys(final.files).length;
const fileNames = Object.values(final.files).reduce((n, a) => n + a.length, 0);
const globalNames = Object.values(final.packageGlobals).reduce((n, a) => n + a.length, 0);
console.log(
  `Wrote ${OUT} — ${fileCount} files (${fileNames} names) + ` +
    `${Object.keys(final.packageGlobals).length} package-global sets (${globalNames} names)`,
);
