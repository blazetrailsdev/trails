/**
 * ControllerRuntime — instruments ActionController with ActiveRecord SQL runtime
 * tracking per request.
 *
 * Mirrors: ActiveRecord::Railties::ControllerRuntime (railties/controller_runtime.rb)
 *
 * Mix this into an ActionController::Base subclass to:
 *   - Reset the SQL runtime before each action (`processAction`).
 *   - Exclude DB time from the reported view-render time (`cleanupViewRuntime`).
 *   - Append `:dbRuntime`, `:queriesCount`, `:cachedQueriesCount` to the
 *     instrumentation payload (`appendInfoToPayload`).
 *
 * ActionController integration is not yet ported; the functions are exported
 * so they can be wired when it lands.
 */
import * as RuntimeRegistry from "../runtime-registry.js";

interface ControllerRuntimeHost {
  dbRuntime: number | null;
  /** Rails `logger.info?` predicate; in this codebase it is a boolean getter on Logger. */
  logger?: { "info?"?: boolean } | null;
}

/**
 * Resets the SQL runtime registry before each controller action so middleware
 * queries from a previous request don't pollute the current request's metrics.
 *
 * Mirrors: ActiveRecord::Railties::ControllerRuntime#process_action
 * @internal
 */
export function processAction(
  this: ControllerRuntimeHost,
  _action: string,
  ..._args: unknown[]
): void {
  RuntimeRegistry.reset();
}

/**
 * Overrides ActionView's `cleanup_view_runtime` to subtract DB time from the
 * reported view render time. Accumulates `:dbRuntime` on the controller.
 *
 * Rails structure: reset → super (view renders, may run queries) → read queriesRt →
 * reset again → return (viewRenderTime - queriesRt). Without ActionView, the
 * view render time is 0 and no queries run between the resets, so queriesRt = 0
 * and the return value is 0. The `runtime` placeholder sits where ActionView's
 * super call will go; `queriesRt` is read after it so it captures render-time
 * queries once that integration lands.
 *
 * Mirrors: ActiveRecord::Railties::ControllerRuntime#cleanup_view_runtime
 * @internal
 */
export function cleanupViewRuntime(this: ControllerRuntimeHost): number {
  if (this.logger?.["info?"]) {
    const s = RuntimeRegistry.stats();
    const dbRtBeforeRender = s.resetRuntimes();
    this.dbRuntime = (this.dbRuntime ?? 0) + dbRtBeforeRender;
    const runtime = 0; // ACTION_VIEW: replace with super() call here
    const queriesRt = s.sqlRuntime - s.asyncSqlRuntime;
    const dbRtAfterRender = s.resetRuntimes();
    this.dbRuntime += dbRtAfterRender;
    return runtime - queriesRt;
  }
  return 0;
}

/**
 * Appends `:dbRuntime`, `:queriesCount`, and `:cachedQueriesCount` to the
 * `process_action.action_controller` instrumentation payload.
 *
 * Event: `process_action.action_controller`
 *
 * Mirrors: ActiveRecord::Railties::ControllerRuntime#append_info_to_payload
 * @internal
 */
export function appendInfoToPayload(
  this: ControllerRuntimeHost,
  payload: Record<string, unknown>,
): void {
  payload["dbRuntime"] = (this.dbRuntime ?? 0) + RuntimeRegistry.stats().resetRuntimes();
  payload["queriesCount"] = RuntimeRegistry.resetQueriesCount();
  payload["cachedQueriesCount"] = RuntimeRegistry.resetCachedQueriesCount();
}

/**
 * Mirrors: ActiveRecord::Railties::ControllerRuntime
 */
export const ControllerRuntime = { processAction, cleanupViewRuntime, appendInfoToPayload };
