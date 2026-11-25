import { wrap } from "../core-ext/array/wrap.js";
import { currentErrorReporter } from "../error-reporter.js";
import { Notifications } from "../notifications.js";
import { ArgumentError } from "@blazetrails/ruby-compat/argument-error";
import { classModule } from "@blazetrails/ruby-compat/class-module";
import { rbObjRespondTo } from "@blazetrails/ruby-compat/object";
import { stderr } from "@blazetrails/ruby-compat/process-adapter";
import { StandardError } from "@blazetrails/ruby-compat/standard-error";
import { ActiveSupport, TopLevel } from "../namespaces.js";
import type { Reporting } from "./reporting.js";

export type DeprecationBehavior = "raise" | "stderr" | "log" | "silence" | "notify" | "report";

export type DeprecationBehaviorCallable = (
  message: string,
  callstack: unknown[],
  deprecator: Reporting,
) => void;

export class DeprecationException extends StandardError {}

export const DEFAULT_BEHAVIORS: Readonly<Record<DeprecationBehavior, DeprecationBehaviorCallable>> =
  {
    raise: (message, callstack, deprecator) => {
      const e = new DeprecationException(message);
      e.stack = callstack.map((l) => String(l)).join("\n");
      throw e;
    },

    stderr: (message, callstack, deprecator) => {
      stderr.write(message + "\n");
      if (deprecator.debug) stderr.write(callstack.join("\n  ") + "\n");
    },

    log: (message, callstack, deprecator) => {
      const logger = TopLevel.Trails?.logger ?? new ActiveSupport.Logger(stderr);
      logger.warn(message);
      if (deprecator.debug) logger.debug(callstack.join("\n  "));
    },

    notify: (message, callstack, deprecator) => {
      Notifications.instrument(
        `deprecation.${ActiveSupport.Inflector.underscore(deprecator.gemName).replace(/\//g, "_")}`,
        {
          message,
          callstack,
          gemName: deprecator.gemName,
          deprecationHorizon: deprecator.deprecationHorizon,
        },
      );
    },

    silence: (message, callstack, deprecator) => {},

    report: (message, callstack, deprecator) => {
      const error = new DeprecationException(message);
      error.stack = callstack.map((l) => String(l)).join("\n");
      currentErrorReporter.report(error);
    },
  };

type DeprecationBehaviorItem = DeprecationBehavior | ((...args: never[]) => void);

export type DeprecationBehaviorInput = DeprecationBehaviorItem | DeprecationBehaviorItem[] | null;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Behavior {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  get debug(): boolean {
    return this._debug;
  }

  set debug(debug: boolean) {
    this._debug = debug;
  }

  get behavior(): DeprecationBehaviorCallable[] {
    return (this._behavior ??= [DEFAULT_BEHAVIORS.stderr]);
  }

  set behavior(behavior: DeprecationBehaviorInput) {
    this._behavior = wrap<DeprecationBehaviorItem>(behavior).map(
      (b) =>
        (typeof b === "string" && Object.hasOwn(DEFAULT_BEHAVIORS, b)
          ? DEFAULT_BEHAVIORS[b]
          : undefined) ?? this.arityCoerce(b),
    );
  }

  get disallowedBehavior(): DeprecationBehaviorCallable[] {
    return (this._disallowedBehavior ??= [DEFAULT_BEHAVIORS.raise]);
  }

  set disallowedBehavior(behavior: DeprecationBehaviorInput) {
    this._disallowedBehavior = wrap<DeprecationBehaviorItem>(behavior).map(
      (b) =>
        (typeof b === "string" && Object.hasOwn(DEFAULT_BEHAVIORS, b)
          ? DEFAULT_BEHAVIORS[b]
          : undefined) ?? this.arityCoerce(b),
    );
  }

  /** @internal */
  protected arityCoerce(behavior: unknown): DeprecationBehaviorCallable {
    if (!rbObjRespondTo(behavior, "call")) {
      const inspected = typeof behavior === "string" ? `:${behavior}` : String(behavior);
      throw new ArgumentError(`${inspected} is not a valid deprecation behavior.`);
    }

    const call = (...args: unknown[]): void => {
      if (typeof behavior === "function") behavior(...args);
      else (behavior as { call(...a: unknown[]): void }).call(...args);
    };

    switch (this.arityOfCallable(behavior)) {
      case 2:
        return (message, callstack) => {
          call(message, callstack);
        };
      case 0:
      case 1:
      case 3:
        return typeof behavior === "function" ? (behavior as DeprecationBehaviorCallable) : call;
      default:
        return (message, callstack, deprecator) => {
          call(message, callstack, deprecator.deprecationHorizon, deprecator.gemName);
        };
    }
  }

  /** @internal */
  protected arityOfCallable(callable: unknown): number {
    return typeof callable === "function"
      ? callable.length
      : (callable as { call: (...args: unknown[]) => unknown }).call.length;
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Behavior {
  /** @internal */
  _debug: boolean;
  /** @internal */
  _behavior?: DeprecationBehaviorCallable[];
  /** @internal */
  _disallowedBehavior?: DeprecationBehaviorCallable[];
}
