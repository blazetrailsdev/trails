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

export async function watchViews(opts: WatchViewsOptions = {}): Promise<WatchHandle> {
  const cwd = opts.cwd ?? process.cwd();
  const viewsDir = path.resolve(cwd, opts.viewsDir ?? "app/views");
  const debounceMs = opts.debounceMs ?? 50;

  const touched = new Map<string, number>();
  const runBuild = async (
    trigger?: string,
    kind: "initial" | "change" = "change",
    changed: readonly string[] = [],
  ) => {
    try {
      const result = await buildViews(opts);
      const now = new Date();
      for (const name of changed) {
        touched.set(name, Date.now() + Math.max(debounceMs, 500));
        await fs.promises.utimes(path.join(viewsDir, name), now, now).catch((err: unknown) => {
          if ((err as { code?: string }).code !== "ENOENT") throw err;
        });
      }
      opts.onRebuild?.({ kind, trigger, result });
    } catch (err) {
      opts.onError?.(err instanceof Error ? err : new Error(String(err)), trigger);
    }
  };

  let building = runBuild(undefined, "initial");
  await building;
  await fs.promises.mkdir(viewsDir, { recursive: true });

  let pending: NodeJS.Timeout | null = null;
  let lastTrigger: string | undefined;
  let changed = new Set<string>();

  const tryWatch = (recursive: boolean): fs.FSWatcher =>
    fs.watch(viewsDir, { recursive }, (_event, filename) => onEvent(filename));
  const onEvent = (filename: string | Buffer | null): void => {
    if (filename === null) {
      lastTrigger = undefined;
    } else {
      const name = typeof filename === "string" ? filename : String(filename);
      if (!name.endsWith(".tse")) return;
      const trigger = name.split(path.sep).join("/");
      const until = touched.get(trigger);
      if (until !== undefined) {
        if (Date.now() <= until) return;
        touched.delete(trigger);
      }
      lastTrigger = trigger;
      changed.add(trigger);
    }
    if (pending !== null) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      const trig = lastTrigger;
      lastTrigger = undefined;
      const names = [...changed];
      changed = new Set();
      building = building.then(() => runBuild(trig, "change", names));
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
