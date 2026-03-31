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

export function instrumentAction(
  controllerName: string,
  actionName: string,
  request: { method?: string; path?: string; format?: string },
  fn: () => Promise<unknown>,
  notifier?: Notifier,
): Promise<unknown> {
  const start = now();
  const payload: Record<string, unknown> = {
    controller: controllerName,
    action: actionName,
    method: request.method,
    path: request.path,
    format: request.format,
  };

  notifier?.instrument("start_processing.action_controller", { ...payload });

  return Promise.resolve()
    .then(fn)
    .then(
      (result) => {
        notifier?.instrument("process_action.action_controller", {
          ...payload,
          status: deriveStatus(result, 200),
          duration: now() - start,
        });
        return result;
      },
      (error) => {
        notifier?.instrument("process_action.action_controller", {
          ...payload,
          status: deriveStatus(error, 500),
          exception: error instanceof Error ? [error.name, error.message] : String(error),
          duration: now() - start,
        });
        throw error;
      },
    );
}

function deriveStatus(obj: unknown, fallback: number): number {
  if (obj && typeof obj === "object") {
    const any = obj as Record<string, unknown>;
    if (typeof any.status === "number") return any.status;
    if (typeof any.statusCode === "number") return any.statusCode;
  }
  return fallback;
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
