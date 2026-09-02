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
import { HTTP_STATUS_CODES } from "@blazetrails/rack";
import { eachPair, inspect, isEmpty, isSymbol, symbolToS } from "@blazetrails/ruby-compat";

const INTERNAL_PARAMS = ["controller", "action", "format", "_method", "only_path"];

export class LogSubscriber extends BaseLogSubscriber {
  /** Rails `ActionController::LogSubscriber#logger` — delegates to `Base.logger`. @internal */
  override get logger() {
    return LogSubscriber.logger;
  }

  /**
   * `ActionController::LogSubscriber#start_processing`
   * (`vendor/rails/actionpack/lib/action_controller/log_subscriber.rb:9-27`).
   *
   * @missingRailsArgs each_pair — PERMANENT
   */
  startProcessing(event: Event): void {
    if (!this.logger?.["info?"]) return;

    const payload = event.payload as {
      controller: string;
      action: string;
      params: Record<string, unknown>;
      format?: string | null;
    };
    const params: Record<string, unknown> = {};
    eachPair(payload.params, (k, v) => {
      if (!INTERNAL_PARAMS.includes(k)) params[k] = v;
    });
    let format = payload.format;
    if (isSymbol(format)) format = symbolToS(format).toUpperCase();
    if (format == null) format = "*/*";

    this._info(`Processing by ${payload.controller}#${payload.action} as ${format}`);
    if (!isEmpty(params)) this._info(`  Parameters: ${inspect(params)}`);
  }

  processAction(event: Event): void {
    const { status } = event.payload as { status: number | string };
    const statusText = typeof status === "number" ? (HTTP_STATUS_CODES[status] ?? "") : "";
    const statusStr = statusText ? `${status} ${statusText}` : String(status);
    this._info(`Completed ${statusStr} in ${Math.round(event.duration)}ms`);
  }

  halted(event: Event): void {
    const { filter } = event.payload as { filter: string };
    this._info(`Filter chain halted as ${filter} rendered or redirected`);
  }

  sendFile(event: Event): void {
    const { path } = event.payload as { path: string };
    this._info(`Sent file ${path} (${event.duration.toFixed(1)}ms)`);
  }

  sendData(event: Event): void {
    const { filename } = event.payload as { filename?: string };
    this._info(`Sent data ${filename ?? "(inline)"} (${event.duration.toFixed(1)}ms)`);
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
LogSubscriber.subscribeLogLevel("start_processing", "info");

LogSubscriber.attachTo("action_controller");
