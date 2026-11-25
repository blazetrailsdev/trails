import { Dir } from "./dir.js";
import { File } from "./file.js";
import { getPath } from "./fs-adapter.js";
import { LoadError } from "./load-error.js";
import { constSet } from "./include.js";
import { TopLevel, rbClassSuperclass } from "./object.js";
import { LOADED_FEATURES, loadingTable, rbFeatureProvided } from "./loaded-features.js";

export { LOADED_FEATURES, loadingTable, rbFeatureProvided };

let loads = 0;
const compiledFiles = new Map<string, () => Promise<unknown>>();
const loadedFiles = new Map<string, Record<string, unknown>>();
let importer: ((url: string) => Promise<unknown>) | null = null;

/**
 * Sets the import {@link loadIseqEval} (`load_iseq_eval`, `vendor/ruby/v3.3.11/load.c:744`) uses for a file no compiled build
 * registered, as `Zeitwerk::Loader#importer` is for an autoloaded file: under
 * vitest an application's own `import()` resolves in vite's graph, where this
 * package's resolves in Node's (zeitwerk CLAUDE.md, "Module#autoload is a build step").
 *
 * @noRailsEquivalent PERMANENT
 */
export function setLoadImporter(fn: ((url: string) => Promise<unknown>) | null): void {
  importer = fn;
}

/**
 * Registers the modules a compiled build bundled for files it cannot reach
 * through `import(url)`, in place of the read `load_iseq_eval`
 * (`vendor/ruby/v3.3.11/load.c:744`) makes: each key is resolved against `root`, and the first
 * {@link rbFLoad} of that path imports through its thunk (RFC 0224; CLAUDE.md
 * § "Constant lookup is an import or a registry"). Registration lasts for the
 * process, as `$LOADED_FEATURES` does; nothing unregisters a file.
 *
 * @noRailsEquivalent PERMANENT
 */
export function registerCompiledFiles(
  root: string,
  files: Record<string, () => Promise<unknown>>,
): void {
  for (const [rel, load] of Object.entries(files)) {
    compiledFiles.set(File.expandPath(rel, root), load);
  }
}

/**
 * `rb_file_exist_p` (`vendor/ruby/v3.3.11/file.c:1806`) for a file a compiled
 * build registered through {@link registerCompiledFiles} and ships no source
 * for, the existence {@link rbFRequireFile}'s search also reads.
 *
 * @noRailsEquivalent PERMANENT
 */
export function isCompiledFile(fname: string): boolean {
  const full = File.expandPath(fname);
  return (
    compiledFiles.has(full) ||
    (full.endsWith(".ts") && compiledFiles.has(`${full.slice(0, -3)}.js`))
  );
}

/**
 * `rb_file_exist_p` (`vendor/ruby/v3.3.11/file.c:1806`) of `fname`, else of
 * its `.js` sibling a compiled tree ships in its place.
 *
 * @noRailsEquivalent PERMANENT
 */
export function resolveTsThenJs(fname: string): string {
  if (!fname.endsWith(".ts") || isCompiledFile(fname) || File.isExist(fname)) return fname;
  const js = `${fname.slice(0, -3)}.js`;
  return isCompiledFile(js) || File.isExist(js) ? js : fname;
}

/**
 * `Dir.glob` (`vendor/ruby/v3.3.11/dir.c:3227`) of `dir` for the files a
 * compiled build registered through {@link registerCompiledFiles} and ships
 * no source for.
 *
 * @noRailsEquivalent PERMANENT
 */
export function compiledFilesIn(dir: string): string[] {
  const prefix = `${File.expandPath(dir)}/`;
  return [...compiledFiles.keys()].filter((full) => full.startsWith(prefix));
}

/**
 * The exports `load_iseq_eval` (`vendor/ruby/v3.3.11/load.c:744`) last
 * answered for `fname` through {@link loadIseqEval}, read where a Rails body
 * evaluates the file synchronously (`Mapper#draw`'s
 * `instance_eval(File.read(route_path))`) after an awaited step loaded it.
 * `undefined` for a file no load has reached.
 *
 * @noRailsEquivalent PERMANENT
 */
export function loadedFileExports(fname: string): Record<string, unknown> | undefined {
  return loadedFiles.get(File.expandPath(fname));
}

/**
 * `rb_f_load` (`vendor/ruby/v3.3.11/load.c:903`), `Kernel#load`: evaluates
 * the file every time it is called, unlike `require`. ESM keeps one module
 * record per URL, so each load imports the file under a URL no earlier load
 * used. A Ruby file binds its top-level constants in `rb_cObject`
 * (`rb_const_set`, `vendor/ruby/v3.3.11/variable.c:3674`); an ES module
 * exports them, and each constant-named export is seated there. A name that
 * is neither absolute nor explicitly relative is searched for in `$LOAD_PATH`
 * first (`rb_find_file`, `vendor/ruby/v3.3.11/file.c:6489-6533`).
 *
 * @noRailsEquivalent PERMANENT
 */
export async function rbFLoad(fname: string): Promise<true> {
  let path = fname;
  if (!/^(\/|\.\.?\/|~)/.test(fname)) {
    for (const str of LOAD_PATH) {
      const tmp = File.expandPath(fname, str);
      if (isCompiledFile(tmp) || (await File.isExistAsync(tmp))) {
        path = tmp;
        break;
      }
    }
  }
  const exports = await loadIseqEval(path, true);
  for (const [id, val] of Object.entries(exports)) {
    if (!/^[\p{Lu}\p{Lt}]/u.test(id)) continue;
    if (classDefined !== null && typeof val === "function") {
      const superclass = rbClassSuperclass(val);
      if (superclass !== null) classDefined(superclass, val);
    }
    constSet(TopLevel, id, val);
  }
  return true;
}

let classDefined: ((superclass: object, klass: object) => void) | null = null;

/**
 * Sets the record a class an {@link rbFLoad}ed file defines is added to under
 * its superclass, the list `rb_class_subclass_add`
 * (`vendor/ruby/v3.3.11/class.c:99`) keeps for `Class#subclasses` as a
 * class is created. JS has no hook at `class X extends Y`, so the class is
 * recorded where the file that defines it is evaluated.
 *
 * @noRailsEquivalent PERMANENT
 */
export function setClassDefinedHook(
  fn: ((superclass: object, klass: object) => void) | null,
): void {
  classDefined = fn;
}

/**
 * `load_iseq_eval` (`vendor/ruby/v3.3.11/load.c:744`), the evaluation
 * `Kernel#load` and `Kernel#require` share, answering the module's exports
 * rather than seating them: a caller that reads one file's own export
 * (`Mapper#draw`'s `drawRoutes`, a helper file whose short name another
 * namespace's helper also seats on `TopLevel`) cannot go through
 * {@link rbFLoad}, which answers `true`. A registered
 * {@link registerCompiledFiles} thunk answers the file. With `fresh`, the
 * `Kernel#load` arm, a path is evaluated again on every call after its
 * first, under a URL no earlier load used; without it, the `require` arm,
 * the module is evaluated once and its exports answered on every call.
 *
 * @noRailsEquivalent PERMANENT
 */
export async function loadIseqEval(fname: string, fresh = false): Promise<Record<string, unknown>> {
  const full = File.expandPath(fname);
  const compiled =
    fresh && loadedFiles.has(full) && (await File.isExistAsync(full))
      ? undefined
      : (compiledFiles.get(full) ??
        (full.endsWith(".ts") ? compiledFiles.get(`${full.slice(0, -3)}.js`) : undefined));
  let exports: Record<string, unknown>;
  try {
    if (compiled !== undefined) {
      exports = (await compiled()) as Record<string, unknown>;
    } else {
      const { pathToFileURL } = getPath();
      if (pathToFileURL === undefined) throw new LoadError(`cannot load such file -- ${fname}`);
      const path = pathToFileURL(fname);
      if (fresh) path.search = `?${(loads += 1)}`;
      exports = (await (importer !== null ? importer(path.href) : import(path.href))) as Record<
        string,
        unknown
      >;
    }
  } catch (e) {
    if ((e as { code?: unknown } | null)?.code !== "ERR_MODULE_NOT_FOUND") throw e;
    const missing = /Cannot find (?:module|package) '([^']+)'/.exec((e as Error).message);
    throw new LoadError(`cannot load such file -- ${missing?.[1] ?? fname}`);
  }
  loadedFiles.set(full, exports);
  return exports;
}

/** @noRailsEquivalent PERMANENT — `$LOAD_PATH`, `vendor/ruby/v3.3.11/load.c:1593`. */
export const LOAD_PATH: string[] = [];

const loadableExt = [".js", ".ts"];

/**
 * `Kernel#require` of a file (`require_internal`,
 * `vendor/ruby/v3.3.11/load.c:1236`): searches `$LOAD_PATH` for
 * `feature.js`, then `feature.ts`, and loads it once. A feature that
 * already ends in a source extension is searched as given
 * (`search_required`'s `IS_RBEXT` arm, `vendor/ruby/v3.3.11/load.c:1058-1072`).
 * A miss raises `LoadError`.
 *
 * @noRailsEquivalent PERMANENT
 */
export async function rbFRequireFile(feature: string): Promise<boolean> {
  const explicit = /^(\/|\.\.?\/|~)/.test(feature);
  const hasExt = feature.endsWith(".js") || feature.endsWith(".ts");
  for (const path of explicit ? [Dir.pwd()] : LOAD_PATH) {
    for (const ext of hasExt ? [""] : loadableExt) {
      const full = File.expandPath(`${feature}${ext}`, path);
      if (!isCompiledFile(full) && !(await File.isExistAsync(full))) continue;
      if (rbFeatureProvided(full)) return false;
      loadingTable.add(full);
      try {
        await rbFLoad(full);
      } finally {
        loadingTable.delete(full);
      }
      LOADED_FEATURES.push(full);
      return true;
    }
  }
  const error = new LoadError(`cannot load such file -- ${feature}`);
  error.path = feature;
  throw error;
}

const loadedFeatures = new Map<string, Record<string, unknown>>();
const loadFailures = new Map<string, LoadError>();

/**
 * `rb_f_require` (`vendor/ruby/v3.3.11/load.c:1022`), `Kernel#require`,
 * over a namespace `loadPath` table. ESM has no synchronous load, so this is
 * the awaited step that loads `feature` once (CLAUDE.md § "An adapter file is
 * loaded by an awaited step"); {@link rbRequireLoaded} then answers it
 * synchronously. A miss raises `LoadError` whose `path` is `feature`, and a
 * dependency the file cannot load raises one whose `path` is that module's.
 * The failure is kept, so the synchronous read raises it again.
 *
 * @noRailsEquivalent PERMANENT
 */
export async function rbFRequire(
  loadPath: Record<string, (() => Promise<unknown>) | undefined>,
  feature: string,
): Promise<boolean> {
  if (loadedFeatures.has(feature)) return false;
  const load = loadPath[feature];
  try {
    if (load === undefined) {
      const error = new LoadError(`cannot load such file -- ${feature}`);
      error.path = feature;
      throw error;
    }
    try {
      loadedFeatures.set(feature, (await load()) as Record<string, unknown>);
    } catch (e) {
      if ((e as { code?: unknown }).code !== "ERR_MODULE_NOT_FOUND") throw e;
      const error = new LoadError((e as Error).message, { cause: e });
      error.path = (e as { url?: string }).url ?? null;
      throw error;
    }
  } catch (e) {
    if (e instanceof LoadError) loadFailures.set(feature, e);
    throw e;
  }
  loadFailures.delete(feature);
  return true;
}

/**
 * The synchronous half of {@link rbFRequire}, a read of the features
 * `rb_feature_provided` (`vendor/ruby/v3.3.11/load.c:695`) consults: the exports of a feature it
 * loaded, or the `LoadError` it raised, or one whose `path` is `feature` when
 * the load step has not run.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbRequireLoaded(feature: string): Record<string, unknown> {
  const exports = loadedFeatures.get(feature);
  if (exports !== undefined) return exports;
  const failure = loadFailures.get(feature);
  if (failure !== undefined) throw failure;
  const error = new LoadError(`cannot load such file -- ${feature}`);
  error.path = feature;
  throw error;
}
