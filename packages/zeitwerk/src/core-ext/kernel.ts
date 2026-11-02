import { LOADED_FEATURES, getPath, getProcessAdapter } from "@blazetrails/ruby-compat";
import type { Cref } from "../cref.js";
import { Registry } from "../registry.js";

/** @noRailsEquivalent PERMANENT */
const _requiring = new Map<string, Promise<void>>();

/** @noRailsEquivalent PERMANENT */
let _resolveHookInstalled = false;

export function _installResolveHook(): void {
  if (_resolveHookInstalled) return;
  _resolveHookInstalled = true;

  getProcessAdapter().registerHooks?.({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context);
      if (context.parentURL === undefined || !resolved.url.startsWith("file:")) return resolved;
      const generation = new URL(context.parentURL).searchParams.get("zeitwerk");
      if (generation === null) return resolved;

      const url = new URL(resolved.url);
      const path = decodeURIComponent(url.pathname);
      const reloadable = Registry.loaders.some(
        (loader) =>
          loader.isReloadingEnabled() &&
          !loader.isIgnores(path) &&
          Object.keys(loader.roots).some((rootDir) => path.startsWith(`${rootDir}/`)),
      );
      if (!reloadable) return resolved;

      url.searchParams.set("zeitwerk", generation);
      return { ...resolved, url: url.href };
    },
  });
}

export async function require(path: string): Promise<boolean> {
  const loader = Registry.loaderFor(path);
  if (loader == null) return false;

  if (await loader.isRuby(path)) {
    const loading = _requiring.get(path);
    if (loading !== undefined) {
      await loading;
      return false;
    }
    if (!Object.hasOwn(loader.autoloads, path)) return false;
    const load = (async () => {
      const url = getPath().pathToFileURL!(path);
      if (loader._generation > 1) url.searchParams.set("zeitwerk", String(loader._generation));
      const exports = (await import(url.href)) as Record<string, unknown>;
      LOADED_FEATURES.push(path);
      await loader.onFileAutoloaded(path, exports);
    })();
    _requiring.set(path, load);
    try {
      await load;
    } finally {
      _requiring.delete(path);
    }
    return true;
  } else {
    await loader.onDirAutoloaded(path);
    return true;
  }
}

/** @noRailsEquivalent PERMANENT */
export async function autoloadGet(cref: Cref): Promise<unknown> {
  const autoloadPath = cref.isAutoload();
  if (autoloadPath != null) await require(autoloadPath);
  return cref.get();
}
