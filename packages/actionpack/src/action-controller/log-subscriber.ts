/**
 * ActionController::LogSubscriber
 *
 * Log formatting for controller actions. Subscribes to
 * ActiveSupport::Notifications events.
 * @see https://api.rubyonrails.org/classes/ActionController/LogSubscriber.html
 */

import {
  LogSubscriber as BaseLogSubscriber,
  NotificationEvent as Event,
} from "@blazetrails/activesupport";

export class LogSubscriber extends BaseLogSubscriber {
  /** Rails `ActionController::LogSubscriber#logger` — delegates to `Base.logger`. @internal */
  override get logger() {
    return LogSubscriber.logger;
  }

  startProcessing(event: Event): void {
    const { controller, action, format } = event.payload as {
      controller: string;
      action: string;
      format?: string;
    };
    this._info(`Processing by ${controller}#${action} as ${format ?? "*/*"}`);
  }

  processAction(event: Event): void {
    const { status } = event.payload as { status: number | string };
    this._info(`Completed ${status} in ${event.duration.toFixed(1)}ms`);
  }

  halted(event: Event): void {
    const { filter } = event.payload as { filter: string };
    this._info(`Filter chain halted as ${filter} rendered or redirected`);
  }

  sendFile(event: Event): void {
    const { path } = event.payload as { path: string };
    this._info(`Sent file ${path}`);
  }

  sendData(event: Event): void {
    const { filename } = event.payload as { filename?: string };
    this._info(`Sent data ${filename ?? "(inline)"}`);
  }

  redirect(event: Event): void {
    const { status, location } = event.payload as { status: number | string; location: string };
    this._info(`Redirected to ${location} (${status})`);
  }

  haltedCallback(event: Event): void {
    const { filter } = event.payload as { filter: string };
    this._info(`Filter chain halted as "${filter}" rendered or redirected`);
  }

  redirectTo(event: Event): void {
    const { location } = event.payload as { location: string };
    this._info(`Redirected to ${location}`);
  }

  unpermittedParameters(event: Event): void {
    const { keys, context } = event.payload as {
      keys: string[];
      context?: Record<string, string>;
    };
    const displayKeys = keys.map((k) => `:${k}`).join(", ");
    const contextStr = context
      ? `. Context: { ${Object.entries(context)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")} }`
      : "";
    this._debug(`Unpermitted parameter${keys.length > 1 ? "s" : ""}: ${displayKeys}${contextStr}`);
  }
}

// "action_controller" is the AS::Notifications channel identifier, which uses
// Rails snake_case naming conventions as a cross-package wire protocol.
LogSubscriber.attachTo("action_controller");
