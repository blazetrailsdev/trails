import { TopLevel } from "@blazetrails/ruby-compat";
import * as Zeitwerk from "./zeitwerk.js";
import { Loader } from "./loader.js";
import "./constants.generated.js";

export { Inflector } from "./inflector.js";
export { NullInflector } from "./null-inflector.js";
export { Error, NameError, ReloadingDisabledError, SetupRequired } from "./error.js";
export { Cref } from "./cref.js";
export { Loader } from "./loader.js";
export { Registry } from "./registry.js";
export { Internal } from "./internal.js";
export {
  buildManifest,
  configurationDigest,
  manifestRoot,
  writeArtifacts,
  type Manifest,
  type ManifestRow,
} from "./loader/manifest.js";

export async function withLoader(block: (loader: Loader) => unknown): Promise<void> {
  const loader = new Loader();
  try {
    await block(loader);
  } finally {
    loader.unregister();
  }
}

TopLevel.Zeitwerk = Zeitwerk;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Zeitwerk?: typeof Zeitwerk;
  }
}
