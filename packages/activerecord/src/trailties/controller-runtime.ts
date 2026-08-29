import * as RuntimeRegistry from "../runtime-registry.js";

interface ControllerRuntimeHost {
  dbRuntime: number | null;
  logger?: { "info?"?: boolean } | null;
}

/** @internal */
export function processAction(
  this: ControllerRuntimeHost,
  _action: string,
  ..._args: unknown[]
): void {
  RuntimeRegistry.reset();
}

/** @internal */
export function cleanupViewRuntime(this: ControllerRuntimeHost): number {
  if (this.logger?.["info?"]) {
    const s = RuntimeRegistry.stats();
    const dbRtBeforeRender = s.resetRuntimes();
    this.dbRuntime = (this.dbRuntime ?? 0) + dbRtBeforeRender;
    const runtime = 0;
    const queriesRt = s.sqlRuntime - s.asyncSqlRuntime;
    const dbRtAfterRender = s.resetRuntimes();
    this.dbRuntime += dbRtAfterRender;
    return runtime - queriesRt;
  }
  return 0;
}

/** @internal */
export function appendInfoToPayload(
  this: ControllerRuntimeHost,
  payload: Record<string, unknown>,
): void {
  payload["dbRuntime"] = (this.dbRuntime ?? 0) + RuntimeRegistry.stats().resetRuntimes();
  payload["queriesCount"] = RuntimeRegistry.resetQueriesCount();
  payload["cachedQueriesCount"] = RuntimeRegistry.resetCachedQueriesCount();
}

export const ControllerRuntime = { processAction, cleanupViewRuntime, appendInfoToPayload };
