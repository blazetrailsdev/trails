import { Exception } from "./exception.js";
import { rbModName, rbObjAsString } from "./object.js";

/**
 * `exc_to_s` (`vendor/ruby/v3.3.11/error.c:1463`), `Exception#to_s`: the
 * message, or the class name when there is none; an {@link Exception} answers
 * its own `toS`. A JS `throw` takes any value, so one that is not an `Error`
 * renders as `rb_obj_as_string` does.
 *
 * @noRailsEquivalent PERMANENT
 */
export function excToS(exc: unknown): string {
  if (!(exc instanceof Error)) return rbObjAsString(exc);
  if (exc instanceof Exception) return exc.toS();
  const mesg: unknown = exc.message;

  if (mesg == null) return rbModName(exc.constructor) ?? "";
  return rbObjAsString(mesg);
}
