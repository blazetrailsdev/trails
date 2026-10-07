import { Exception } from "./exception.js";
import { rbModName } from "./object.js";
import { RuntimeError } from "./runtime-error.js";

const underline = "\x1b[1;4m";
const bold = "\x1b[1m";
const reset = "\x1b[m";

/**
 * `rb_decorate_message` (`vendor/ruby/v3.3.11/eval_error.c:128`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbDecorateMessage(eclass: object, emesg: unknown, highlight: boolean): string {
  let str = "";
  let einfo = emesg == null ? "" : String(emesg);

  if (eclass === RuntimeError && einfo.length === 0) {
    if (highlight) str += underline;
    str += "unhandled exception";
    if (highlight) str += reset;
  } else {
    let epath = rbModName(eclass);
    if (einfo.length === 0) {
      if (highlight) str += underline;
      str += epath;
      if (highlight) str += reset;
    } else {
      let tail = einfo.indexOf("\n");

      if (highlight) str += bold;
      if (epath?.[0] === "#") epath = null;
      str += tail !== -1 ? einfo.slice(0, tail++) : einfo;
      if (epath != null) {
        str += " (";
        if (highlight) str += underline;
        str += epath;
        if (highlight) str += reset + bold;
        str += ")";
        if (highlight) str += reset;
      }
      if (tail > 0 && einfo.length > tail) {
        if (!highlight) {
          str += "\n" + einfo.slice(tail);
        } else {
          einfo = einfo.slice(tail);
          str += "\n";
          while (einfo.length > 0) {
            tail = einfo.indexOf("\n");
            if (tail !== 0) {
              str += bold + (tail === -1 ? einfo : einfo.slice(0, tail)) + reset;
              if (tail === -1) break;
            }
            einfo = einfo.slice(tail);
            tail = 0;
            do ++tail;
            while (tail < einfo.length && einfo[tail] === "\n");
            str += einfo.slice(0, tail);
            einfo = einfo.slice(tail);
          }
        }
      }
    }
  }

  return str;
}

/**
 * `exc_detailed_message` (`vendor/ruby/v3.3.11/error.c:1657`),
 * `Exception#detailed_message`, defined on `Exception` as
 * `rb_define_method(rb_eException, "detailed_message", …)` (`error.c:3304`)
 * defines it.
 *
 * @noRailsEquivalent PERMANENT
 */
export function excDetailedMessage(
  this: Error,
  opt: { highlight?: boolean | null } | null = null,
): string {
  const highlight = opt?.highlight ?? false;

  return rbDecorateMessage(this.constructor, this.message, highlight);
}

Exception.prototype.detailedMessage = excDetailedMessage;
