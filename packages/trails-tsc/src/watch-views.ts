/** `trails-tsc-views dev` core — Phase 2c-b (plan §2). Full rebuild on each
 * `.tse` event keeps deletes + renames working without per-file bookkeeping. */

import * as fs from "node:fs";
import * as path from "node:path";
import { buildViews, type BuildViewsOptions, type BuildViewsResult } from "./build-views.js";

export interface WatchViewsOptions extends BuildViewsOptions {
  onRebuild?: (event: {
    kind: "initial" | "change";
    trigger?: string;
    result: BuildViewsResult;
  }) => void;
  onError?: (err: Error, trigger?: string) => void;
  /** Coalesce-window in ms for bursts of fs events. Default 50. */
  debounceMs?: number;
}

export interface WatchHandle {
  close(): void;
}

export function watchViews(opts: WatchViewsOptions = {}): WatchHandle {
  const cwd = opts.cwd ?? process.cwd();
  const viewsDir = path.resolve(cwd, opts.viewsDir ?? "app/views");
  const debounceMs = opts.debounceMs ?? 50;

  const runBuild = (trigger?: string, kind: "initial" | "change" = "change"): void => {
    try {
      const result = buildViews(opts);
      opts.onRebuild?.({ kind, trigger, result });
    } catch (err) {
      opts.onError?.(err instanceof Error ? err : new Error(String(err)), trigger);
    }
  };

  runBuild(undefined, "initial");
  // fs.watch needs an extant dir; create so `dev` works before any templates exist.
  fs.mkdirSync(viewsDir, { recursive: true });

  let pending: NodeJS.Timeout | null = null;
  let lastTrigger: string | undefined;

  // Node 20+ supports `recursive` on Linux/macOS/Windows, but some
  // FUSE / network mounts still reject it. Fall back to a non-recursive
  // watch on the views root rather than failing the whole `dev` command;
  // top-level edits still trigger rebuilds, just not nested subdirs.
  const tryWatch = (recursive: boolean): fs.FSWatcher =>
    fs.watch(viewsDir, { recursive }, (_event, filename) => onEvent(filename));
  const onEvent = (filename: string | Buffer | null): void => {
    // Some platforms/filesystems (older Windows, certain network mounts)
    // emit a null filename. We can't filter by extension, but the cheap
    // full rebuild remains correct — schedule with an unknown trigger so
    // deletes/renames on those hosts still propagate.
    if (filename === null) {
      // Unknown trigger — overwrite any stale value from a prior event
      // so the rebuild message doesn't misattribute the source.
      lastTrigger = undefined;
    } else {
      const name = typeof filename === "string" ? filename : String(filename);
      if (!name.endsWith(".tse")) return;
      lastTrigger = name.split(path.sep).join("/");
    }
    if (pending !== null) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      const trig = lastTrigger;
      lastTrigger = undefined;
      runBuild(trig);
    }, debounceMs);
  };

  let watcher: fs.FSWatcher;
  try {
    watcher = tryWatch(true);
  } catch {
    watcher = tryWatch(false);
  }
  // `fs.watch` can emit `error` after creation (dir removed, perms
  // revoked, EMFILE). Without a listener it becomes an unhandled
  // exception that crashes `dev`. Surface it through `onError`.
  watcher.on("error", (err) => opts.onError?.(err instanceof Error ? err : new Error(String(err))));

  return {
    close() {
      if (pending !== null) {
        clearTimeout(pending);
        pending = null;
      }
      watcher.close();
    },
  };
}
