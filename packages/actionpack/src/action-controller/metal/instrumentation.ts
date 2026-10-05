import {
  attrInternal,
  ExecutionContext,
  include,
  included,
  initialize,
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
import { merge } from "@blazetrails/ruby-compat";
import {
  sendData as _sendData,
  sendFile as _sendFile,
  type DataStreamingHost,
  type SendDataOptions,
  type SendFileOptions,
} from "./data-streaming.js";
import { Flash } from "./flash.js";

export class Instrumentation {
  static [included](base: LoggerIncludingClass): void {
    include(base, Logger);
  }

  declare viewRuntime: number | null;

  static [initialize](this: Instrumentation): void {
    this.viewRuntime = null;
  }
}
attrInternal.call(Instrumentation.prototype, "viewRuntime");

interface InstrumentationHost {
  actionName?: string;
  request: Request;
  response: Response;
  appendInfoToPayload(payload: Record<string, unknown>): void;
}

/** @internal */
export async function processAction(
  this: InstrumentationHost,
  block: () => Promise<void>,
): Promise<void> {
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

  await Notifications.instrument(
    "process_action.action_controller",
    rawPayload,
    async (payload) => {
      try {
        const result = await block();
        payload.response = this.response;
        payload.status = this.response.status;
        return result;
      } catch (error) {
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
    _sendFile.call(this, path, options),
  );
}

export function sendData(
  this: DataStreamingHost,
  data: string | Buffer,
  options: SendDataOptions = {},
): void | Promise<void> {
  return Notifications.instrument(
    "send_data.action_controller",
    options as Record<string, unknown>,
    () => _sendData.call(this, data, options),
  );
}

export function redirectTo(
  this: InstrumentationHost,
  ...args: Parameters<Flash["redirectTo"]>
): number {
  return Notifications.instrument(
    "redirect_to.action_controller",
    { request: this.request },
    (payload) => {
      const result = Flash.prototype.redirectTo.call(this as never, ...args);
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
