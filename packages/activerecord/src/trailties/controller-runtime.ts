import { included, pluralize, toF } from "@blazetrails/activesupport";
import * as RuntimeRegistry from "../runtime-registry.js";

interface ControllerRuntimeHost {
  dbRuntime: number | null;
  logger?: { "info?"?: boolean } | null;
}

interface ControllerRuntimeSuper {
  processAction(action: string, ...args: unknown[]): unknown;
  cleanupViewRuntime<T>(block: () => T): T;
  appendInfoToPayload(payload: Record<string, unknown>): void;
  logProcessAction(payload: Record<string, unknown>): string[];
}

const supers = new WeakMap<object, ControllerRuntimeSuper>();

function superOf(receiver: object): ControllerRuntimeSuper {
  for (let link = Object.getPrototypeOf(receiver); link; link = Object.getPrototypeOf(link)) {
    const captured = supers.get(link);
    if (captured) return captured;
  }
  return supers.get(receiver)!;
}

interface ControllerClass {
  prototype: object;
  logProcessAction(payload: Record<string, unknown>): string[];
}

export function logProcessAction(
  this: ControllerClass,
  payload: Record<string, unknown>,
): string[] {
  const messages = superOf(this).logProcessAction.call(this, payload);
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
  return superOf(this).processAction.call(this, action, ...args);
}

/** @internal */
export function cleanupViewRuntime<T>(this: ControllerRuntimeHost, block: () => T): T {
  if (this.logger?.["info?"]) {
    const s = RuntimeRegistry.stats();
    const dbRtBeforeRender = s.resetRuntimes();
    this.dbRuntime = (this.dbRuntime ?? 0) + dbRtBeforeRender;
    const runtime = superOf(this).cleanupViewRuntime.call(this, block);
    const subtractQueries = (elapsed: number): number => {
      const queriesRt = s.sqlRuntime - s.asyncSqlRuntime;
      const dbRtAfterRender = s.resetRuntimes();
      this.dbRuntime = (this.dbRuntime ?? 0) + dbRtAfterRender;
      return elapsed - queriesRt;
    };
    if (typeof (runtime as PromiseLike<number> | null)?.then === "function") {
      return Promise.resolve(runtime as PromiseLike<number>).then(subtractQueries) as T;
    }
    return subtractQueries(runtime as number) as T;
  } else {
    return superOf(this).cleanupViewRuntime.call(this, block) as T;
  }
}

/** @internal */
export function appendInfoToPayload(
  this: ControllerRuntimeHost,
  payload: Record<string, unknown>,
): void {
  superOf(this).appendInfoToPayload.call(this, payload);

  payload["db_runtime"] = (this.dbRuntime ?? 0) + RuntimeRegistry.stats().resetRuntimes();
  payload["queries_count"] = RuntimeRegistry.resetQueriesCount();
  payload["cached_queries_count"] = RuntimeRegistry.resetCachedQueriesCount();
}

export const ControllerRuntime = {
  processAction,
  cleanupViewRuntime,
  appendInfoToPayload,

  [included](klass: unknown): void {
    const base = klass as ControllerClass;
    const proto = base.prototype as Record<string, unknown>;
    for (
      let link: object | null = proto;
      link;
      link = Object.getPrototypeOf(link) as object | null
    ) {
      if (supers.has(link)) return;
    }
    supers.set(proto, {
      processAction: proto.processAction as ControllerRuntimeSuper["processAction"],
      cleanupViewRuntime: proto.cleanupViewRuntime as ControllerRuntimeSuper["cleanupViewRuntime"],
      appendInfoToPayload:
        proto.appendInfoToPayload as ControllerRuntimeSuper["appendInfoToPayload"],
      logProcessAction: base.logProcessAction,
    });
    supers.set(base, supers.get(proto)!);
    Object.assign(proto, { processAction, cleanupViewRuntime, appendInfoToPayload });
    proto.dbRuntime = null;
    base.logProcessAction = logProcessAction;
  },
};
