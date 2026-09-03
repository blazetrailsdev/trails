/**
 * ActionController::Instrumentation
 *
 * Adds instrumentation to process_action, render, and send_file.
 * Accepts a Notifications-compatible interface for publishing events.
 * @see https://api.rubyonrails.org/classes/ActionController/Instrumentation.html
 */

const now = (): number => globalThis.performance?.now() ?? Date.now();

export interface Notifier {
  instrument(event: string, payload: Record<string, unknown>, block?: () => unknown): void;
}

export function instrumentRender(
  fn: () => unknown,
  notifier?: Notifier,
): { result: unknown; viewRuntime: number } {
  const start = now();
  const result = fn();
  const viewRuntime = now() - start;
  notifier?.instrument("render.action_controller", { duration: viewRuntime });
  return { result, viewRuntime };
}

/**
 * Rails `Instrumentation#halted_callback_hook` — emitted by AS::Callbacks
 * whenever a before-action halts the chain.
 *
 * @internal
 */
export function haltedCallbackHook(filter: unknown, _name?: unknown, notifier?: Notifier): void {
  notifier?.instrument("halted_callback.action_controller", { filter });
}

/**
 * Rails `Instrumentation#cleanup_view_runtime` — wrapper hook for
 * subclasses (e.g. AR's ControllerRuntime) to subtract DB time from
 * view runtime. The default just yields.
 *
 * @internal
 */
export function cleanupViewRuntime<T>(block: () => T): T {
  return block();
}

/**
 * Rails `Instrumentation#append_info_to_payload` — extension hook for
 * subclasses to enrich the `process_action` payload. Default copies
 * `viewRuntime` onto the payload.
 *
 * @internal
 */
export function appendInfoToPayload(
  this: { viewRuntime?: number } | undefined,
  payload: Record<string, unknown>,
): void {
  if (this && this.viewRuntime !== undefined) {
    payload.viewRuntime = this.viewRuntime;
  }
}

export function logProcessAction(payload: Record<string, unknown>): string[] {
  const messages: string[] = [];
  const viewRuntime = payload.view_runtime ?? payload.viewRuntime;
  if (viewRuntime !== undefined && viewRuntime !== null) {
    messages.push(`Views: ${Number(viewRuntime).toFixed(1)}ms`);
  }
  return messages;
}
