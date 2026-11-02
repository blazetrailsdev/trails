import { Loader } from "./loader.js";
import "./class-paths.generated.js";

export { GemInflector } from "./gem-inflector.js";
export { Inflector } from "./inflector.js";
export { NullInflector } from "./null-inflector.js";
export { Error, NameError, ReloadingDisabledError, SetupRequired } from "./error.js";
export { Cref } from "./cref.js";
export { Loader } from "./loader.js";
export { GemLoader } from "./gem-loader.js";
export { Registry } from "./registry.js";
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
