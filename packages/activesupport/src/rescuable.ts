import { ArgumentError, rbInspect } from "@blazetrails/ruby-compat";
import { included } from "@blazetrails/ruby-compat/include";
import { classAttribute } from "./class-attribute.js";
import { extractOptionsBang } from "./hash-utils.js";
import { safeConstantize } from "./inflector.js";

type ErrorHandler = ((this: any, error: Error) => void) | string;

interface RescuableHost {
  rescueHandlers: [string, unknown][];
}

export const Rescuable = {
  [included](base: object): void {
    classAttribute.call(base, "rescueHandlers", { default: [] });
  },
};

export function rescueFrom(
  this: RescuableHost,
  ...klasses: Array<(new (...args: any[]) => Error) | string | { with?: ErrorHandler }>
): void {
  const { with: handler } = extractOptionsBang(klasses) as { with?: ErrorHandler };
  if (handler == null) {
    throw new ArgumentError("Need a handler. Pass the with: keyword argument or provide a block.");
  }

  for (const klass of klasses as unknown[]) {
    let key: string;
    if (typeof klass === "function") {
      key = klass.name;
    } else if (typeof klass === "string") {
      key = klass;
    } else {
      throw new ArgumentError(
        `${rbInspect(klass)} must be an Exception class or a String referencing an Exception class`,
      );
    }

    this.rescueHandlers = [...this.rescueHandlers, [key, handler]];
  }
}

/** @noRailsEquivalent CONVERGEABLE port-rescuable-tagged-logging-and-isolated-execution-cases */
export function handleRescue(target: any, error: Error): boolean {
  const handlers = (target as RescuableHost).rescueHandlers;
  for (const [key, handler] of [...handlers].reverse()) {
    const klass = (target.constructor[key] ?? safeConstantize(key)) as
      | (new (...args: any[]) => Error)
      | undefined;
    if (klass !== undefined && error instanceof klass) {
      if (typeof handler === "function") {
        const rescuer = handler as Exclude<ErrorHandler, string>;
        if (rescuer.length === 0) (rescuer as (this: any) => void).call(target);
        else rescuer.call(target, error);
      } else if (typeof handler === "string") {
        const method = target[handler];
        if (typeof method === "function") {
          if (method.length === 0) method.call(target);
          else method.call(target, error);
        }
      }
      return true;
    }
  }
  return false;
}
