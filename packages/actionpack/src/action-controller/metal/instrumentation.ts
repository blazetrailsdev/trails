import { ActionController } from "../../namespaces.js";
import { rbCallSuper } from "@blazetrails/ruby-compat";
import {
  attrInternal,
  Benchmark,
  Concern,
  ExecutionContext,
  extend,
  include,
  Notifications,
  toF,
} from "@blazetrails/activesupport";
import { Logger } from "../../abstract-controller/logger.js";
import { ExceptionWrapper } from "../../action-dispatch/middleware/exception-wrapper.js";
import type { Request } from "../../action-dispatch/http/request.js";
import type { Response } from "../../action-dispatch/http/response.js";
import { Exception, StandardError, rbObjClassname, throwDataP } from "@blazetrails/ruby-compat";
import type { DataStreamingHost, SendDataOptions, SendFileOptions } from "./data-streaming.js";
import type { redirectTo as flashRedirectTo } from "./flash.js";

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
      return (renderOutput = rbCallSuper(this, render, ...args));
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

/**
 * @internal
 * @missingRailsName name — PERMANENT
 */
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
        const result = await rbCallSuper(this, processAction, ...args);
        payload.response = this.response;
        payload.status = this.response.status;
        return result;
      } catch (error) {
        if (throwDataP(error)) throw error;
        if (error instanceof Exception && !(error instanceof StandardError)) throw error;
        payload.status = ExceptionWrapper.statusCodeForException(rbObjClassname(error));
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
  return Notifications.instrument("send_file.action_controller", { ...options, path }, () =>
    rbCallSuper(this, sendFile, path, options),
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
    () => rbCallSuper(this, sendData, data, options),
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
      const result = rbCallSuper(this, redirectTo, ...args) as number;
      payload.status = this.response.status;
      payload.location = this.response.filteredLocation();
      return result;
    },
  );
}

/** @internal */
export function haltedCallbackHook(filter: unknown, _: unknown): void {
  Notifications.instrument("halted_callback.action_controller", { filter });
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

export const ClassMethods = { logProcessAction };

export class Instrumentation {
  declare static ClassMethods: typeof ClassMethods;
}
extend(Instrumentation, Concern);
include(Instrumentation, Logger);
attrInternal.call(Instrumentation.prototype, "viewRuntime");
Object.assign(Instrumentation.prototype, {
  render,
  sendFile,
  sendData,
  redirectTo,
  processAction,
  haltedCallbackHook,
  cleanupViewRuntime,
  appendInfoToPayload,
});
Object.defineProperty(Instrumentation, "ClassMethods", { value: ClassMethods });

ActionController.Instrumentation = Instrumentation;
