import { LOADED_FEATURES, getPath } from "@blazetrails/ruby-compat";
import type { Cref } from "../cref.js";
import { Registry } from "../registry.js";

export async function require(path: string): Promise<boolean> {
  const loader = Registry.loaderFor(path);
  if (loader == null) return false;

  if (await loader.isRuby(path)) {
    const exports = (await import(getPath().pathToFileURL!(path).href)) as Record<string, unknown>;
    const required = !LOADED_FEATURES.includes(path);
    if (required) {
      LOADED_FEATURES.push(path);
      await loader.onFileAutoloaded(path, exports);
    }
    return required;
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
