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
import { Base } from "./base.js";
import { ExceptionWrapper } from "../action-dispatch/middleware/exception-wrapper.js";
import { eachPair, inspect, isEmpty, isSymbol, round, symbolToS } from "@blazetrails/ruby-compat";

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

  /**
   * `ActionController::LogSubscriber#process_action`
   * (`vendor/rails/actionpack/lib/action_controller/log_subscriber.rb:26-44`).
   *
   * @missingRailsArgs round — PERMANENT
   */
  processAction(event: Event): void {
    this._info(() => {
      const payload = event.payload as {
        status?: number | null;
        exception?: [string, string] | null;
      };
      const additions = Base.logProcessAction(payload as Record<string, unknown>);
      let status = payload.status;

      let exceptionClassName: string | undefined;
      if (status == null && (exceptionClassName = payload.exception?.[0]) != null) {
        status = ExceptionWrapper.statusCodeForException(exceptionClassName);
      }

      additions.push(`GC: ${round(event.gcTime, 1)}ms`);

      // Ruby interpolates `nil` as the empty string, which is what a status
      // neither the payload nor the exception supplied renders as.
      let message =
        `Completed ${status ?? ""} ${(status != null && HTTP_STATUS_CODES[status]) || ""} in ${round(event.duration)}ms` +
        ` (${additions.join(" | ")})`;
      // `defined?(Rails.env)` — the constant is absent outside a booted app.
      const Trails = (globalThis as { Trails?: { env?: { isDevelopment(): boolean } } }).Trails;
      if (Trails?.env != null && Trails.env.isDevelopment()) message += "\n\n";

      return message;
    });
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
LogSubscriber.subscribeLogLevel("process_action", "info");

LogSubscriber.attachTo("action_controller");
