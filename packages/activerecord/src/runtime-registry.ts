import { Notifications, type NotificationEvent } from "@blazetrails/activesupport";

/** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
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

/** @noRailsEquivalent CONVERGEABLE converge-activerecord-remainder-moved-relocations */
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

Notifications.monotonicSubscribe("sql.active_record", (event: NotificationEvent) => {
  const payload = event.payload;
  if (!["SCHEMA", "TRANSACTION"].includes(payload.name as string)) {
    getStats().queriesCount += 1;
    if (payload.cached) getStats().cachedQueriesCount += 1;
  }

  const runtime = event.duration;

  if (payload.async) {
    getStats().asyncSqlRuntime += runtime - (payload.lockWait as number);
  }
  getStats().sqlRuntime += runtime;
});
