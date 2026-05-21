#!/usr/bin/env node
/**
 * `trails-tsc-views` CLI entrypoint. Phase 2c-a shipped `build`;
 * Phase 2c-b adds `dev` (watch mode). `init` is deferred to 2c-c.
 *
 * Named `trails-tsc-views` (not `trails-tsc`) because activerecord
 * already publishes a `trails-tsc` bin — its tsc-passthrough wrapper
 * for AR model virtualization (packages/activerecord/bin/trails-tsc.js).
 * Unifying the two CLIs under a single `trails-tsc` is tracked as a
 * follow-up; not in scope for Phase 2c.
 */

import { pathToFileURL } from "node:url";
import { buildViews, type BuildViewsOptions } from "./build-views.js";
import { watchViews, type WatchHandle } from "./watch-views.js";

const USAGE = "usage: trails-tsc-views <build|dev> [--cwd <dir>] [--views <dir>] [--out <dir>]\n";

const VALUE_FLAGS = new Set(["--cwd", "--views", "--out"]);

export function runCli(argv: readonly string[]): number {
  const cmd = argv[0];
  if (cmd === undefined || cmd === "--help" || cmd === "-h") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (cmd !== "build" && cmd !== "dev") {
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
  if (cmd === "build") {
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
  // `dev`: process stays alive on the open fs.watch handle; SIGINT/SIGTERM
  // close cleanly. The initial `buildViews` runs synchronously inside
  // `watchViews`, so capturing its failure via `onError` lets us exit
  // non-zero before the watcher takes over the event loop.
  let initialErr: Error | null = null;
  let started = false;
  let handle: WatchHandle;
  try {
    handle = watchViews({
      ...opts,
      onRebuild: ({ kind, trigger, result }) =>
        process.stdout.write(
          `trails-tsc-views: ${kind === "initial" ? "initial build" : `rebuilt (${trigger ?? "?"})`} — ${result.count} view${result.count === 1 ? "" : "s"}\n`,
        ),
      onError: (err, trigger) => {
        if (!started) initialErr = err;
        process.stderr.write(`trails-tsc-views: ${trigger ?? "build"}: ${err.message}\n`);
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`trails-tsc-views: ${msg}\n`);
    return 1;
  }
  started = true;
  if (initialErr !== null) {
    handle.close();
    return 1;
  }
  const stop = (): void => {
    handle.close();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return 0;
}

// Skip auto-exec when imported (e.g. from tests). `import.meta.url` is the
// invoked module only when run as the program entrypoint.
// Compare module URL to argv[1] via `pathToFileURL` so Windows paths and
// URL-encoded chars don't trip a naive `file://` string compare.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  const argv = process.argv.slice(2);
  const rc = runCli(argv);
  // `dev` registers SIGINT/SIGTERM handlers and returns 0; calling
  // `process.exit` here would tear down the watcher immediately. The
  // open fs.watch handle keeps the event loop alive on its own —
  // only exit explicitly for one-shot commands.
  if (argv[0] !== "dev") process.exit(rc);
  else if (rc !== 0) process.exit(rc);
}
