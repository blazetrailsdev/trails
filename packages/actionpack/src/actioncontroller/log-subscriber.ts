/**
 * ActionController::LogSubscriber
 *
 * Log formatting for controller actions. Subscribes to
 * ActiveSupport::Notifications events.
 * @see https://api.rubyonrails.org/classes/ActionController/LogSubscriber.html
 */

export interface Event {
  name: string;
  payload: Record<string, unknown>;
  duration: number;
}

export class LogSubscriber {
  private _logger: { info(msg: string): void; debug?(msg: string): void } | null;

  constructor(logger?: { info(msg: string): void; debug?(msg: string): void }) {
    this._logger = logger ?? null;
  }

  startProcessing(event: Event): void {
    const { controller, action, format } = event.payload as {
      controller: string;
      action: string;
      format?: string;
    };
    this._logger?.info(`Processing by ${controller}#${action} as ${format ?? "*/*"}`);
  }

  processAction(event: Event): void {
    const { status } = event.payload as { status: number | string };
    this._logger?.info(`Completed ${status} in ${event.duration.toFixed(1)}ms`);
  }

  halted(event: Event): void {
    const { filter } = event.payload as { filter: string };
    this._logger?.info(`Filter chain halted as ${filter} rendered or redirected`);
  }

  sendFile(event: Event): void {
    const { path } = event.payload as { path: string };
    this._logger?.info(`Sent file ${path}`);
  }

  sendData(event: Event): void {
    const { filename } = event.payload as { filename?: string };
    this._logger?.info(`Sent data ${filename ?? "(inline)"}`);
  }

  redirect(event: Event): void {
    const { status, location } = event.payload as { status: number | string; location: string };
    this._logger?.info(`Redirected to ${location} (${status})`);
  }
}
