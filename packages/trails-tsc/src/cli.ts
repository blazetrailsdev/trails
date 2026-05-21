#!/usr/bin/env node
/**
 * `trails-tsc-views` CLI entrypoint. Phase 2c-a ships the `build`
 * subcommand only; `dev` (watch) is 2c-b and `init` is 2c-c.
 *
 * Named `trails-tsc-views` (not `trails-tsc`) because activerecord
 * already publishes a `trails-tsc` bin — its tsc-passthrough wrapper
 * for AR model virtualization (packages/activerecord/bin/trails-tsc.js).
 * Unifying the two CLIs under a single `trails-tsc` is tracked as a
 * follow-up; not in scope for Phase 2c.
 */

import { pathToFileURL } from "node:url";
import { buildViews, type BuildViewsOptions } from "./build-views.js";

const USAGE = "usage: trails-tsc-views build [--cwd <dir>] [--views <dir>] [--out <dir>]\n";

const VALUE_FLAGS = new Set(["--cwd", "--views", "--out"]);

export function runCli(argv: readonly string[]): number {
  const cmd = argv[0];
  if (cmd === undefined || cmd === "--help" || cmd === "-h") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (cmd !== "build") {
    process.stderr.write(`trails-tsc-views: unknown command ${JSON.stringify(cmd)}\n${USAGE}`);
    return 1;
  }
  const opts: BuildViewsOptions = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (VALUE_FLAGS.has(a)) {
      const v = argv[i + 1];
      if (v === undefined) {
        process.stderr.write(`trails-tsc-views: ${a} requires a value\n${USAGE}`);
        return 1;
      }
      if (a === "--cwd") opts.cwd = v;
      else if (a === "--views") opts.viewsDir = v;
      else opts.outDir = v;
      i++;
      continue;
    }
    process.stderr.write(`trails-tsc-views: unknown arg ${JSON.stringify(a)}\n${USAGE}`);
    return 1;
  }
  try {
    const { count } = buildViews(opts);
    process.stdout.write(`trails-tsc-views: built ${count} view${count === 1 ? "" : "s"}\n`);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`trails-tsc-views: ${msg}\n`);
    return 1;
  }
}

// Skip auto-exec when imported (e.g. from tests). `import.meta.url` is the
// invoked module only when run as the program entrypoint.
// Compare module URL to argv[1] via `pathToFileURL` so Windows paths and
// URL-encoded chars don't trip a naive `file://` string compare.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  process.exit(runCli(process.argv.slice(2)));
}
