/**
 * The Ruby class-path table (RFC 0205, story
 * derive-class-path-from-registered-namespaces): one checked-in module per
 * package, `src/class-paths.generated.ts`, mapping each exported TS class or
 * module that `parity:api` pairs with a Ruby class or module to its `fqn` in
 * `output/rails-api.json`. ruby-compat's `rbModName` reads it after the
 * `classpaths` a `const_set` or a module-eval seat wrote, and before
 * `klass.name`.
 *
 *   pnpm parity:class-paths           # rewrite the tables
 *   pnpm parity:class-paths --check   # red on a stale table, or on a generated
 *                                     # path that disagrees with a seated one
 *   ... --check --package <pkg>       # one api-compare package, for the scoped CI driver
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
import {
  TOKEN_RENAMES,
  TS_CLASS_RENAMES,
  isRubyOnlyClass,
  rubyFileToTs,
} from "../parity/conventions.js";
import { isSourceUnported } from "@blazetrails/parity/unported-files";
import { resolveTsClassForRuby } from "./compare.js";
import { PACKAGE_DIR_OVERRIDES, ROOT_DIR, packageSrcDir } from "./config.js";
import type { ClassInfo } from "@blazetrails/parity/types";

const run = promisify(execFile);
const OUTPUT_DIR = path.join(ROOT_DIR, "scripts/api-compare/output");
const GENERATED = "class-paths.generated.ts";
/** The table for the classes in files the package build excludes, which those files import. */
const EXCLUDED_GENERATED = "class-paths.excluded.generated.ts";

/** The api-compare packages whose classes are not loaded from the package entry. */
const SKIPPED = new Set(["activerecord-test-support"]);

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
  /** The entry sits in a file the build excludes (`src/test-case.ts`), so its own table holds it. */
  excluded?: boolean;
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
 * The `TS_CLASS_RENAMES` a class path takes: `Railtie` is `Trailtie`. The
 * top-level `Rails` keeps its name, because a route's controller path
 * (`rails/info#index`) resolves `Rails::InfoController` through the name
 * `registerController` seats, and the others (`Name` is `ModelName`) dodge a
 * JS identifier and keep Ruby's path.
 */
const BRAND_RENAMES = ["Railtie", "Railties"];

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
    const srcRoot = path.join(ROOT_DIR, "packages", dir, "src");
    const subDir = path.relative(srcRoot, packageSrcDir(pkg));

    const paired = new Map<string, ClassPathEntry>();
    const modules = new Set<string>();
    const fallbackModules = new Set<string>();
    const ambiguous = new Set<string>();
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
        if (paired.has(key) && paired.get(key)!.fqn !== rubyPath) ambiguous.add(key);
        paired.set(key, { file, tsName: tsCls.name, fqn: rubyPath });
        if (kind === "modules") modules.add(key);
      }
    }

    const excluded = await tsconfigExcludes(dir);
    const reachable = await entryGraph(dir);
    const entries = byDir.get(dir) ?? [];
    const byFqn = new Map([...paired.values()].map((e) => [`${e.file}::${e.fqn}`, e]));
    const sources = new Map<string, string>();
    const read = async (file: string) =>
      sources.get(file) ??
      sources.set(file, await fs.readFile(path.join(srcRoot, file), "utf8")).get(file)!;
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
    for (const [key, entry] of paired) {
      if (ambiguous.has(key)) continue;
      const rel = path.join("src", entry.file);
      const ownTable = excluded.includes(rel);
      if (
        !ownTable &&
        excluded.some((glob) => path.matchesGlob(rel, glob) || rel.startsWith(`${glob}/`))
      ) {
        continue;
      }
      if (!ownTable && !reachable.has(entry.file)) continue;
      const source = await read(entry.file);
      const reached = await tsPath(entry);
      if (reached !== null) entries.push({ ...entry, tsName: reached, excluded: ownTable });
      else if (modules.has(key) && isSelfNamespace(source, entry.file, entry.tsName)) {
        entries.push({ ...entry, namespace: true });
      } else if (fallbackModules.has(key)) continue;
      else if (modules.has(key)) {
        unexportedModules.push(`${dir}/src/${entry.file}: ${entry.tsName} (${entry.fqn})`);
      } else unexported.push(`${dir}/src/${entry.file}: ${entry.tsName} (${entry.fqn})`);
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
    'import { registerClassPaths } from "./classpath.js";',
    ...files.map(
      (file) => `import * as ${alias.get(file)} from "./${file.replace(/\.ts$/, ".js")}";`,
    ),
    "",
    "registerClassPaths([",
    ...CORE_CLASSES.map(
      ([fqn, file, binding]) =>
        `  [() => ${file ? `${alias.get(file)}.` : ""}${binding}, ${JSON.stringify(fqn)}],`,
    ),
    "]);",
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const at = process.argv.indexOf("--package");
  const only = at === -1 ? undefined : process.argv[at + 1];
  const stale: string[] = [];
  const tables = await collectClassPaths(only);
  const targets = [...tables].flatMap(([dir, entries]) => [
    [dir, GENERATED, entries.filter((e) => !e.excluded)] as const,
    [dir, EXCLUDED_GENERATED, entries.filter((e) => e.excluded)] as const,
  ]);
  if (only === undefined || only === "ruby-compat") {
    const target = path.join(ROOT_DIR, "packages/ruby-compat/src", GENERATED);
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
    const target = path.join(ROOT_DIR, "packages", dir, "src", table);
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
