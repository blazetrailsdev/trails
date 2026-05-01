// Worker bootstrap. Registers tsx's ESM loader so the worker can
// resolve .ts files (the parent's tsx registration doesn't propagate
// to child threads), then imports the main extractor module. The
// `!isMainThread` guard at the top of extract-ts-api.ts dispatches
// the worker into extractPackage and posts the result back.
import { register } from "tsx/esm/api";
register();
await import("./extract-ts-api.ts");
