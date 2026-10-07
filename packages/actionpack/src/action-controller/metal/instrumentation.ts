import {
  attrInternal,
  Benchmark,
  Concern,
  ExecutionContext,
  extend,
  include,
  included,
  initialize,
  Module,
  Notifications,
  toF,
} from "@blazetrails/activesupport";
import { Logger, type LoggerIncludingClass } from "../../abstract-controller/logger.js";
import {
  ExceptionWrapper,
  classNameOf,
} from "../../action-dispatch/middleware/exception-wrapper.js";
import type { Request } from "../../action-dispatch/http/request.js";
import type { Response } from "../../action-dispatch/http/response.js";
import { Exception, merge, StandardError, throwDataP } from "@blazetrails/ruby-compat";
import type { DataStreamingHost, SendDataOptions, SendFileOptions } from "./data-streaming.js";
import type { redirectTo as flashRedirectTo } from "./flash.js";

export const Instrumentation = new Module((mod) => {
  extend(mod, Concern);

  (mod as unknown as Record<symbol, unknown>)[included] = (base: LoggerIncludingClass): void => {
    include(base, Logger);
  };
  (mod as unknown as Record<symbol, unknown>)[initialize] = function (this: {
    viewRuntime: number | null;
  }): void {
    this.viewRuntime = null;
  };

  mod.moduleEval((carrier) => attrInternal.call(carrier, "viewRuntime"));

  mod.defineMethod("render", render);
  mod.defineMethod("sendFile", sendFile);
  mod.defineMethod("sendData", sendData);
  mod.defineMethod("redirectTo", redirectTo);
  mod.defineMethod("processAction", processAction);
  mod.defineMethod("haltedCallbackHook", haltedCallbackHook);
  mod.defineMethod("cleanupViewRuntime", cleanupViewRuntime);
  mod.defineMethod("appendInfoToPayload", appendInfoToPayload);
}) as Module & { ClassMethods: Module };

interface InstrumentationHost {
  actionName?: string;
  request: Request;
  response: Response;
  appendInfoToPayload(payload: Record<string, unknown>): void;
}

export function render(
  this: { viewRuntime: number | null; cleanupViewRuntime<T>(block: () => T): T },
  ...args: unknown[]
): unknown {
  let renderOutput: unknown = null;
  const viewRuntime = this.cleanupViewRuntime(() =>
    Benchmark.realtime(":float_millisecond", () => {
      return (renderOutput = Instrumentation.superMethod(this, "render")!(...args));
    }),
  ) as number | Promise<number>;
  if (typeof viewRuntime === "number") {
    this.viewRuntime = viewRuntime;
    return renderOutput;
  }
  return viewRuntime.then((viewRuntime) => {
    this.viewRuntime = viewRuntime;
    return renderOutput;
  });
}

/** @internal */
export async function processAction(
  this: InstrumentationHost,
  ...args: unknown[]
): Promise<unknown> {
  ExecutionContext.setKey("controller", this);

  const rawPayload: Record<string, unknown> = {
    controller: this.constructor.name,
    action: this.actionName,
    request: this.request,
    params: this.request.filteredParameters(),
    headers: this.request.headers,
    format: this.request.format.ref(),
    method: this.request.requestMethod,
    path: this.request.filteredPath(),
  };

  Notifications.instrument("start_processing.action_controller", rawPayload);

  return await Notifications.instrument(
    "process_action.action_controller",
    rawPayload,
    async (payload) => {
      try {
        const result = await Instrumentation.superMethod(this, "processAction")!(...args);
        payload.response = this.response;
        payload.status = this.response.status;
        return result;
      } catch (error) {
        if (throwDataP(error)) throw error;
        if (error instanceof Exception && !(error instanceof StandardError)) throw error;
        payload.status = ExceptionWrapper.statusCodeForException(classNameOf(error as Error));
        throw error;
      } finally {
        this.appendInfoToPayload(payload as Record<string, unknown>);
      }
    },
  );
}

export function sendFile(
  this: DataStreamingHost,
  path: string,
  options: SendFileOptions = {},
): void {
  return Notifications.instrument("send_file.action_controller", merge(options, { path }), () =>
    Instrumentation.superMethod(this, "sendFile")!(path, options),
  ) as void;
}

export function sendData(
  this: DataStreamingHost,
  data: string | Buffer,
  options: SendDataOptions = {},
): void | Promise<void> {
  return Notifications.instrument(
    "send_data.action_controller",
    options as Record<string, unknown>,
    () => Instrumentation.superMethod(this, "sendData")!(data, options),
  ) as void | Promise<void>;
}

export function redirectTo(
  this: InstrumentationHost,
  ...args: Parameters<typeof flashRedirectTo>
): number {
  return Notifications.instrument(
    "redirect_to.action_controller",
    { request: this.request },
    (payload) => {
      const result = Instrumentation.superMethod(this, "redirectTo")!(...args) as number;
      payload.status = this.response.status;
      payload.location = this.response.filteredLocation();
      return result;
    },
  );
}

export interface Notifier {
  instrument(event: string, payload: Record<string, unknown>, block?: () => unknown): void;
}

/** @internal */
export function haltedCallbackHook(filter: unknown, _name?: unknown, notifier?: Notifier): void {
  notifier?.instrument("halted_callback.action_controller", { filter });
}

/** @internal */
export function cleanupViewRuntime<T>(block: () => T): T {
  return block();
}

/** @internal */
export function appendInfoToPayload(
  this: { viewRuntime?: number | null } | undefined,
  payload: Record<string, unknown>,
): void {
  payload.view_runtime = this?.viewRuntime;
}

export function logProcessAction(payload: Record<string, unknown>): string[] {
  const messages: string[] = [];
  const viewRuntime = payload.view_runtime;
  if (viewRuntime != null && viewRuntime !== false) {
    messages.push(`Views: ${toF(String(viewRuntime)).toFixed(1)}ms`);
  }
  return messages;
}

export const ClassMethods: Module = new Module((mod) => {
  mod.defineMethod("logProcessAction", logProcessAction);
});

Instrumentation.ClassMethods = ClassMethods;
