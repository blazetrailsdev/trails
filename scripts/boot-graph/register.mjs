// Loaded with `node --import` ahead of the probe (RFC 0192,
// boot-graph-measurement-harness). `registerHooks` runs in-thread and
// synchronously, so the hook is live before the probe's first import, and the
// resolved set is written from an `exit` handler so a probe that never
// settles still reports.
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
