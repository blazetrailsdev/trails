// Loaded with `--import`: records every GC and writes the log on SIGINT
// (RFC 0241, "Slim profile harness").
import { PerformanceObserver } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
const gc = [];
new PerformanceObserver((l) => {
  for (const e of l.getEntries())
    gc.push([Math.round(e.startTime), +e.duration.toFixed(2), e.detail?.kind ?? e.kind]);
}).observe({ entryTypes: ["gc"] });
const out = process.env.PROF_DIR ?? "/tmp";
process.on("SIGINT", () => {
  writeFileSync(`${out}/gc-${process.pid}.json`, JSON.stringify(gc));
  process.exit(0);
});
