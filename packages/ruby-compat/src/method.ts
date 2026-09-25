import { NameError } from "./name-error.js";
import { rbObjClass } from "./object.js";

/**
 * Ruby core `Method` (`vendor/ruby/proc.c:1657` `mnew_missing` builds the
 * `method_missing`-backed kind): a method bound to its receiver.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Method {
  readonly #receiver: unknown;
  readonly #name: string;
  readonly #func: (...args: unknown[]) => unknown;

  /**
   * `mnew_internal` (`vendor/ruby/proc.c:1689`): the receiver, name and body a
   * `Method` binds.
   *
   * @noRailsEquivalent PERMANENT
   */
  constructor(receiver: unknown, name: string, func: (...args: unknown[]) => unknown) {
    this.#receiver = receiver;
    this.#name = name;
    this.#func = func;
  }

  /**
   * `Method#call` (`vendor/ruby/proc.c:2500` `rb_method_call`).
   *
   * @noRailsEquivalent PERMANENT
   */
  call(...args: unknown[]): unknown {
    return this.#func.apply(this.#receiver, args);
  }

  /**
   * `Method#receiver` (`vendor/ruby/proc.c:1923` `method_receiver`).
   *
   * @noRailsEquivalent PERMANENT
   */
  receiver(): unknown {
    return this.#receiver;
  }

  /**
   * `Method#name` (`vendor/ruby/proc.c:1939` `method_name`).
   *
   * @noRailsEquivalent PERMANENT
   */
  name(): string {
    return this.#name;
  }

  /**
   * `Method#arity` (`vendor/ruby/proc.c:2872` `method_arity`, over
   * `method_def_arity` at `:2808`): the required count when it is also the
   * maximum, else `-min-1`. JS `Function#length` stops counting at the first
   * default, so `(gid)` and `(gid, options = {})` both report 1; the parameter
   * list is read from the function's source instead.
   *
   * @noRailsEquivalent PERMANENT
   */
  arity(): number {
    const src = Function.prototype.toString.call(this.#func);
    const open = src.indexOf("(");
    const arrow = src.indexOf("=>");
    if (arrow !== -1 && (open === -1 || arrow < open)) {
      return src
        .slice(0, arrow)
        .replace(/^async\s+/, "")
        .trim() === ""
        ? 0
        : 1;
    }
    let depth = 0;
    let current = "";
    const params: string[] = [];
    for (let i = open + 1; i < src.length; i++) {
      const ch = src[i];
      if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) {
        if (depth === 0) break;
        depth--;
      } else if (ch === "," && depth === 0) {
        params.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    if (current.trim() !== "") params.push(current.trim());
    const min = params.filter((p) => !p.startsWith("...") && !/^[^=]*[^=!<>]=[^=>]/.test(p)).length;
    const max = params.some((p) => p.startsWith("...")) ? -1 : params.length;
    return min === max ? min : -min - 1;
  }
}

/**
 * `Kernel#method` (`vendor/ruby/proc.c:2079` `rb_obj_method`, over `obj_method`
 * at `:2025`): the receiver's own method, else a `method_missing`-backed one
 * when `respond_to_missing?` answers for the name (`mnew_missing_by_name`,
 * `:1680`), else `rb_method_name_error`'s `NameError` (`:1996`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbObjMethod(obj: unknown, vid: string): Method {
  for (let o: object | null = Object(obj); o; o = Object.getPrototypeOf(o) as object | null) {
    const entry = Object.getOwnPropertyDescriptor(o, vid);
    if (entry && typeof entry.value === "function") {
      return new Method(obj, vid, entry.value as (...args: unknown[]) => unknown);
    }
    if (entry) break;
  }
  const target = obj as {
    respondToMissing?: (method: string, includePrivate: boolean) => unknown;
    methodMissing?: (method: string, ...args: unknown[]) => unknown;
  };
  const found = target.respondToMissing?.(vid, false);
  if (found != null && found !== false) {
    return new Method(obj, vid, (...args) => target.methodMissing!(vid, ...args));
  }
  throw new NameError(`undefined method '${vid}' for an instance of ${rbObjClass(obj)}`, vid, {
    receiver: obj,
  });
}
