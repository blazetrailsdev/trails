import { ExplainRegistry } from "./explain-registry.js";

export interface ExplainPayload {
  sql?: string;
  binds?: unknown[];
  name?: string;
  exception?: unknown;
  cached?: boolean;
  [key: string]: unknown;
}

/**
 * ActiveRecord::ExplainSubscriber — collects queries for EXPLAIN analysis.
 *
 * Subscribes to `sql.active_record` and pushes [sql, binds] pairs into
 * ExplainRegistry when collection is enabled.
 */
export class ExplainSubscriber {
  static readonly IGNORED_PAYLOADS = ["SCHEMA", "EXPLAIN"];
  static readonly EXPLAINED_SQLS = /^\s*(\/\*.*\*\/)?\s*(with|select|update|delete|insert)\b/i;

  start(_name: unknown, _id: unknown, _payload: ExplainPayload): void {
    // unused — matches Rails' no-op start
  }

  finish(_name: unknown, _id: unknown, payload: ExplainPayload): void {
    if (ExplainRegistry.collectEnabled() && !this.ignorePayload(payload)) {
      ExplainRegistry.queries.push([payload.sql!, payload.binds ?? []]);
    }
  }

  ignorePayload(payload: ExplainPayload): boolean {
    if (payload.exception) return true;
    if (payload.cached) return true;
    if (ExplainSubscriber.IGNORED_PAYLOADS.includes(payload.name ?? "")) return true;
    if (!payload.sql || !ExplainSubscriber.EXPLAINED_SQLS.test(payload.sql)) return true;
    return false;
  }
}
