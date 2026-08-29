import { Notifications, type NotificationEvent } from "@blazetrails/activesupport";

export class Stats {
  sqlRuntime = 0.0;
  asyncSqlRuntime = 0.0;
  queriesCount = 0;
  cachedQueriesCount = 0;

  resetRuntimes(): number {
    const was = this.sqlRuntime;
    this.sqlRuntime = 0.0;
    this.asyncSqlRuntime = 0.0;
    return was;
  }

  reset(): void {
    this.sqlRuntime = 0.0;
    this.asyncSqlRuntime = 0.0;
    this.queriesCount = 0;
    this.cachedQueriesCount = 0;
  }
}

let _stats: Stats | null = null;

function getStats(): Stats {
  if (!_stats) _stats = new Stats();
  return _stats;
}

export function record(
  queryName: string | undefined,
  runtime: number,
  options: { cached?: boolean; async?: boolean; lockWait?: number } = {},
): void {
  const s = getStats();

  if (queryName !== "TRANSACTION" && queryName !== "SCHEMA") {
    s.queriesCount += 1;
    if (options.cached) s.cachedQueriesCount += 1;
  }

  if (options.async) {
    s.asyncSqlRuntime += runtime - (options.lockWait ?? 0);
  }
  s.sqlRuntime += runtime;
}

export function stats(): Stats {
  return getStats();
}

export function reset(): void {
  getStats().reset();
}

export function resetQueriesCount(): number {
  const s = getStats();
  const was = s.queriesCount;
  s.queriesCount = 0;
  return was;
}

export function resetCachedQueriesCount(): number {
  const s = getStats();
  const was = s.cachedQueriesCount;
  s.cachedQueriesCount = 0;
  return was;
}

Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
  record(event.payload.name as string | undefined, event.duration, {
    cached: event.payload.cached as boolean | undefined,
    async: event.payload.async as boolean | undefined,
    lockWait: event.payload.lockWait as number | undefined,
  });
});
