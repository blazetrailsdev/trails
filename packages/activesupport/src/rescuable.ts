import {
  ArgumentError,
  NameError,
  rbBlockGivenP,
  rbConstGet,
  rbEqq,
  rbInspect,
  rbModName,
  rbObjMethod,
} from "@blazetrails/ruby-compat";
import { Module, extend, type Included } from "@blazetrails/ruby-compat/include";
import { classAttribute } from "./class-attribute.js";
import { Concern } from "./concern.js";
import { extractOptionsBang } from "./hash-utils.js";
import { safeConstantize } from "./inflector.js";

type ErrorHandler = ((this: any, error: any) => unknown) | string;

type ExceptionClass = (abstract new (...args: any[]) => unknown) | Module;

interface RescuableClass {
  rescueHandlers: unknown[][];
  rescueWithHandler: typeof ClassMethods.rescueWithHandler;
  handlerForRescue: typeof ClassMethods.handlerForRescue;
  findRescueHandler: typeof ClassMethods.findRescueHandler;
  constantizeRescueHandlerClass: typeof ClassMethods.constantizeRescueHandlerClass;
}

export const ClassMethods = {
  /** @inventedArm safeConstantize — PERMANENT */
  rescueFrom(
    this: Pick<RescuableClass, "rescueHandlers">,
    ...klasses: Array<
      ExceptionClass | string | { with?: ErrorHandler } | ((this: any, error: any) => unknown)
    >
  ): void {
    const block = rbBlockGivenP(klasses[klasses.length - 1])
      ? (klasses.pop() as Exclude<ErrorHandler, string>)
      : undefined;
    let { with: with_ = null } = extractOptionsBang(klasses) as {
      with?: ErrorHandler | false | null;
    };
    if (with_ == null || with_ === false) {
      if (block !== undefined) {
        with_ = block;
      } else {
        throw new ArgumentError(
          "Need a handler. Pass the with: keyword argument or provide a block.",
        );
      }
    }

    for (const klass of klasses as unknown[]) {
      let key: string | ExceptionClass;
      if (
        (typeof klass === "function" &&
          Object.getOwnPropertyDescriptor(klass, "prototype")?.writable === false) ||
        klass instanceof Module
      ) {
        const name = rbModName(klass);
        key = name != null && safeConstantize(name) === klass ? name : (klass as ExceptionClass);
      } else if (typeof klass === "string") {
        key = klass;
      } else {
        throw new ArgumentError(
          `${rbInspect(klass)} must be an Exception class or a String referencing an Exception class`,
        );
      }

      this.rescueHandlers = [...this.rescueHandlers, [key, with_]];
    }
  },

  rescueWithHandler(
    this: RescuableClass,
    exception: any,
    {
      object = this,
      visitedExceptions = [],
    }: { object?: object; visitedExceptions?: unknown[] } = {},
  ): unknown {
    visitedExceptions.push(exception);

    const handler = this.handlerForRescue(exception, { object: object });
    if (handler != null) {
      const result = handler(exception);
      return typeof (result as PromiseLike<unknown> | null)?.then === "function"
        ? Promise.resolve(result).then(() => exception)
        : exception;
    } else if (exception != null && exception !== false) {
      if (visitedExceptions.includes(exception.cause)) {
        return null;
      } else {
        return this.rescueWithHandler(exception.cause, {
          object: object,
          visitedExceptions: visitedExceptions,
        });
      }
    }
    return null;
  },

  handlerForRescue(
    this: RescuableClass,
    exception: unknown,
    { object = this }: { object?: object } = {},
  ): ((e: unknown) => unknown) | null {
    const rescuer = this.findRescueHandler(exception);
    if (typeof rescuer === "string") {
      const method = rbObjMethod(object, rescuer);
      if (method.arity() === 0) {
        return (_e) => method.call();
      } else {
        return (e) => method.call(e);
      }
    } else if (typeof rescuer === "function") {
      if (rescuer.length === 0) {
        return (_e) => (rescuer as (this: object) => unknown).call(object);
      } else {
        return (e) => rescuer.call(object, e);
      }
    }
    return null;
  },

  /** @internal */
  findRescueHandler(this: RescuableClass, exception: unknown): ErrorHandler | null | undefined {
    if (exception != null && exception !== false) {
      const [, handler] =
        ([...this.rescueHandlers].reverse() as [string | ExceptionClass, ErrorHandler][]).find(
          ([classOrName]) => {
            const klass = this.constantizeRescueHandlerClass(classOrName);
            return klass != null && rbEqq(klass, exception);
          },
        ) ?? [];

      return handler;
    }
    return null;
  },

  /** @internal */
  constantizeRescueHandlerClass(
    this: RescuableClass,
    classOrName: string | ExceptionClass,
  ): ExceptionClass | null | undefined {
    if (typeof classOrName === "string") {
      try {
        return rbConstGet(this, classOrName) as ExceptionClass;
      } catch (e) {
        if (!(e instanceof NameError)) throw e;
        return safeConstantize(classOrName) as ExceptionClass | undefined;
      }
    } else {
      return classOrName;
    }
  },
};

export const Rescuable = new Module((mod) => {
  extend(mod, Concern);

  (mod as unknown as { included(base: null, block: (this: object) => void): void }).included(
    null,
    function (this: object) {
      classAttribute.call(this, "rescueHandlers", { default: [] });
    },
  );

  mod.defineMethod("rescueWithHandler", rescueWithHandler);
  mod.defineMethod("handlerForRescue", handlerForRescue);
}) as Module<{
  rescueWithHandler: typeof rescueWithHandler;
  handlerForRescue: typeof handlerForRescue;
}> & { ClassMethods: typeof ClassMethods };
Rescuable.ClassMethods = ClassMethods;
export type Rescuable = Included<typeof Rescuable>;

export function rescueWithHandler(this: object, exception: unknown): unknown {
  return (this.constructor as unknown as RescuableClass).rescueWithHandler(exception, {
    object: this,
  });
}

export function handlerForRescue(
  this: object,
  exception: unknown,
): ((e: unknown) => unknown) | null {
  return (this.constructor as unknown as RescuableClass).handlerForRescue(exception, {
    object: this,
  });
}
