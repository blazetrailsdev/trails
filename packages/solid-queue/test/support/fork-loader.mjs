import { getProcessAdapter } from "@blazetrails/ruby-compat";

const root = new URL("../../", import.meta.url).href;
const bundled = {
  [`${root}lib/processes/fork-entry.js`]: "fork-entry.js",
  [`${root}test/support/supervisor-fork-entry.js`]: "supervisor-fork-entry.js",
  [`${root}test/support/dummy/config/environment.ts`]: "environment.js",
};

getProcessAdapter().registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = new URL(specifier, context.parentURL ?? "file:///").href;
    if (Object.hasOwn(bundled, url)) {
      return nextResolve(`${root}node_modules/.cache/fork-bundle/${bundled[url]}`, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error?.code !== "ERR_MODULE_NOT_FOUND" || !specifier.endsWith(".js")) throw error;
      return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
    }
  },
});
