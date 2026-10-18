import { Exception } from "./exception.js";
import { rbModName, rbObjAsString } from "./object.js";

/**
 * `exc_to_s` (`vendor/ruby/v3.3.11/error.c:1463`), `Exception#to_s`: the
 * message, or the class name when there is none. Ruby's `mesg` ivar is the own
 * `message` property `Error`'s constructor seats only when given a message. A
 * JS `throw` takes any value, so one that is not an `Error` renders as
 * `rb_obj_as_string` does.
 *
 * @noRailsEquivalent PERMANENT
 */
export function excToS(exc: unknown): string {
  if (!(exc instanceof Error)) return rbObjAsString(exc);
  const mesg: unknown = Object.hasOwn(exc, "message")
    ? Object.getOwnPropertyDescriptor(exc, "message")!.value
    : exc instanceof Exception
      ? null
      : exc.message;

  if (mesg == null) return rbModName(exc.constructor) ?? "";
  return rbObjAsString(mesg);
}

Exception.prototype.toS = function (this: Exception) {
  return excToS(this);
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
