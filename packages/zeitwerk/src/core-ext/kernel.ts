import { LOADED_FEATURES, getPath } from "@blazetrails/ruby-compat";
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
