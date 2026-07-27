// Side-effect module: register the encryption namespace and install the
// standard test key config. Imported for its side effect *before* the canonical
// models barrel so encrypted models (which derive key material at module-eval
// time) are loadable. Kept separate because ESM hoists all `import`s ahead of
// top-level statements — the config must run in a module evaluated before the
// barrel, not as a statement wedged between imports in the same file.
import "../encryption.js";
import { configureEncryption } from "../encryption/test-helpers.js";

configureEncryption();
