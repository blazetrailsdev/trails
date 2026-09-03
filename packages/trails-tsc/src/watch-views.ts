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
  fs.mkdirSync(viewsDir, { recursive: true });

  let pending: NodeJS.Timeout | null = null;
  let lastTrigger: string | undefined;

  const tryWatch = (recursive: boolean): fs.FSWatcher =>
    fs.watch(viewsDir, { recursive }, (_event, filename) => onEvent(filename));
  const onEvent = (filename: string | Buffer | null): void => {
    if (filename === null) {
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
