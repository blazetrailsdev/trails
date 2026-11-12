import {
  IsolatedExecutionState,
  Notifications,
  type NotificationEvent,
} from "@blazetrails/activesupport";

export function sqlRuntime(): number {
  return (
    IsolatedExecutionState.get<number>("active_record_sql_runtime") ??
    IsolatedExecutionState.set("active_record_sql_runtime", 0.0)
  );
}

export function setSqlRuntime(runtime: number): void {
  IsolatedExecutionState.set("active_record_sql_runtime", runtime);
}

export function asyncSqlRuntime(): number {
  return (
    IsolatedExecutionState.get<number>("active_record_async_sql_runtime") ??
    IsolatedExecutionState.set("active_record_async_sql_runtime", 0.0)
  );
}

export function setAsyncSqlRuntime(runtime: number): void {
  IsolatedExecutionState.set("active_record_async_sql_runtime", runtime);
}

export function queriesCount(): number {
  return (
    IsolatedExecutionState.get<number>("active_record_queries_count") ??
    IsolatedExecutionState.set("active_record_queries_count", 0)
  );
}

export function setQueriesCount(count: number): void {
  IsolatedExecutionState.set("active_record_queries_count", count);
}

export function cachedQueriesCount(): number {
  return (
    IsolatedExecutionState.get<number>("active_record_cached_queries_count") ??
    IsolatedExecutionState.set("active_record_cached_queries_count", 0)
  );
}

export function setCachedQueriesCount(count: number): void {
  IsolatedExecutionState.set("active_record_cached_queries_count", count);
}

export function reset(): void {
  resetRuntimes();
  resetQueriesCount();
  resetCachedQueriesCount();
}

export function resetRuntimes(): number {
  const rt = sqlRuntime();
  setSqlRuntime(0.0);
  setAsyncSqlRuntime(0.0);
  return rt;
}

export function resetQueriesCount(): number {
  const qc = queriesCount();
  setQueriesCount(0);
  return qc;
}

export function resetCachedQueriesCount(): number {
  const qc = cachedQueriesCount();
  setCachedQueriesCount(0);
  return qc;
}

Notifications.monotonicSubscribe("sql.active_record", (event: NotificationEvent) => {
  const payload = event.payload;
  if (!["SCHEMA", "TRANSACTION"].includes(payload.name as string)) {
    setQueriesCount(queriesCount() + 1);
    if (payload.cached) setCachedQueriesCount(cachedQueriesCount() + 1);
  }

  const runtime = event.duration;

  if (payload.async) {
    setAsyncSqlRuntime(asyncSqlRuntime() + (runtime - (payload.lockWait as number)));
  }
  setSqlRuntime(sqlRuntime() + runtime);
});
