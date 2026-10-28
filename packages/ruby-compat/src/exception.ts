import { classpaths, generatedClassPath } from "./classpath.js";

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
/**
 * Ruby's core `Exception` (`vendor/ruby/v3.3.11/error.c:3294` `rb_eException`) — the
 * root every raisable class descends from. A class declared `< Exception`
 * rather than `< StandardError` escapes a bare `rescue => e`, which rescues
 * `StandardError` only.
 *
 * A trails error class that extends `Error` directly is read as a
 * `StandardError`; only a subclass of this one is outside it.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Exception`, which Rails inherits
 * rather than defines.
 */
export class Exception extends Error {}

export interface Exception {
  /** @noRailsEquivalent PERMANENT */
  detailedMessage(opt?: { highlight?: boolean | null } | null): string;
  /** @noRailsEquivalent PERMANENT */
  toS(): string;
}
/* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */

const declaredNames = new WeakMap<object, unknown>();

/**
 * `rb_class_name` (`vendor/ruby/v3.3.11/variable.c:483`) of the exception's
 * class, which Ruby reads off the constant path. A JS `Error` reads `name`
 * for its stack header, so it is answered from the same path, then from a
 * name the class itself seated on its prototype, then its JS name. An
 * ancestor's name is never read: Ruby names the receiver's own class.
 *
 * @noRailsEquivalent PERMANENT
 */
Object.defineProperty(Exception.prototype, "name", {
  configurable: true,
  get(this: Exception) {
    const klass = this.constructor;
    return (
      classpaths.get(klass)?.path ??
      generatedClassPath(klass) ??
      declaredNames.get(klass) ??
      (klass.name || "Exception")
    );
  },
  set(this: Exception, value: unknown) {
    if (Object.hasOwn(this, "constructor")) declaredNames.set(this.constructor, value);
    else Object.defineProperty(this, "name", { value, writable: true, configurable: true });
  },
});

/**
 * `exc_to_s` (`vendor/ruby/v3.3.11/error.c:1463`): the message, or the class
 * name when there is none. Ruby's `mesg` ivar is the own `message` property
 * `Error`'s constructor seats only when given a message. `rb_String` is
 * `String`, not ruby-compat's `rbObjAsString`: `object.ts` reaches classes that
 * extend `Exception`, so importing it here leaves `Exception` uninitialized
 * when this module is loaded first.
 *
 * @noRailsEquivalent PERMANENT
 */
Exception.prototype.toS = function (this: Exception): string {
  const mesg: unknown = Object.hasOwn(this, "message") ? Reflect.get(this, "message", this) : null;

  if (mesg == null) {
    const klass = this.constructor;
    return classpaths.get(klass)?.path ?? generatedClassPath(klass) ?? (klass.name || "");
  }
  return String(mesg);
};

/**
 * `exc_message` (`vendor/ruby/v3.3.11/error.c:3303`) is `rb_funcallv(exc, idTo_s, 0, 0)`.
 *
 * @noRailsEquivalent PERMANENT
 */
Object.defineProperty(Exception.prototype, "message", {
  configurable: true,
  get(this: Exception) {
    return this.toS();
  },
  set(this: Exception, value: unknown) {
    Object.defineProperty(this, "message", {
      value,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  },
});

/**
 * `exc_setup_message` and `exc_setup_cause`
 * (`vendor/ruby/v3.3.11/eval.c:506`, `:480`), the cause half of `raise`: an
 * exception raised with no `cause:` takes `$!` as its cause unless its cause
 * is already defined or it is `$!` itself, and a `$!` whose own cause is not
 * defined has it settled as `nil`. JS has no `$!`, so the exception being
 * rescued is passed as `errinfo`; a defined cause is an own `cause` property.
 *
 * @noRailsEquivalent PERMANENT
 */
export function excSetupMessage<T>(mesg: T, errinfo: unknown): T {
  if (mesg === null || typeof mesg !== "object" || Object.hasOwn(mesg, "cause")) return mesg;
  if (errinfo != null && errinfo !== mesg) {
    (mesg as { cause?: unknown }).cause = errinfo;
    if (typeof errinfo === "object" && !Object.hasOwn(errinfo, "cause")) {
      (errinfo as { cause?: unknown }).cause = null;
    }
  }
  return mesg;
}
