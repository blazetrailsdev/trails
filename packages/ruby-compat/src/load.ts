import { File } from "./file.js";
import { getPath } from "./fs-adapter.js";
import { LoadError } from "./load-error.js";
import { registerConstant } from "./variable.js";

let loads = 0;

/**
 * `rb_f_load` (`vendor/ruby/v3.3.11/load.c:903`), `Kernel#load`: evaluates
 * the file every time it is called, unlike `require`. ESM keeps one module
 * record per URL, so each load imports the file under a URL no earlier load
 * used. A Ruby file binds its top-level constants in `rb_cObject`
 * (`rb_const_set`, `vendor/ruby/v3.3.11/variable.c:3674`); an ES module
 * exports them, and each constant-named export is seated there.
 *
 * @noRailsEquivalent PERMANENT
 */
export async function rbFLoad(fname: string): Promise<true> {
  const { pathToFileURL } = getPath();
  if (pathToFileURL === undefined) throw new LoadError(`cannot load such file -- ${fname}`);
  const path = pathToFileURL(fname);
  path.search = `?${(loads += 1)}`;
  const exports = (await import(path.href)) as Record<string, unknown>;
  for (const [id, val] of Object.entries(exports)) {
    if (/^[\p{Lu}\p{Lt}]/u.test(id)) registerConstant(id, val);
  }
  return true;
}

/** @noRailsEquivalent PERMANENT — `$LOAD_PATH`, `vendor/ruby/v3.3.11/load.c:1593`. */
export const LOAD_PATH: string[] = [];
/** @noRailsEquivalent PERMANENT — `$"`, `vendor/ruby/v3.3.11/load.c:1606`. */
export const LOADED_FEATURES: string[] = [];

/**
 * `Kernel#require` of a file (`require_internal`,
 * `vendor/ruby/v3.3.11/load.c:1236`): searches `$LOAD_PATH` for
 * `feature.js` and loads it once. A miss raises `LoadError`.
 *
 * @noRailsEquivalent PERMANENT
 */
export async function rbFRequireFile(feature: string): Promise<boolean> {
  for (const path of LOAD_PATH) {
    const full = File.join(path, `${feature}.js`);
    if (!(await File.isExistAsync(full))) continue;
    if (LOADED_FEATURES.includes(full)) return false;
    await rbFLoad(full);
    LOADED_FEATURES.push(full);
    return true;
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
