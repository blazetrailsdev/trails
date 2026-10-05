import { ExplainRegistry } from "./explain-registry.js";

export interface ExplainPayload {
  sql?: string;
  binds?: unknown[];
  name?: string;
  exception?: unknown;
  cached?: boolean;
  [key: string]: unknown;
}

export class ExplainSubscriber {
  static readonly IGNORED_PAYLOADS = ["SCHEMA", "EXPLAIN"];
  static readonly EXPLAINED_SQLS = /^\s*(\/\*.*\*\/)?\s*(with|select|update|delete|insert)\b/i;

  start(_name: unknown, _id: unknown, _payload: ExplainPayload): void {}

  finish(_name: unknown, _id: unknown, payload: ExplainPayload): void {
    if (ExplainRegistry.isCollect() && !this.ignorePayload(payload)) {
      ExplainRegistry.queries.push([payload.sql!, payload.binds ?? []]);
    }
  }

  ignorePayload(payload: ExplainPayload): boolean {
    return !!(
      payload.exception ||
      payload.cached ||
      ExplainSubscriber.IGNORED_PAYLOADS.includes(payload.name!) ||
      !ExplainSubscriber.EXPLAINED_SQLS.test(payload.sql!)
    );
  }
}
