/**
 * The framework constant table (RFC 0213 § "Framework constants"): one
 * checked-in module per package, `src/constants.generated.ts`, mapping each
 * exported TS class or module that `parity:api` pairs with a Ruby class or
 * module to its Ruby path. ruby-compat's `rbModName`
 * reads it after the `classpaths` a `const_set` or a module-eval seat wrote,
 * and before `klass.name`.
 *
 *   pnpm parity:class-paths           # rewrite the tables from the walk
 *   pnpm parity:class-paths --check   # red on a stale table or record, or on a
 *                                     # generated path that disagrees with a seated one
 *   ... --check --record              # rewrite constant-residue.json from the pairing
 *   ... --check --package <pkg>       # one api-compare package, for the scoped CI driver
 *
 * The rows are written from `walkConstants` and `constant-residue.json`
 * alone. `rails-api.json` is read only under `--check`, whose pairing is
 * compare.ts's own: `rubyFileToTs` for the file and
 * `resolveTsClassForRuby` for the class, so a class gets a path exactly where
 * the inheritance check finds its counterpart.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as prettier from "prettier";
import {
  TOKEN_RENAMES,
  TS_CLASS_RENAMES,
  isRubyOnlyClass,
  rubyFileToTs,
} from "../parity/conventions.js";
import { isSourceUnported } from "@blazetrails/parity/unported-files";
import { resolveTsClassForRuby } from "./compare.js";
import { BRAND_RENAMES, derivedConstantPath, walkConstants } from "./constant-table.js";
import { PACKAGE_DIR_OVERRIDES, ROOT_DIR, packageSrcDir } from "./config.js";
import { libRoot } from "../layout/package-roots.js";
import type { ClassInfo } from "@blazetrails/parity/types";

const run = promisify(execFile);
const OUTPUT_DIR = path.join(ROOT_DIR, "scripts/api-compare/output");
const GENERATED = "constants.generated.ts";
/** The table for the classes in files outside the package entry's graph, which those files import. */
const EXCLUDED_GENERATED = "constants.excluded.generated.ts";

/**
 * The api-compare packages with no constant table: `activerecord-test-support`,
 * whose classes are not loaded from the package entry, and the gem ports scored
 * by `parity:api` before their top-level Ruby module (`Nokogiri`, `Racc`,
 * `Crass`, `Loofah`, `Rails::HTML`, `ImageProcessing`, `Date`, `TZInfo`) is
 * seated with `constSet`, which `constGet` needs to resolve any path under it.
 * Those eight leave this set with story
 * `gem-ports-seat-top-level-modules-for-class-paths`.
 */
const SKIPPED = new Set([
  "activerecord-test-support",
  "crass",
  "date",
  "image-processing",
  "loofah",
  "nokogiri",
  "racc",
  "rails-html-sanitizer",
  "tzinfo",
]);

/** A subpath entry that must stay out of the package entry's graph, so its table is its own. */
const SUBPATH_ENTRIES: Record<string, string> = {
  actionmailer: "test-case.ts",
  actionpack: "system-testing.ts",
  activejob: "test-case.ts",
  activerecord: "fixtures.ts",
  activestorage: "transformers/image-processing-transformer.ts",
};
/** A subpath entry that must not load another subpath's table, so its table is named for it. */
const SEPARATE_SUBPATH_ENTRIES: Record<string, string> = {};

/** A directory or file whose files load one at a time, so each carries its own table and loads no sibling. */
const LAZY_DIRS: Record<string, string[]> = {
  activerecord: [
    "connection-adapters/",
    "destroy-association-async-job.ts",
    "encryption/encrypted-fixtures.ts",
    "encryption/envelope-encryption-key-provider.ts",
    "encryption/extended-deterministic-queries.ts",
    "encryption/message-pack-message-serializer.ts",
    "encryption/read-only-null-encryptor.ts",
    "test-databases.ts",
    "testing/query-assertions.ts",
  ],
  actionmailbox: ["inbound-email.ts", "inbound-email/"],
  actionmailer: ["test-case.ts", "test-helper.ts"],
  activejob: ["test-case.ts", "test-helper.ts"],
  activestorage: ["blob.ts", "blob/", "variant-record.ts"],
  trailties: ["commands/", "command.ts"],
};

/**
 * Of several Ruby classes one file pairs with the same TS class, the one the
 * file's namespace seat (`Owner.Name = Name`) names.
 */
function seatedFqn(source: string, tsName: string, fqns: string[]): string | undefined {
  const seats = [...source.matchAll(new RegExp(`^([\\w.]+)\\.${tsName} = ${tsName};$`, "gm"))];
  const owners = seats.map((m) => `${m[1].replaceAll(".", "::")}::${tsName}`);
  const hits = fqns.filter((fqn) => owners.some((o) => fqn.endsWith(`::${o}`)));
  return hits.length === 1 ? hits[0] : undefined;
}

/** A lazy file's table, named from its path under the prefix so same-named files do not collide. */
function lazyTable(dir: string, file: string): string {
  const prefix = (LAZY_DIRS[dir] ?? []).find((p) => p.endsWith("/") && file.startsWith(p));
  const rel = prefix ? file.slice(prefix.length) : path.basename(file);
  return `constants.${rel.replace(/\.ts$/, "").replaceAll("/", "-")}.generated.ts`;
}

function separateTable(subpath: string): string {
  return `constants.${path.basename(subpath, ".ts")}.generated.ts`;
}

interface Manifest {
  packages: Record<
    string,
    {
      classes: Record<string, ClassInfo & { fqn?: string }>;
      modules: Record<string, ClassInfo & { fqn?: string }>;
    }
  >;
}

export interface ClassPathEntry {
  /** The TS file, relative to the package's `src/`. */
  file: string;
  tsName: string;
  fqn: string;
  /** The entry sits outside the entry graph (`src/test-case.ts`), so its own table holds it. */
  excluded?: boolean;
  /** The entry sits in a `SEPARATE_SUBPATH_ENTRIES` graph, so that subpath's table holds it. */
  table?: string;
  /** The module is the file's own namespace object, which the file `include`s (`DateAndTime::Calculations`). */
  namespace?: boolean;
}

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, name), "utf8")) as T;
}

/** A file the package build leaves out (`src/test-case.ts`) is not in its entry graph. */
async function tsconfigExcludes(dir: string): Promise<string[]> {
  const raw = await fs.readFile(path.join(ROOT_DIR, "packages", dir, "tsconfig.json"), "utf8");
  return (JSON.parse(raw) as { exclude?: string[] }).exclude ?? [];
}

/**
 * trails spells a renamed token its own way in a constant too: `Handlers::ERB`
 * is `Handlers::TSE`, and a `TS_CLASS_RENAMES` segment is renamed as
 * `parity:api` matches it, so `Rails::Railtie` is `Rails::Trailtie`.
 */
function renameTokens(fqn: string): string {
  let out = fqn
    .split("::")
    .map((seg) => (BRAND_RENAMES.includes(seg) ? TS_CLASS_RENAMES[seg] : seg))
    .join("::");
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
async function entryGraph(dir: string, subpath?: string): Promise<Set<string>> {
  const cwd = path.join(ROOT_DIR, "packages", dir);
  const srcRoot = path.join(cwd, libRoot(dir));
  const entry =
    subpath ?? (await entryFile(cwd)).replace(/^\.\/dist\//, "").replace(/\.js$/, ".ts");
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
    ) ||
    new RegExp(`^export\\s+(?:const|namespace)\\s+${name}\\b`, "m").test(source) ||
    new RegExp(
      `^export\\s*\\{[^}]*(?<!\\bas\\s+)\\b${name}\\b(?!\\s+as\\b)[^}]*\\}\\s*;`,
      "m",
    ).test(source)
  );
}

/** A file that imports its own namespace (`import * as X from "./calculations.js"`) to `include` it. */
function isSelfNamespace(source: string, file: string, tsName: string): boolean {
  const base = path.basename(file, ".ts");
  if (base.replace(/(?:^|-)(\w)/g, (_, c: string) => c.toUpperCase()) !== tsName) return false;
  const self = `${base}.js`;
  return new RegExp(
    `^import\\s+\\*\\s+as\\s+\\w+\\s+from\\s+"\\./${self.replace(".", "\\.")}"`,
    "m",
  ).test(source);
}

/** Paired classes a table cannot import, which `--check` reports. */
const unexported: string[] = [];
/** Paired Ruby modules with no exported binding; reported, not gated. */
const unexportedModules: string[] = [];

/**
 * Which table holds a row in `file`, or null where no table may: the file is
 * built out of the package, or sits outside every entry graph. `lazyOk` is
 * false for a module the pairing fell back to, which a lazy file never seats.
 */
async function placement(dir: string) {
  const srcRoot = path.join(ROOT_DIR, "packages", dir, libRoot(dir));
  const excluded = await tsconfigExcludes(dir);
  const reachable = await entryGraph(dir);
  const subpath = SUBPATH_ENTRIES[dir];
  const subpathGraph = subpath ? await entryGraph(dir, subpath) : new Set<string>();
  const separate = SEPARATE_SUBPATH_ENTRIES[dir];
  const separateGraph = separate ? await entryGraph(dir, separate) : new Set<string>();
  const sources = new Map<string, string>();
  const read = async (file: string) =>
    sources.get(file) ??
    sources.set(file, await fs.readFile(path.join(srcRoot, file), "utf8")).get(file)!;
  const at = (file: string, lazyOk = true): Pick<ClassPathEntry, "excluded" | "table"> | null => {
    const rel = path.join(libRoot(dir), file);
    const separated = !reachable.has(file) && separateGraph.has(file);
    const lazy =
      lazyOk &&
      !reachable.has(file) &&
      (LAZY_DIRS[dir] ?? []).some((prefix) => file.startsWith(prefix));
    const ownTable =
      excluded.includes(rel) ||
      separated ||
      lazy ||
      (!reachable.has(file) && subpathGraph.has(file));
    if (
      !ownTable &&
      excluded.some((glob) => path.matchesGlob(rel, glob) || rel.startsWith(`${glob}/`))
    ) {
      return null;
    }
    if (!ownTable && !reachable.has(file)) return null;
    return {
      excluded: ownTable,
      ...(separated ? { table: separateTable(separate) } : {}),
      ...(lazy ? { table: lazyTable(dir, file) } : {}),
    };
  };
  return { read, at };
}

/**
 * The tables' rows as the walk writes them (RFC 0213 § "Framework
 * constants"): every exported class `walkConstants` derives, less the
 * `excluded` ones no Ruby constant answers, with the record's `residue` paths
 * over the derived ones and its `unwalked` members at their derived path.
 */
export function splitKey(key: string): [string, string] {
  const at = key.lastIndexOf("::");
  if (at === -1) throw new globalThis.Error(`${key} is not a file::name key`);
  return [key.slice(0, at), key.slice(at + 2)];
}

export async function walkedClassPaths(
  dir: string,
  record: ConstantResidue,
): Promise<ClassPathEntry[]> {
  const rows = await walkConstants(dir);
  for (const key of record.excluded) rows.delete(key);
  for (const key of record.unwalked) {
    const [file, tsName] = splitKey(key);
    const fqn = await derivedConstantPath(dir, file, tsName);
    if (fqn === null) throw new globalThis.Error(`${dir}: ${key} has no derived path`);
    rows.set(key, fqn);
  }
  for (const [key, fqn] of Object.entries(record.residue)) rows.set(key, fqn);
  const place = await placement(dir);
  const entries: ClassPathEntry[] = [];
  for (const [key, fqn] of rows) {
    const [file, tsName] = splitKey(key);
    const placed = place.at(file);
    if (placed === null) continue;
    const source = await place.read(file);
    const namespace =
      !tsName.includes(".") && !isExported(source, tsName) && isSelfNamespace(source, file, tsName);
    entries.push(namespace ? { file, tsName, fqn, namespace } : { file, tsName, fqn, ...placed });
  }
  return entries;
}

export async function collectClassPaths(only?: string): Promise<Map<string, ClassPathEntry[]>> {
  const ruby = await readJson<Manifest>("rails-api.json");
  const ts = await readJson<Manifest>("ts-api.json");
  const byDir = new Map<string, ClassPathEntry[]>();
  unexported.length = 0;
  unexportedModules.length = 0;

  for (const [pkg, rubyPkg] of Object.entries(ruby.packages)) {
    const tsPkg = ts.packages[pkg];
    if (!tsPkg || SKIPPED.has(pkg) || (only !== undefined && pkg !== only)) continue;
    const dir = PACKAGE_DIR_OVERRIDES[pkg] ?? pkg;
    const srcRoot = path.join(ROOT_DIR, "packages", dir, libRoot(dir));
    const subDir = path.relative(srcRoot, packageSrcDir(pkg));

    const paired = new Map<string, ClassPathEntry>();
    const modules = new Set<string>();
    const fallbackModules = new Set<string>();
    const ambiguous = new Map<string, string[]>();
    for (const kind of ["classes", "modules"] as const) {
      const tsByFileName = new Map<string, ClassInfo>();
      const tsKinds = kind === "modules" ? (["modules", "classes"] as const) : ([kind] as const);
      for (const cls of tsKinds.flatMap((k) => Object.values(tsPkg[k] ?? {}))) {
        if (cls.file) tsByFileName.set(`${cls.file}::${cls.name}`, cls);
      }
      for (const [fqn, info] of Object.entries(rubyPkg[kind] ?? {})) {
        if (!info.file || isRubyOnlyClass(fqn) || isSourceUnported(info.file, pkg)) continue;
        const short = fqn.split("::").at(-1)!;
        const tsFile = rubyFileToTs(info.file, pkg);
        const rubyPath = renameTokens(fqn);
        const rubyShort = rubyPath.split("::").at(-1)!;
        let tsCls: { file?: string; name: string } | undefined = resolveTsClassForRuby(
          short,
          tsFile,
          tsByFileName,
        );
        tsCls ??=
          kind === "classes"
            ? tsByFileName.get(`${tsFile}::${fqn.split("::").at(-2)}${short}`)
            : undefined;
        const fallback = tsCls === undefined && kind === "modules";
        if (fallback) tsCls = { file: tsFile, name: rubyShort };
        if (!tsCls?.file || rubyPath === tsCls.name) continue;
        if (kind === "modules" && tsCls.name !== rubyShort) continue;
        const file = path.join(subDir, tsCls.file);
        const key = `${file}::${tsCls.name}`;
        if (fallback) fallbackModules.add(key);
        if (paired.has(key) && paired.get(key)!.fqn !== rubyPath) {
          ambiguous.set(key, [...(ambiguous.get(key) ?? [paired.get(key)!.fqn]), rubyPath]);
        }
        paired.set(key, { file, tsName: tsCls.name, fqn: rubyPath });
        if (kind === "modules") modules.add(key);
      }
    }

    const place = await placement(dir);
    const entries = byDir.get(dir) ?? [];
    const byFqn = new Map([...paired.values()].map((e) => [`${e.file}::${e.fqn}`, e]));
    const read = place.read;
    const tsPath = async (entry: ClassPathEntry): Promise<string | null> => {
      const source = await read(entry.file);
      if (isExported(source, entry.tsName)) return entry.tsName;
      const member = new RegExp(
        `^\\s*(?:public\\s+)?static\\s+(?:readonly\\s+)?${entry.tsName}\\b|^\\s+export\\s+class\\s+${entry.tsName}\\b`,
        "m",
      ).exec(source);
      if (!member) return null;
      const owner = byFqn.get(`${entry.file}::${entry.fqn.split("::").slice(0, -1).join("::")}`);
      const enclosing = [
        ...source.slice(0, member.index).matchAll(/^export\s+(?:abstract\s+)?class\s+(\w+)/gm),
      ].at(-1)?.[1];
      const ownerPath = owner ? await tsPath(owner) : (enclosing ?? null);
      return ownerPath === null ? null : `${ownerPath}.${entry.tsName}`;
    };
    for (const [key, candidate] of paired) {
      let entry = candidate;
      if (ambiguous.has(key)) {
        const seated = seatedFqn(await read(entry.file), entry.tsName, ambiguous.get(key)!);
        if (seated === undefined) continue;
        entry = { ...entry, fqn: seated };
      }
      const placed = place.at(entry.file, !fallbackModules.has(key));
      if (placed === null) continue;
      const source = await read(entry.file);
      const reached = await tsPath(entry);
      if (reached !== null) {
        entries.push({ ...entry, tsName: reached, ...placed });
      } else if (modules.has(key) && isSelfNamespace(source, entry.file, entry.tsName)) {
        entries.push({ ...entry, namespace: true });
      } else if (fallbackModules.has(key)) continue;
      else if (modules.has(key)) {
        unexportedModules.push(
          `${dir}/${libRoot(dir)}/${entry.file}: ${entry.tsName} (${entry.fqn})`,
        );
      } else
        unexported.push(`${dir}/${libRoot(dir)}/${entry.file}: ${entry.tsName} (${entry.fqn})`);
    }
    byDir.set(dir, entries);
  }
  return byDir;
}

/** A table imported by a module besides the entry (thor's `command.ts`) must not load the entry itself. */
const ENTRY_FIRST = new Set(["i18n", "solid-queue"]);

/**
 * `entry` is the package entry an `ENTRY_FIRST` table imports first: entered at
 * the table, the entry's own order still runs, so no `extends` meets a class in TDZ.
 */
export function renderClassPaths(entries: readonly ClassPathEntry[], entry?: string): string {
  const sorted = [...entries].sort((a, b) => a.fqn.localeCompare(b.fqn));
  const files = [...new Set(sorted.map((e) => e.file))].sort();
  const alias = new Map<string, string>();
  const imports = files.map((file, i) => {
    const ns = `m${i}`;
    alias.set(file, ns);
    return `import * as ${ns} from "./${file.replace(/\.ts$/, ".js")}";`;
  });
  return [
    'import { defineConstants } from "@blazetrails/ruby-compat";',
    ...(entry === undefined ? [] : [`import "./${entry}";`]),
    ...imports,
    "",
    "defineConstants([",
    ...sorted.map(
      (e) =>
        `  [() => ${alias.get(e.file)}${e.namespace ? "" : `.${e.tsName}`}, ${JSON.stringify(e.fqn)}],`,
    ),
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

async function checkSeatedPaths(dir: string, paths: readonly string[]): Promise<void> {
  const cwd = path.join(ROOT_DIR, "packages", dir);
  const script = [
    `await import(${JSON.stringify(await entryFile(cwd))});`,
    'const { classPathMismatches, constGet } = await import("@blazetrails/ruby-compat");',
    `for (const p of ${JSON.stringify(paths)}) {`,
    "  try { constGet(Object, p); } catch (e) { console.error(`${p}: constGet raised ${e}`); process.exitCode = 1; }",
    "}",
    "console.log(JSON.stringify(classPathMismatches()));",
  ].join("\n");
  const { stdout } = await run("node", ["--input-type=module", "-e", script], { cwd }).catch(
    (e: { stdout: string; stderr: string }) => {
      console.error(`${dir}: ${e.stderr.trim()}`);
      process.exitCode = 1;
      return e;
    },
  );
  const entry = await entryFile(cwd);
  const table = `${path.dirname(entry)}/constants.generated.js`;
  await run("node", ["--input-type=module", "-e", `await import(${JSON.stringify(table)});`], {
    cwd,
  });
  for (const [seated, generated] of JSON.parse(stdout) as [string, string][]) {
    console.error(`${dir}: seated ${seated}, generated ${generated}`);
    process.exitCode = 1;
  }
}

/**
 * ruby-compat's core classes, which have no Rails counterpart in
 * `rails-api.json`: each row is `[path, file, binding, MRI site]`, the site
 * the `Init_*` `rb_define_class` (or `boot_defclass`) call that names the
 * class, relative to `vendor/ruby/<version>/`. `file` is null for a JS
 * global standing in for the class.
 */
export const CORE_CLASSES: readonly [string, string | null, string, string][] = [
  ["ArgumentError", "argument-error.ts", "ArgumentError", "error.c:3323"],
  ["Array", null, "Array", "array.c:8605"],
  ["EOFError", "eof-error.ts", "EOFError", "io.c:15343"],
  ["EncodingError", "encoding-error.ts", "EncodingError", "error.c:3371"],
  ["Exception", "exception.ts", "Exception", "error.c:3294"],
  ["FiberError", "fiber-error.ts", "FiberError", "cont.c:3532"],
  ["FloatDomainError", "float-domain-error.ts", "FloatDomainError", "numeric.c:6155"],
  ["FrozenError", "frozen-error.ts", "FrozenError", "error.c:3366"],
  ["Hash", "hash.ts", "Hash", "hash.c:7182"],
  ["IOError", "io-error.ts", "IOError", "io.c:15342"],
  ["IndexError", "index-error.ts", "IndexError", "error.c:3324"],
  ["Interrupt", "signal-exception.ts", "Interrupt", "error.c:3319"],
  ["KeyError", "key-error.ts", "KeyError", "error.c:3325"],
  ["LoadError", "load-error.ts", "LoadError", "error.c:3342"],
  ["LocalJumpError", "local-jump-error.ts", "LocalJumpError", "proc.c:4326"],
  ["NameError", "name-error.ts", "NameError", "error.c:3348"],
  ["NoMethodError", "no-method-error.ts", "NoMethodError", "error.c:3360"],
  ["NotImplementedError", "not-implemented-error.ts", "NotImplementedError", "error.c:3346"],
  ["Object", null, "Object", "class.c:894"],
  ["Range", "range.ts", "Range", "range.c:2636"],
  ["RangeError", "range-error.ts", "RangeError", "error.c:3329"],
  ["Rational", "rational.ts", "Rational", "rational.c:2759"],
  ["Regexp", null, "RegExp", "re.c:4752"],
  ["RuntimeError", "runtime-error.ts", "RuntimeError", "error.c:3365"],
  ["SignalException", "signal-exception.ts", "SignalException", "error.c:3318"],
  ["StandardError", "standard-error.ts", "StandardError", "error.c:3321"],
  ["StopIteration", "stop-iteration.ts", "StopIteration", "enumerator.c:4578"],
  ["Struct", "struct.ts", "Struct", "struct.c:2176"],
  ["SystemCallError", "errno.ts", "SystemCallError", "error.c:3380"],
  ["ThreadError", "thread-error.ts", "ThreadError", "thread.c:5451"],
  ["TypeError", "type-error.ts", "TypeError", "error.c:3322"],
  ["ZeroDivisionError", "rational.ts", "ZeroDivisionError", "numeric.c:6154"],
];

/** Reds a `CORE_CLASSES` row whose MRI site does not name its class. */
async function checkCoreSites(): Promise<string[]> {
  const ruby = path.join(ROOT_DIR, "vendor/ruby/v3.3.11");
  const bad: string[] = [];
  for (const [fqn, , , site] of CORE_CLASSES) {
    const [file, line] = site.split(":");
    const source = await fs.readFile(path.join(ruby, file), "utf8").catch(() => null);
    if (source === null) {
      bad.push(`${fqn} ${site} (unreadable)`);
      continue;
    }
    if (!source.split("\n")[Number(line) - 1]?.includes(`"${fqn}"`)) bad.push(`${fqn} ${site}`);
  }
  return bad;
}

export function renderCoreClassPaths(): string {
  const files = [...new Set(CORE_CLASSES.flatMap(([, file]) => (file ? [file] : [])))].sort();
  const alias = new Map(files.map((file, i) => [file, `m${i}`]));
  return [
    'import { classpaths } from "./classpath.js";',
    ...files.map(
      (file) => `import * as ${alias.get(file)} from "./${file.replace(/\.ts$/, ".js")}";`,
    ),
    "",
    ...CORE_CLASSES.map(
      ([fqn, file, binding]) =>
        `classpaths.set(${file ? `${alias.get(file)}.` : ""}${binding}, { path: ${JSON.stringify(fqn)}, permanent: true });`,
    ),
    "",
  ].join("\n");
}

/** The per-file tables on disk, so one left with no paired classes is still visited. */
async function lazyTablesOnDisk(dir: string): Promise<string[]> {
  const files = await fs.readdir(path.join(ROOT_DIR, "packages", dir, libRoot(dir)));
  return files.filter(
    (file) =>
      /^constants\..+\.generated\.ts$/.test(file) &&
      file !== EXCLUDED_GENERATED &&
      file !== separateTable(SEPARATE_SUBPATH_ENTRIES[dir] ?? ""),
  );
}

/** A lazy file is outside the entry graph, so only its own import loads its table. */
async function lazyFilesMissingTable(dir: string, entries: ClassPathEntry[]): Promise<string[]> {
  const prefixes = LAZY_DIRS[dir];
  if (prefixes === undefined) return [];
  const missing = new Set<string>();
  for (const { file, table } of entries) {
    if (!table || !prefixes.some((prefix) => file.startsWith(prefix))) continue;
    const source = await fs.readFile(
      path.join(ROOT_DIR, "packages", dir, libRoot(dir), file),
      "utf8",
    );
    if (!source.includes(`/${table.replace(/\.ts$/, ".js")}"`)) missing.add(file);
  }
  return [...missing];
}

/**
 * One package's record: its row count; the walked exports a table could
 * seat but no Ruby constant answers, so no table names them and `rbModName` gives them no path; the
 * rows the walk does not reach (a static member, a module object) but whose
 * path it derives; and the rows whose path the derivation misses.
 */
export interface ConstantResidue {
  rows: number;
  excluded: string[];
  unwalked: string[];
  residue: Record<string, string>;
}

export async function constantResidue(
  dir: string,
  entries: readonly ClassPathEntry[],
): Promise<ConstantResidue> {
  const walked = await walkConstants(dir);
  const residue: Record<string, string> = {};
  const unwalked: string[] = [];
  const keys = entries.map((e) => `${e.file}::${e.tsName}`).sort();
  const fqns = new Map(entries.map((e) => [`${e.file}::${e.tsName}`, e.fqn]));
  for (const key of keys) {
    const fqn = fqns.get(key)!;
    if (walked.get(key) === fqn) continue;
    const [file, tsName] = splitKey(key);
    if (!walked.has(key) && (await derivedConstantPath(dir, file, tsName)) === fqn) {
      unwalked.push(key);
    } else residue[key] = fqn;
  }
  const place = await placement(dir);
  const excluded = [...walked.keys()]
    .filter((key) => !fqns.has(key) && place.at(splitKey(key)[0]) !== null)
    .sort();
  return { rows: entries.length, excluded, unwalked, residue };
}

const RECORD = path.join(ROOT_DIR, "scripts/api-compare/constant-residue.json");

async function readRecord(): Promise<Record<string, ConstantResidue>> {
  return JSON.parse(await fs.readFile(RECORD, "utf8").catch(() => "{}")) as Record<
    string,
    ConstantResidue
  >;
}

/** The record at the merge-base with `origin/main`, against which `excluded` only shrinks. */
async function baseRecord(): Promise<Record<string, ConstantResidue>> {
  const { stdout: sha } = await run("git", ["merge-base", "HEAD", "origin/main"], {
    cwd: ROOT_DIR,
  });
  const { stdout } = await run(
    "git",
    ["show", `${sha.trim()}:${path.relative(ROOT_DIR, RECORD)}`],
    { cwd: ROOT_DIR, maxBuffer: 1 << 26 },
  ).catch(() => ({ stdout: "{}" }));
  return JSON.parse(stdout) as Record<string, ConstantResidue>;
}

/**
 * A class excluded by its receipt: the JSDoc directly above its declaration
 * carries `@noRailsEquivalent PERMANENT` or `@noRailsEquivalent CONVERGEABLE <story-id>`.
 * An `excluded` key is a walked top-level class, so `tsName` is never dotted.
 */
export function isReceipted(source: string, tsName: string): boolean {
  const decl = new RegExp(
    `^export\\s+(?:default\\s+)?(?:abstract\\s+)?class\\s+${tsName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "m",
  ).exec(source);
  if (decl === null) return false;
  const jsdoc = /\/\*\*((?:(?!\*\/)[^])*)\*\/\s*$/.exec(source.slice(0, decl.index));
  return /@noRailsEquivalent\s+(?:PERMANENT\b|CONVERGEABLE\s+[a-z0-9][a-z0-9-]*)/.test(
    jsdoc?.[1] ?? "",
  );
}

function renamedKey(key: string): string {
  const [file, tsName] = splitKey(key);
  const renamed = file
    .split("/")
    .map((segment) => {
      const [stem, ...ext] = segment.split(".");
      return [Object.hasOwn(TOKEN_RENAMES, stem) ? TOKEN_RENAMES[stem] : stem, ...ext].join(".");
    })
    .join("/");
  return `${renamed}::${tsName}`;
}

/**
 * The Ruby classes defined at top level (`class DummyConfig`,
 * `railties/lib/rails/application/dummy_config.rb:3`). A TS class of the same
 * name needs no table row, since its JS name is already its Ruby path, so its
 * exclusion is not new surface.
 */
async function topLevelRubyConstants(dir: string): Promise<Set<string>> {
  const ruby = await readJson<Manifest>("rails-api.json").catch(() => null);
  const out = new Set<string>();
  for (const [pkg, rubyPkg] of Object.entries(ruby?.packages ?? {})) {
    if ((PACKAGE_DIR_OVERRIDES[pkg] ?? pkg) !== dir) continue;
    const srcRoot = path.join(ROOT_DIR, "packages", dir, libRoot(dir));
    const subDir = path.relative(srcRoot, packageSrcDir(pkg));
    for (const [fqn, info] of Object.entries(rubyPkg.classes ?? {})) {
      if (fqn.includes("::") || !info.file) continue;
      out.add(`${path.join(subDir, rubyFileToTs(info.file, pkg))}::${fqn}`);
    }
  }
  return out;
}

/**
 * The keys `record` adds to `excluded` over `base` with no receipt. A
 * package new to the record starts from an empty list.
 */
export async function unreceiptedExclusions(
  dir: string,
  record: ConstantResidue,
  base: Record<string, ConstantResidue>,
): Promise<string[]> {
  const before = new Set((base[dir]?.excluded ?? []).map(renamedKey));
  const topLevel = await topLevelRubyConstants(dir);
  const out: string[] = [];
  for (const key of record.excluded) {
    if (before.has(key)) continue;
    const [file, tsName] = splitKey(key);
    if (topLevel.has(key)) continue;
    const source = await fs.readFile(
      path.join(ROOT_DIR, "packages", dir, libRoot(dir), file),
      "utf8",
    );
    if (!isReceipted(source, tsName)) out.push(key);
  }
  return out;
}

/** The tables the walk writes, from `constant-residue.json`. */
async function walkedTables(only?: string): Promise<Map<string, ClassPathEntry[]>> {
  const dir = only === undefined ? undefined : (PACKAGE_DIR_OVERRIDES[only] ?? only);
  const tables = new Map<string, ClassPathEntry[]>();
  for (const [name, record] of Object.entries(await readRecord())) {
    if (dir === undefined || name === dir) tables.set(name, await walkedClassPaths(name, record));
  }
  return tables;
}

const entryKey = (e: ClassPathEntry) =>
  JSON.stringify([e.file, e.tsName, e.fqn, !!e.excluded, e.table ?? null, !!e.namespace]);

/**
 * The cross-check: the `rails-api.json` pairing's record against the one on
 * disk (rewritten under `--record`), and its rows against the walk's.
 */
async function checkConstantResidue(
  tables: Map<string, ClassPathEntry[]>,
  write: boolean,
  stale: string[],
  only?: string,
): Promise<void> {
  const current = await fs.readFile(RECORD, "utf8").catch(() => "{}");
  const record = JSON.parse(current) as Record<string, ConstantResidue>;
  const base = await baseRecord();
  for (const [dir, entries] of tables) {
    if (entries.length === 0) {
      delete record[dir];
      continue;
    }
    record[dir] = await constantResidue(dir, entries);
    for (const key of await unreceiptedExclusions(dir, record[dir], base)) {
      console.error(
        `${dir}: ${key} is a new walked export with no Ruby counterpart: receipt it with @noRailsEquivalent, or remove it`,
      );
      process.exitCode = 1;
    }
    const walked = new Set((await walkedClassPaths(dir, record[dir])).map(entryKey));
    const paired = new Set(entries.map(entryKey));
    const misses = [...paired].filter((row) => !walked.has(row));
    const invents = [...walked].filter((row) => !paired.has(row));
    for (const row of misses) console.error(`${dir}: walk misses ${row}`);
    for (const row of invents) console.error(`${dir}: walk invents ${row}`);
    if (misses.length + invents.length > 0) process.exitCode = 1;
  }
  if (only === undefined) {
    for (const dir of Object.keys(record)) if (!tables.has(dir)) delete record[dir];
  }
  const sorted = Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
  const next = await prettier.format(JSON.stringify(sorted), {
    ...(await prettier.resolveConfig(RECORD)),
    filepath: RECORD,
  });
  if (current === next) return;
  if (write) await fs.writeFile(RECORD, next);
  else stale.push(`${path.relative(ROOT_DIR, RECORD)} (run with --check --record)`);
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const at = process.argv.indexOf("--package");
  const only = at === -1 ? undefined : process.argv[at + 1];
  const stale: string[] = [];
  const tables = check ? await collectClassPaths(only) : await walkedTables(only);
  if (check) await checkConstantResidue(tables, process.argv.includes("--record"), stale, only);
  const targets = (
    await Promise.all(
      [...tables].map(async ([dir, entries]) => [
        [dir, GENERATED, entries.filter((e) => !e.excluded)] as const,
        [dir, EXCLUDED_GENERATED, entries.filter((e) => e.excluded && !e.table)] as const,
        ...[
          ...new Set([
            ...(SEPARATE_SUBPATH_ENTRIES[dir]
              ? [separateTable(SEPARATE_SUBPATH_ENTRIES[dir])]
              : []),
            ...entries.flatMap((e) => (e.table ? [e.table] : [])),
            ...(LAZY_DIRS[dir] ? await lazyTablesOnDisk(dir) : []),
          ]),
        ].map((table) => [dir, table, entries.filter((e) => e.table === table)] as const),
      ]),
    )
  ).flat();
  if (only === undefined || only === "ruby-compat") {
    const target = path.join(ROOT_DIR, "packages/ruby-compat/lib", GENERATED);
    const next = await prettier.format(renderCoreClassPaths(), {
      ...(await prettier.resolveConfig(target)),
      filepath: target,
    });
    if ((await fs.readFile(target, "utf8").catch(() => null)) !== next) {
      if (check) stale.push(path.relative(ROOT_DIR, target));
      else await fs.writeFile(target, next);
    }
    for (const row of await checkCoreSites()) {
      console.error(`CORE_CLASSES row's MRI site does not define the class: ${row}`);
      process.exitCode = 1;
    }
  }
  for (const [dir, table, entries] of targets) {
    const target = path.join(ROOT_DIR, "packages", dir, libRoot(dir), table);
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
    const entry =
      table === GENERATED && ENTRY_FIRST.has(dir)
        ? (await entryFile(path.join(ROOT_DIR, "packages", dir))).replace(/^\.\/dist\//, "")
        : undefined;
    const next = await prettier.format(renderClassPaths(entries, entry), {
      ...(await prettier.resolveConfig(target)),
      filepath: target,
    });
    const current = await fs.readFile(target, "utf8").catch(() => null);
    if (current === next) continue;
    if (check) stale.push(path.relative(ROOT_DIR, target));
    else await fs.writeFile(target, next);
  }
  if (check && unexportedModules.length > 0) {
    console.warn(
      `Modules paired with a Ruby module but with no exported binding (not gated):\n  ${unexportedModules.join("\n  ")}`,
    );
  }
  if (check && unexported.length > 0) {
    console.error(
      `Classes paired with a Ruby class but not exported, so no table can name them:\n  ${unexported.join("\n  ")}`,
    );
    process.exitCode = 1;
  }
  if (check) {
    for (const [dir, entries] of tables) {
      for (const file of await lazyFilesMissingTable(dir, entries)) {
        console.error(`${dir}/${libRoot(dir)}/${file} does not import its constant table`);
        process.exitCode = 1;
      }
      if (entries.length > 0) {
        const lazyOwners = entries.filter((e) => e.table).map((e) => `${e.fqn}::`);
        await checkSeatedPaths(
          dir,
          entries
            .filter((e) => !e.excluded && !e.table)
            .map((e) => e.fqn)
            .filter((fqn) => !lazyOwners.some((owner) => fqn.startsWith(owner))),
        );
      }
    }
    if (only === undefined || only === "ruby-compat") {
      await checkSeatedPaths(
        "ruby-compat",
        CORE_CLASSES.map(([p]) => p),
      );
    }
  }
  if (stale.length > 0) {
    console.error(
      `Stale constant tables — run \`pnpm parity:class-paths\`:\n  ${stale.join("\n  ")}`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
