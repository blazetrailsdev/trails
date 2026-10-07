import {
  attrInternal,
  Concern,
  extend,
  initialize,
  Module,
  pluralize,
  toF,
} from "@blazetrails/activesupport";
import * as RuntimeRegistry from "../runtime-registry.js";

interface ControllerRuntimeHost {
  dbRuntime: number | null;
  logger?: { "info?"?: boolean } | null;
}

interface ControllerClass {
  logProcessAction(payload: Record<string, unknown>): string[];
}

export function logProcessAction(
  this: ControllerClass,
  payload: Record<string, unknown>,
): string[] {
  const messages = ClassMethods.superMethod(this, "logProcessAction")!(payload) as string[];
  const dbRuntime = payload["db_runtime"];

  if (dbRuntime != null && dbRuntime !== false) {
    const queriesCount = (payload["queries_count"] as number | undefined) || 0;
    const cachedQueriesCount = (payload["cached_queries_count"] as number | undefined) || 0;
    messages.push(
      `ActiveRecord: ${toF(String(dbRuntime)).toFixed(1)}ms (${queriesCount} ` +
        `${pluralize("query", queriesCount)}, ${cachedQueriesCount} cached)`,
    );
  }

  return messages;
}

/** @internal */
export function processAction(
  this: ControllerRuntimeHost,
  action: string,
  ...args: unknown[]
): unknown {
  RuntimeRegistry.reset();
  return ControllerRuntime.superMethod(this, "processAction")!(action, ...args);
}

/** @internal */
export function cleanupViewRuntime<T>(this: ControllerRuntimeHost, block: () => T): T {
  if (this.logger?.["info?"]) {
    const dbRtBeforeRender = RuntimeRegistry.resetRuntimes();
    this.dbRuntime = (this.dbRuntime ?? 0) + dbRtBeforeRender;
    const runtime = ControllerRuntime.superMethod(this, "cleanupViewRuntime")!(block);
    const subtractQueries = (elapsed: number): number => {
      const queriesRt = RuntimeRegistry.sqlRuntime() - RuntimeRegistry.asyncSqlRuntime();
      const dbRtAfterRender = RuntimeRegistry.resetRuntimes();
      this.dbRuntime = (this.dbRuntime ?? 0) + dbRtAfterRender;
      return elapsed - queriesRt;
    };
    if (typeof (runtime as PromiseLike<number> | null)?.then === "function") {
      return Promise.resolve(runtime as PromiseLike<number>).then(subtractQueries) as T;
    }
    return subtractQueries(runtime as number) as T;
  } else {
    return ControllerRuntime.superMethod(this, "cleanupViewRuntime")!(block) as T;
  }
}

/** @internal */
export function appendInfoToPayload(
  this: ControllerRuntimeHost,
  payload: Record<string, unknown>,
): void {
  ControllerRuntime.superMethod(this, "appendInfoToPayload")!(payload);

  payload["db_runtime"] = (this.dbRuntime ?? 0) + RuntimeRegistry.resetRuntimes();
  payload["queries_count"] = RuntimeRegistry.resetQueriesCount();
  payload["cached_queries_count"] = RuntimeRegistry.resetCachedQueriesCount();
}

export const ClassMethods: Module = new Module((mod) => {
  mod.defineMethod("logProcessAction", logProcessAction);
});

export const ControllerRuntime = new Module((mod) => {
  extend(mod, Concern);

  (mod as unknown as Record<symbol, unknown>)[initialize] = function (
    this: ControllerRuntimeHost,
  ): void {
    this.dbRuntime = null;
  };

  mod.moduleEval((carrier) => attrInternal.call(carrier, "dbRuntime"));

  mod.defineMethod("processAction", processAction);
  mod.defineMethod("cleanupViewRuntime", cleanupViewRuntime);
  mod.defineMethod("appendInfoToPayload", appendInfoToPayload);
}) as Module & { ClassMethods: Module };
ControllerRuntime.ClassMethods = ClassMethods;
