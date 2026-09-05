import { ExecutionContext, Notifications } from "@blazetrails/activesupport";
import {
  ExceptionWrapper,
  classNameOf,
} from "../../action-dispatch/middleware/exception-wrapper.js";
import type { Request } from "../../action-dispatch/http/request.js";
import type { Response } from "../../action-dispatch/http/response.js";

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

  await Notifications.instrumentAsync(
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
    messages.push(`Views: ${Number(viewRuntime).toFixed(1)}ms`);
  }
  return messages;
}
