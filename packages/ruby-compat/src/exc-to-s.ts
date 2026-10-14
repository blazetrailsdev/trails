import { rbObjAsString } from "./object.js";

/**
 * `exc_to_s` (`vendor/ruby/v3.3.11/error.c:1463`), `Exception#to_s`: the
 * message, or the class name when there is none. A JS `throw` takes any
 * value, so one that is not an `Error` renders as `rb_obj_as_string` does.
 *
 * @noRailsEquivalent PERMANENT
 */
export function excToS(exc: unknown): string {
  if (!(exc instanceof Error)) return rbObjAsString(exc);
  const mesg: unknown = exc.message;

  if (mesg == null) return exc.constructor.name;
  return rbObjAsString(mesg);
}
