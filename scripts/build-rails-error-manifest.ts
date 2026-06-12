/**
 * Builds eslint/rails-error-classes.json by scanning the vendored Rails
 * source for error-class declarations (sibling of
 * scripts/build-rails-privates-manifest.ts, but regex over Ruby source
 * lines — Rails declares errors with single-line `class X < Y` headers).
 *
 * An error class is every `class X < Y` in a package's `errors.rb`, plus
 * any `class X < Y` under `lib/**` whose parent is a known Ruby error base
 * or a class already recognised as an error (grown to a fixpoint, so e.g.
 * `RecordInvalid < ActiveRecordError` in validations.rb is captured).
 *
 * Output: { generatedAt, packages: { activerecord: [{ name, parent, rubyFile }], … } }
 * where rubyFile is POSIX-relative to the package's `lib/` directory.
 *
 *   pnpm tsx scripts/build-rails-error-manifest.ts
 */
import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const PACKAGES = ["activerecord", "activemodel", "activesupport"] as const;
type Pkg = (typeof PACKAGES)[number];

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
  const libDir = path.join(ROOT, "vendor/rails", pkg, "lib");
  const files = await walkRubyFiles(libDir);

  // Pass 1: collect every `class X < Y` declaration with its source file,
  // and seed the recognised-error set from errors.rb + ROOT_BASES.
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
    // Code generators live under `generators/` and subclass an external
    // `Base` (Rails::Generators::Base) whose bare last segment collides
    // with our error `Base` (Encryption::Errors::Base). They are never
    // error classes — skip the directory wholesale.
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

  // A declaration is recognised when its parent is already known AND the
  // reference is unambiguous: either a bare name (resolves within the
  // package) or a qualified name whose last segment is a Ruby built-in
  // base (e.g. `< ::RangeError`). A qualified non-root parent such as
  // `ActiveJob::Base` is an external class that merely shares a leaf name
  // with one of ours, so it does not propagate.
  const recognises = (d: Decl): boolean =>
    known.has(d.parent) && (!d.qualifiedParent || ROOT_BASES.has(d.parent));

  // Pass 2: grow the recognised set to a fixpoint — any class whose parent
  // is already recognised is itself an error class.
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

  // Emit recognised error classes (skip the bare ROOT_BASES themselves —
  // they are Ruby built-ins, not declared here). Dedup by name, preferring
  // the errors.rb declaration when a name appears more than once.
  const byName = new Map<string, ErrorClass>();
  for (const d of decls) {
    if (!known.has(d.name)) continue;
    const existing = byName.get(d.name);
    if (existing && !d.fromErrorsFile) continue;
    byName.set(d.name, { name: d.name, parent: d.parent, rubyFile: d.rubyFile });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function main() {
  const packages: Record<string, ErrorClass[]> = {};
  for (const pkg of PACKAGES) packages[pkg] = await scanPackage(pkg);

  // Fixed timestamp source: avoid Date.now() so the manifest is
  // reproducible across runs unless the underlying Rails source changes.
  const manifest = { generatedAt: "vendored", packages };
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(manifest, null, 2) + "\n");

  const counts = PACKAGES.map((p) => `${p}: ${packages[p].length}`).join(", ");
  console.log(`Wrote ${OUT} — ${counts}`);
}

main();
