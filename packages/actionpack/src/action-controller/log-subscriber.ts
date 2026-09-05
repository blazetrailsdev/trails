import {
  LogSubscriber as BaseLogSubscriber,
  NotificationEvent as Event,
  trails,
} from "@blazetrails/activesupport";
import { expandCacheKey } from "@blazetrails/activesupport/cache";
import { HTTP_STATUS_CODES } from "@blazetrails/rack";
import { Base } from "./base.js";
import type { CachingClassMethods } from "../abstract-controller/caching.js";
import { ExceptionWrapper } from "../action-dispatch/middleware/exception-wrapper.js";
import {
  eachPair,
  inspect,
  isEmpty,
  isSymbol,
  rbInspect,
  rbObjAsString,
  round,
  symbolToS,
} from "@blazetrails/ruby-compat";

const INTERNAL_PARAMS = ["controller", "action", "format", "_method", "only_path"];

export class LogSubscriber extends BaseLogSubscriber {
  /** @internal */
  override get logger() {
    return LogSubscriber.logger;
  }

  /** @missingRailsArgs each_pair — PERMANENT */
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

  /** @missingRailsArgs round — PERMANENT */
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

      let message =
        `Completed ${rbObjAsString(status)} ${rbObjAsString(HTTP_STATUS_CODES[status!])} in ${round(event.duration)}ms` +
        ` (${additions.join(" | ")})`;
      if (trails != null && trails.env["development?"]()) message += "\n\n";

      return message;
    });
  }

  haltedCallback(event: Event): void {
    this._info(
      () => `Filter chain halted as ${rbInspect(event.payload.filter)} rendered or redirected`,
    );
  }

  /** @missingRailsArgs round — PERMANENT */
  sendFile(event: Event): void {
    this._info(
      () => `Sent file ${rbObjAsString(event.payload.path)} (${round(event.duration, 1)}ms)`,
    );
  }

  redirectTo(event: Event): void {
    this._info(() => `Redirected to ${rbObjAsString(event.payload.location)}`);
  }

  /** @missingRailsArgs round — PERMANENT */
  sendData(event: Event): void {
    this._info(
      () => `Sent data ${rbObjAsString(event.payload.filename)} (${round(event.duration, 1)}ms)`,
    );
  }

  unpermittedParameters(event: Event): void {
    this._debug(() => {
      const unpermittedKeys = event.payload.keys as string[];
      const displayUnpermittedKeys = unpermittedKeys.map((e) => `:${e}`).join(", ");
      const context = Object.entries(event.payload.context as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${rbObjAsString(v)}`)
        .join(", ");
      return this.color(
        `Unpermitted parameter${unpermittedKeys.length > 1 ? "s" : ""}: ${displayUnpermittedKeys}. Context: { ${context} }`,
        LogSubscriber.RED,
      );
    });
  }

  writeFragment(event: Event): void {
    if (!(Base as unknown as CachingClassMethods).enableFragmentCacheLogging) return;
    const key = expandCacheKey(event.payload.key ?? event.payload.path);
    const humanName = "Write fragment";
    this._info(`${humanName} ${key} (${round(event.duration, 1)}ms)`);
  }

  readFragment(event: Event): void {
    if (!(Base as unknown as CachingClassMethods).enableFragmentCacheLogging) return;
    const key = expandCacheKey(event.payload.key ?? event.payload.path);
    const humanName = "Read fragment";
    this._info(`${humanName} ${key} (${round(event.duration, 1)}ms)`);
  }

  isExistFragment(event: Event): void {
    if (!(Base as unknown as CachingClassMethods).enableFragmentCacheLogging) return;
    const key = expandCacheKey(event.payload.key ?? event.payload.path);
    const humanName = "Exist fragment?";
    this._info(`${humanName} ${key} (${round(event.duration, 1)}ms)`);
  }

  expireFragment(event: Event): void {
    if (!(Base as unknown as CachingClassMethods).enableFragmentCacheLogging) return;
    const key = expandCacheKey(event.payload.key ?? event.payload.path);
    const humanName = "Expire fragment";
    this._info(`${humanName} ${key} (${round(event.duration, 1)}ms)`);
  }
}

LogSubscriber.subscribeLogLevel("start_processing", "info");
LogSubscriber.subscribeLogLevel("process_action", "info");
LogSubscriber.subscribeLogLevel("halted_callback", "info");
LogSubscriber.subscribeLogLevel("send_file", "info");
LogSubscriber.subscribeLogLevel("redirect_to", "info");
LogSubscriber.subscribeLogLevel("send_data", "info");
LogSubscriber.subscribeLogLevel("unpermitted_parameters", "debug");
LogSubscriber.subscribeLogLevel("write_fragment", "info");
LogSubscriber.subscribeLogLevel("read_fragment", "info");
LogSubscriber.subscribeLogLevel("exist_fragment?", "info");
LogSubscriber.subscribeLogLevel("expire_fragment", "info");

LogSubscriber.attachTo("action_controller");
