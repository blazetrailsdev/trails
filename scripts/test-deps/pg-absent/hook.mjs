import { registerHooks } from "node:module";

const HIDDEN = ["pg", "@blazetrails/pg"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (HIDDEN.some((name) => specifier === name || specifier.startsWith(`${name}/`))) {
      const error = new Error(`Cannot find package '${specifier}'`);
      error.code = "ERR_MODULE_NOT_FOUND";
      throw error;
    }
    return nextResolve(specifier, context);
  },
});
