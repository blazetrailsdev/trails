import { LOADED_FEATURES, getPath } from "@blazetrails/ruby-compat";
import type { Cref } from "../cref.js";
import { Registry } from "../registry.js";

/** @noRailsEquivalent PERMANENT */
const _requiring = new Map<string, Promise<void>>();

export async function require(path: string): Promise<boolean> {
  const loader = Registry.loaderFor(path);
  if (loader == null) return false;

  if (await loader.isRuby(path)) {
    const loading = _requiring.get(path);
    if (loading !== undefined) {
      await loading;
      return false;
    }
    const load = (async () => {
      const exports = (await import(getPath().pathToFileURL!(path).href)) as Record<
        string,
        unknown
      >;
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
