/**
 * Canonical process-wide QueryLogs instance and its ExecutionContext wiring.
 *
 * Rails models QueryLogs as a module — a single global configuration object —
 * and registers a cache-invalidation hook against ExecutionContext at load
 * time (query_logs.rb:163):
 *
 *   ActiveSupport::ExecutionContext.after_change { ActiveRecord::QueryLogs.clear_cache }
 *
 * trails models QueryLogs as a class, so we expose one shared instance here and
 * register the same hook. Whenever the execution context changes, the cached
 * SQL comment is invalidated so the next query recomputes its tags.
 */

import { ExecutionContext } from "@blazetrails/activesupport";
import { QueryLogs } from "./query-logs.js";

export const queryLogs = new QueryLogs();

ExecutionContext.afterChange(() => {
  queryLogs.clearCache();
});
