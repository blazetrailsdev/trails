import { registerHooks } from "node:module";
import { writeFileSync } from "node:fs";

const urls = new Set();
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    urls.add(result.url);
    return result;
  },
});

process.on("exit", () => {
  writeFileSync(process.env.BOOT_GRAPH_OUT, JSON.stringify([...urls]));
});
