/**
 * The Ruby class-path table (RFC 0205, story
 * derive-class-path-from-registered-namespaces): one checked-in module per
 * package, `src/class-paths.generated.ts`, mapping each exported TS class that
 * `parity:api` pairs with a Ruby class to that class's `fqn` in
 * `output/rails-api.json`. ruby-compat's `rbModName` reads it after the
 * `classpaths` a `const_set` or a module-eval seat wrote, and before
 * `klass.name`.
 *
 *   pnpm parity:class-paths           # rewrite the tables
 *   pnpm parity:class-paths --check   # red on a stale table, or on a generated
 *                                     # path that disagrees with a seated one
 *
 * The pairing is compare.ts's own: `rubyFileToTs` for the file and
 * `resolveTsClassForRuby` for the class, so a class gets a path exactly where
 * the inheritance check finds its counterpart.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as prettier from "prettier";
import { TOKEN_RENAMES, isRubyOnlyClass, rubyFileToTs } from "../parity/conventions.js";
import { isSourceUnported } from "@blazetrails/parity/unported-files";
import { resolveTsClassForRuby } from "./compare.js";
import { PACKAGE_DIR_OVERRIDES, ROOT_DIR, packageSrcDir } from "./config.js";
import type { ClassInfo } from "@blazetrails/parity/types";

const run = promisify(execFile);
const OUTPUT_DIR = path.join(ROOT_DIR, "scripts/api-compare/output");
const GENERATED = "class-paths.generated.ts";

/** The api-compare packages whose classes are not loaded from the package entry. */
const SKIPPED = new Set(["activerecord-test-support"]);

interface Manifest {
  packages: Record<string, { classes: Record<string, ClassInfo & { fqn?: string }> }>;
}

export interface ClassPathEntry {
  /** The TS file, relative to the package's `src/`. */
  file: string;
  tsName: string;
  fqn: string;
}

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, name), "utf8")) as T;
}

/** A file the package build leaves out (`src/test-case.ts`) is not in its entry graph. */
async function tsconfigExcludes(dir: string): Promise<string[]> {
  const raw = await fs.readFile(path.join(ROOT_DIR, "packages", dir, "tsconfig.json"), "utf8");
  return (JSON.parse(raw) as { exclude?: string[] }).exclude ?? [];
}

/** trails spells a renamed token its own way in a constant too: `Handlers::ERB` is `Handlers::TSE`. */
function renameTokens(fqn: string): string {
  let out = fqn;
  for (const [tok, to] of Object.entries(TOKEN_RENAMES)) {
    const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
    out = out
      .replace(new RegExp(`(?<![A-Za-z])${tok.toUpperCase()}(?![a-z])`, "g"), to.toUpperCase())
      .replace(new RegExp(`(?<![A-Za-z])${cap(tok)}(?![a-z])`, "g"), cap(to));
  }
  return out;
}

/**
 * The `src/` files the package entry already loads, by its static relative
 * imports. A table names only these, so importing it never changes what the
 * entry loads (`active_support/message_pack` is an awaited step of its own).
 */
async function entryGraph(dir: string): Promise<Set<string>> {
  const cwd = path.join(ROOT_DIR, "packages", dir);
  const srcRoot = path.join(cwd, "src");
  const entry = (await entryFile(cwd)).replace(/^\.\/dist\//, "").replace(/\.js$/, ".ts");
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || file === GENERATED) continue;
    seen.add(file);
    const source = await fs.readFile(path.join(srcRoot, file), "utf8").catch(() => "");
    const specifiers = source.matchAll(
      /^\s*(?:import|export)\b(?!\s+type\b)[^;]*?from\s+"(\.[^"]+)"|^\s*import\s+"(\.[^"]+)"/gm,
    );
    for (const [, from, bare] of specifiers) {
      const spec = from ?? bare;
      queue.push(path.normalize(path.join(path.dirname(file), spec.replace(/\.js$/, ".ts"))));
    }
  }
  return seen;
}

function isExported(source: string, name: string): boolean {
  return (
    new RegExp(`^export\\s+(?:default\\s+)?(?:abstract\\s+)?class\\s+${name}\\b`, "m").test(
      source,
    ) || new RegExp(`^export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*;`, "m").test(source)
  );
}

/** Paired classes a table cannot import, which `--check` reports. */
const unexported: string[] = [];
const known = new Set<string>();

/**
 * Only-shrink: paired classes that were already unexported when the table
 * landed. Exporting one (or moving it to the file that mirrors its `.rb`)
 * deletes its row here.
 */
const KNOWN_UNEXPORTED = new Set([
  "ActiveRecord::Associations::JoinDependency::Aliases::Table",
  "ActiveRecord::Associations::JoinDependency::Aliases::Column",
  "ActiveRecord::Migration::Compatibility::V6_1::PostgreSQLCompat",
  "ActiveRecord::Migration::Compatibility::V6_0::ReferenceDefinition",
  "ActiveRecord::Relation::StrictLoadingScope",
  "Mime::Type::InvalidMimeType",
  "ActionDispatch::Routing::Mapper::BacktraceCleaner",
  "ActionController::TestRequest::ENCODER",
  "Rack::Session::Cookie::Base64",
  "Rack::Session::Cookie::Base64::JSON",
  "Rack::Session::Cookie::Base64::ZipJSON",
  "Rack::Session::Cookie::Identity",
  "Rack::Session::Cookie::SessionId",
  "Rack::Session::Encryptor::Error",
  "Rack::Session::Encryptor::InvalidSignature",
  "Rack::Session::Encryptor::InvalidMessage",
]);

export async function collectClassPaths(): Promise<Map<string, ClassPathEntry[]>> {
  const ruby = await readJson<Manifest>("rails-api.json");
  const ts = await readJson<Manifest>("ts-api.json");
  const byDir = new Map<string, ClassPathEntry[]>();
  unexported.length = 0;
  known.clear();

  for (const [pkg, rubyPkg] of Object.entries(ruby.packages)) {
    const tsPkg = ts.packages[pkg];
    if (!tsPkg || SKIPPED.has(pkg)) continue;
    const dir = PACKAGE_DIR_OVERRIDES[pkg] ?? pkg;
    const srcRoot = path.join(ROOT_DIR, "packages", dir, "src");
    const subDir = path.relative(srcRoot, packageSrcDir(pkg));

    const tsByFileName = new Map<string, ClassInfo>();
    for (const cls of Object.values(tsPkg.classes)) {
      if (cls.file) tsByFileName.set(`${cls.file}::${cls.name}`, cls);
    }

    const paired = new Map<string, ClassPathEntry>();
    const ambiguous = new Set<string>();
    for (const [fqn, info] of Object.entries(rubyPkg.classes)) {
      if (!info.file || isRubyOnlyClass(fqn) || isSourceUnported(info.file, pkg)) continue;
      const short = fqn.split("::").at(-1)!;
      const tsCls = resolveTsClassForRuby(short, rubyFileToTs(info.file, pkg), tsByFileName);
      const rubyPath = renameTokens(fqn);
      if (!tsCls?.file || rubyPath === tsCls.name) continue;
      const file = path.join(subDir, tsCls.file);
      const key = `${file}::${tsCls.name}`;
      if (paired.has(key) && paired.get(key)!.fqn !== rubyPath) ambiguous.add(key);
      paired.set(key, { file, tsName: tsCls.name, fqn: rubyPath });
    }

    const excluded = await tsconfigExcludes(dir);
    const reachable = await entryGraph(dir);
    const entries = byDir.get(dir) ?? [];
    for (const [key, entry] of paired) {
      if (ambiguous.has(key)) continue;
      const rel = path.join("src", entry.file);
      if (excluded.some((glob) => path.matchesGlob(rel, glob) || rel.startsWith(`${glob}/`))) {
        continue;
      }
      if (!reachable.has(entry.file)) continue;
      const source = await fs.readFile(path.join(srcRoot, entry.file), "utf8");
      if (isExported(source, entry.tsName)) entries.push(entry);
      else if (KNOWN_UNEXPORTED.has(entry.fqn)) known.add(entry.fqn);
      else unexported.push(`${dir}/src/${entry.file}: ${entry.tsName} (${entry.fqn})`);
    }
    byDir.set(dir, entries);
  }
  return byDir;
}

export function renderClassPaths(entries: readonly ClassPathEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.fqn.localeCompare(b.fqn));
  const files = [...new Set(sorted.map((e) => e.file))].sort();
  const alias = new Map<string, string>();
  const imports = files.map((file, i) => {
    const ns = `m${i}`;
    alias.set(file, ns);
    return `import * as ${ns} from "./${file.replace(/\.ts$/, ".js")}";`;
  });
  return [
    'import { registerClassPaths } from "@blazetrails/ruby-compat";',
    ...imports,
    "",
    "registerClassPaths([",
    ...sorted.map((e) => `  [() => ${alias.get(e.file)}.${e.tsName}, ${JSON.stringify(e.fqn)}],`),
    "]);",
    "",
  ].join("\n");
}

/**
 * Imports the package's built entry in a fresh `node`, as the entry-import TDZ
 * tests do, and reds on a generated path that disagrees with the one a
 * `const_set` or seat wrote.
 */
async function entryFile(cwd: string): Promise<string> {
  const pkg = JSON.parse(await fs.readFile(path.join(cwd, "package.json"), "utf8")) as {
    main?: string;
    exports?: Record<string, unknown>;
  };
  const dot = pkg.exports?.["."];
  const entry =
    typeof dot === "string"
      ? dot
      : ((dot as { default?: string } | undefined)?.default ?? pkg.main!);
  return `./${entry.replace(/^\.\//, "")}`;
}

async function checkSeatedPaths(dir: string): Promise<void> {
  const cwd = path.join(ROOT_DIR, "packages", dir);
  const script = [
    `await import(${JSON.stringify(await entryFile(cwd))});`,
    'const { classPathMismatches } = await import("@blazetrails/ruby-compat");',
    "console.log(JSON.stringify(classPathMismatches()));",
  ].join("\n");
  const { stdout } = await run("node", ["--input-type=module", "-e", script], { cwd });
  for (const [seated, generated] of JSON.parse(stdout) as [string, string][]) {
    console.error(`${dir}: seated ${seated}, generated ${generated}`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const stale: string[] = [];
  const tables = await collectClassPaths();
  for (const [dir, entries] of tables) {
    const target = path.join(ROOT_DIR, "packages", dir, "src", GENERATED);
    if (entries.length === 0) {
      const exists = await fs.access(target).then(
        () => true,
        () => false,
      );
      if (!exists) continue;
      if (check) stale.push(`${path.relative(ROOT_DIR, target)} (no paired classes left)`);
      else {
        await fs.rm(target);
        console.error(
          `Removed ${path.relative(ROOT_DIR, target)}: drop its import from the entry.`,
        );
      }
      continue;
    }
    const next = await prettier.format(renderClassPaths(entries), {
      ...(await prettier.resolveConfig(target)),
      filepath: target,
    });
    const current = await fs.readFile(target, "utf8").catch(() => null);
    if (current === next) continue;
    if (check) stale.push(path.relative(ROOT_DIR, target));
    else await fs.writeFile(target, next);
  }
  if (check && unexported.length > 0) {
    console.error(
      `Classes paired with a Ruby class but not exported, so no table can name them:\n  ${unexported.join("\n  ")}`,
    );
    process.exitCode = 1;
  }
  const gone = [...KNOWN_UNEXPORTED].filter((fqn) => !known.has(fqn));
  if (check && gone.length > 0) {
    console.error(`No longer reported — delete from KNOWN_UNEXPORTED:\n  ${gone.join("\n  ")}`);
    process.exitCode = 1;
  }
  if (check) {
    for (const [dir, entries] of tables) {
      if (entries.length > 0) await checkSeatedPaths(dir);
    }
  }
  if (stale.length > 0) {
    console.error(
      `Stale class-path tables — run \`pnpm parity:class-paths\`:\n  ${stale.join("\n  ")}`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
