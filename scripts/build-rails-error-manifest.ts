/**
 * Builds eslint/rails-error-classes.json by regex-scanning the vendored Rails
 * source for error declarations (Rails uses single-line `class X < Y`
 * headers). An error class is every `class X < Y` in a package's `errors.rb`
 * plus any under `lib/**` whose parent is a known Ruby error base or an
 * already-recognised error (grown to a fixpoint, so `RecordInvalid <
 * ActiveRecordError` in validations.rb is captured). Output:
 * `{ generatedAt, packages: { activerecord: [{ name, parent, rubyFile }], … } }`
 * (rubyFile POSIX-relative to the package's `lib/`).
 *
 * It also records, under `bareRaises`, every class Rails raises with no message
 * argument (`raise Klass` / `raise Klass unless …` / `raise Klass.new`), keyed
 * by package, TS source file, owning class and TS method name. A class a method
 * raises both ways is left out. The rule's `inventedMessage` arm reads it.
 *
 *   pnpm tsx scripts/build-rails-error-manifest.ts
 */
import { readdir, readFile } from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { writeJsonManifest } from "@blazetrails/parity/write-json-manifest";
import { resolveSourcePath } from "../vendor/sources.js";
import { PACKAGE_DIR_OVERRIDES, PACKAGE_SRC_SUBDIR } from "./api-compare/config.js";
import { rubyFileToTs } from "./parity/conventions.js";
import {
  classLevelBareRaises,
  errinfoClasses,
  foldBareRaises,
  scanRaises,
  type OwnedBareRaises,
} from "./parity/rails-bare-raises.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Every enrolled package is scanned for a complete error inventory. `arel`
// has no gem of its own — Rails vendors it under `activerecord/lib/arel` —
// so it shares activerecord's lib tree and is separated by `PKG_NS`.
const PACKAGES = ["activerecord", "activemodel", "activesupport", "arel"] as const;
type Pkg = (typeof PACKAGES)[number];

// Each package's own Ruby lib namespace. The closure runs over the whole lib
// tree, but only classes under this prefix are emitted — Arel is vendored
// under activerecord/lib/arel yet is a separate package.
const PKG_NS: Record<Pkg, string> = {
  activerecord: "active_record/",
  activemodel: "active_model/",
  activesupport: "active_support/",
  arel: "arel/",
};

// Arel has no gem of its own — Rails vendors it under
// `activerecord/lib/arel`, so it scans activerecord's lib and is separated
// from activerecord by `PKG_NS` alone.
const PKG_GEM: Record<Pkg, string> = {
  activerecord: "activerecord",
  activemodel: "activemodel",
  activesupport: "activesupport",
  arel: "activerecord",
};

// Ruby exception bases that root our error hierarchy. A `class X < Base`
// where Base is one of these is treated as an error class outright. These
// also serve as "root extends an Error-equivalent" parents for the rule.
const ROOT_BASES = new Set(
  (
    "StandardError RuntimeError Exception ScriptError ArgumentError NameError NoMethodError " +
    "NotImplementedError TypeError RangeError IndexError KeyError IOError StopIteration " +
    "FrozenError NoMatchingPatternError"
  ).split(" "),
);

const OUT = path.join(ROOT, "eslint/rails-error-classes.json");

// `class Foo < Bar` / `class Foo < ::Bar::Baz`. Captures name and the last
// segment of the (possibly qualified) parent. Trailing `; end` / comments
// after the header are ignored by the line-anchored match.
const CLASS_RE = /^\s*class\s+([A-Z]\w*)\s*<\s*([:A-Za-z0-9_]+)/;

interface ErrorClass {
  name: string;
  parent: string;
  rubyFile: string;
}

const BARE_RAISE_LIBS: Record<string, [source: string, lib: string, ns: string]> = {
  ...Object.fromEntries(
    PACKAGES.map((pkg) => [pkg, ["rails", `${PKG_GEM[pkg]}/lib`, PKG_NS[pkg]]]),
  ),
  actionpack: ["rails", "actionpack/lib", ""],
  actionview: ["rails", "actionview/lib", "action_view/"],
  rack: ["rack", "lib", "rack/"],
  trailties: ["rails", "railties/lib", "rails/"],
  activejob: ["rails", "activejob/lib", "active_job/"],
  bcrypt: ["bcrypt-ruby", "lib", "bcrypt/"],
  date: ["date", "lib", ""],
  "did-you-mean": ["did_you_mean", "lib", "did_you_mean/"],
  globalid: ["globalid", "lib", "global_id/"],
  i18n: ["i18n", "lib", "i18n/"],
  msgpack: ["msgpack", "lib", "msgpack/"],
  "rack-session": ["rack-session", "lib", "rack/session/"],
  "rack-test": ["rack-test", "lib", "rack/test/"],
  mysql2: ["mysql2", "lib", "mysql2/"],
  pg: ["pg", "lib", "pg/"],
  sqlite3: ["sqlite3", "lib", "sqlite3/"],
  thor: ["thor", "lib", "thor/"],
};

async function scanPackageBareRaises(
  pkg: string,
  errinfo: Record<string, string[]>,
): Promise<Record<string, OwnedBareRaises>> {
  const [source, lib, ns] = BARE_RAISE_LIBS[pkg];
  const libDir = resolveSourcePath(source, lib);
  const entry = `${ns.slice(0, -1)}.rb`;
  const subdir = PACKAGE_SRC_SUBDIR[pkg] === undefined ? "" : `${PACKAGE_SRC_SUBDIR[pkg]}/`;
  const dir = PACKAGE_DIR_OVERRIDES[pkg] ?? pkg;
  const rels = new Map<string, string>();
  for (const file of (await walkRubyFiles(libDir)).sort()) {
    const rel = path.relative(libDir, file).split(path.sep).join("/");
    if (rel === entry) rels.set(file, path.posix.basename(rel));
    else if (rel.startsWith(ns) && !rel.includes("generators/"))
      rels.set(file, rel.slice(ns.length));
  }
  const out: Record<string, OwnedBareRaises> = {};
  errinfo[dir] ??= [];
  for (const [file, rows] of Object.entries(await scanRaises([...rels.keys()]))) {
    const classLevel = classLevelBareRaises(rows);
    if (classLevel.length > 0) {
      throw new Error(`${file}: bare raise of ${classLevel.join(", ")} outside any method`);
    }
    errinfo[dir] = [...new Set([...errinfo[dir], ...errinfoClasses(rows)])].sort();
    const scanned = foldBareRaises(rows);
    if (Object.keys(scanned).length === 0) continue;
    out[subdir + rubyFileToTs(rels.get(file)!, pkg)] = scanned;
  }
  return out;
}

async function walkRubyFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkRubyFiles(full)));
    else if (e.isFile() && e.name.endsWith(".rb")) out.push(full);
  }
  return out;
}

function lastSegment(qualified: string): string {
  const parts = qualified.replace(/^::/, "").split("::");
  return parts[parts.length - 1];
}

async function scanPackage(pkg: Pkg): Promise<ErrorClass[]> {
  const libDir = resolveSourcePath("rails", `${PKG_GEM[pkg]}/lib`);
  const files = await walkRubyFiles(libDir);

  // Pass 1: collect every `class X < Y` declaration with its source file.
  interface Decl {
    name: string;
    parent: string;
    qualifiedParent: boolean;
    rubyFile: string;
    fromErrorsFile: boolean;
  }
  const decls: Decl[] = [];
  for (const file of files) {
    const rel = path.relative(libDir, file).split(path.sep).join("/");
    // Code generators subclass an external `Base` (Rails::Generators::Base)
    // whose bare leaf collides with our error `Base` — never error classes.
    if (rel.includes("generators/")) continue;
    const fromErrorsFile = path.basename(file) === "errors.rb";
    const text = await readFile(file, "utf8");
    for (const line of text.split("\n")) {
      const m = CLASS_RE.exec(line);
      if (!m) continue;
      decls.push({
        name: m[1],
        parent: lastSegment(m[2]),
        qualifiedParent: m[2].includes("::"),
        rubyFile: rel,
        fromErrorsFile,
      });
    }
  }

  const known = new Set<string>(ROOT_BASES);
  for (const d of decls) if (d.fromErrorsFile) known.add(d.name);

  // Recognised when the parent is known AND the reference is unambiguous: a
  // bare name, or a qualified built-in base (`< ::RangeError`). A qualified
  // non-root parent like `ActiveJob::Base` is external and must not propagate.
  const recognises = (d: Decl): boolean =>
    known.has(d.parent) && (!d.qualifiedParent || ROOT_BASES.has(d.parent));

  // Pass 2: grow the recognised set to a fixpoint.
  let changed = true;
  while (changed) {
    changed = false;
    for (const d of decls) {
      if (known.has(d.name)) continue;
      if (recognises(d)) {
        known.add(d.name);
        changed = true;
      }
    }
  }

  // Emit recognised classes, deduping by name and preferring the errors.rb
  // declaration when a name appears more than once.
  const byName = new Map<string, ErrorClass>();
  for (const d of decls) {
    if (!known.has(d.name)) continue;
    if (!d.rubyFile.startsWith(PKG_NS[pkg])) continue; // keep each package to its own namespace
    const existing = byName.get(d.name);
    if (existing && !d.fromErrorsFile) continue;
    byName.set(d.name, { name: d.name, parent: d.parent, rubyFile: d.rubyFile });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function main() {
  const packages: Record<string, ErrorClass[]> = {};
  for (const pkg of PACKAGES) packages[pkg] = await scanPackage(pkg);

  // `vendor/rails` is a symlink populated by `pnpm vendor:fetch`; it is absent
  // in the lint CI job, which runs this builder via `prelint`. Unlike the
  // gitignored privates manifest, ours is committed, so when no source is
  // found we must NOT overwrite it with empty data — leave the committed
  // manifest in place for the ESLint rule to consume.
  if (PACKAGES.every((p) => packages[p].length === 0)) {
    console.warn(
      "[build-rails-error-manifest] no vendored Rails source found; " +
        "preserving committed eslint/rails-error-classes.json. Run `pnpm vendor:fetch` to regenerate.",
    );
    return;
  }

  // `generatedAt` is fixed (not Date.now()) so the committed manifest is
  // reproducible and only changes when the Rails source does.
  const bareRaises: Record<string, Record<string, OwnedBareRaises>> = {};
  const errinfo: Record<string, string[]> = {};
  for (const pkg of Object.keys(BARE_RAISE_LIBS)) {
    const dir = PACKAGE_DIR_OVERRIDES[pkg] ?? pkg;
    bareRaises[dir] = { ...bareRaises[dir], ...(await scanPackageBareRaises(pkg, errinfo)) };
  }
  const manifest = { generatedAt: "vendored", packages, bareRaises, errinfo };
  writeJsonManifest(OUT, manifest);

  const counts = PACKAGES.map((p) => `${p}: ${packages[p].length}`).join(", ");
  console.log(`Wrote ${OUT} — ${counts}`);
}

void main();
