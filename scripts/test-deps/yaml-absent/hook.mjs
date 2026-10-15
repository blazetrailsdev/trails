// Makes the optional `yaml` package unresolvable for both `import` and
// `require` (ruby-compat's psych-adapter loads it through `createRequire`).
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "yaml" || specifier.startsWith("yaml/")) {
      const error = new Error(`Cannot find package '${specifier}'`);
      error.code = specifier.startsWith("yaml/") ? "ERR_MODULE_NOT_FOUND" : "MODULE_NOT_FOUND";
      throw error;
    }
    return nextResolve(specifier, context);
  },
});
