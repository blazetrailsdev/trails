import { wrap } from "../core-ext/array/wrap.js";
import { currentErrorReporter } from "../error-reporter.js";
import { ArgumentError } from "../hash-utils.js";
import { underscore } from "../inflector.js";
import { Notifications } from "../notifications.js";
import { classModule, rbObjRespondTo, stderr } from "@blazetrails/ruby-compat";
import { ActiveSupport, TopLevel } from "../namespaces.js";
import type { Deprecation } from "../deprecation.js";

export type DeprecationBehavior = "raise" | "stderr" | "log" | "silence" | "notify" | "report";

export type DeprecationBehaviorCallable = (
  message: string,
  callstack: unknown[],
  deprecator: Deprecation,
) => void;

export class DeprecationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeprecationException";
  }
}

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
        `deprecation.${underscore(deprecator.gemName).replace(/\//g, "_")}`,
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

function arityCoerce(behavior: unknown): DeprecationBehaviorCallable {
  if (!rbObjRespondTo(behavior, "call")) {
    const inspected = typeof behavior === "string" ? `:${behavior}` : String(behavior);
    throw new ArgumentError(`${inspected} is not a valid deprecation behavior.`);
  }

  const call = (...args: unknown[]): void => {
    if (typeof behavior === "function") behavior(...args);
    else (behavior as { call(...a: unknown[]): void }).call(...args);
  };

  switch (arityOfCallable(behavior)) {
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

function arityOfCallable(callable: unknown): number {
  return typeof callable === "function"
    ? callable.length
    : (callable as { call: (...args: unknown[]) => unknown }).call.length;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Behavior {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  get behavior(): DeprecationBehaviorCallable[] {
    return (this._behavior ??= [DEFAULT_BEHAVIORS.stderr]);
  }

  set behavior(behavior: DeprecationBehaviorInput) {
    this._behavior = wrap<DeprecationBehaviorItem>(behavior).map(
      (b) =>
        (typeof b === "string" && Object.hasOwn(DEFAULT_BEHAVIORS, b)
          ? DEFAULT_BEHAVIORS[b]
          : undefined) ?? arityCoerce(b),
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
          : undefined) ?? arityCoerce(b),
    );
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Behavior {
  debug: boolean;
  /** @internal */
  _behavior?: DeprecationBehaviorCallable[];
  /** @internal */
  _disallowedBehavior?: DeprecationBehaviorCallable[];
}
