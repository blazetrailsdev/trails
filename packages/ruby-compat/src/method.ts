import { NameError } from "./name-error.js";
import { checkArity } from "./string/support.js";
import { rbObjClass } from "./object.js";

/**
 * Ruby core `Method` (`vendor/ruby/v3.3.11/proc.c:1657` `mnew_missing` builds the
 * `method_missing`-backed kind): a method bound to its receiver.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Method {
  readonly #receiver: unknown;
  readonly #name: string;
  readonly #func: (...args: unknown[]) => unknown;

  /**
   * `mnew_internal` (`vendor/ruby/v3.3.11/proc.c:1689`): the receiver, name and body a
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
   * `Method#call` (`vendor/ruby/v3.3.11/proc.c:2500` `rb_method_call`).
   *
   * @noRailsEquivalent PERMANENT
   */
  call(...args: unknown[]): unknown {
    return this.#func.apply(this.#receiver, args);
  }

  /**
   * `Method#receiver` (`vendor/ruby/v3.3.11/proc.c:1923` `method_receiver`).
   *
   * @noRailsEquivalent PERMANENT
   */
  receiver(): unknown {
    return this.#receiver;
  }

  /**
   * `Method#name` (`vendor/ruby/v3.3.11/proc.c:1939` `method_name`).
   *
   * @noRailsEquivalent PERMANENT
   */
  name(): string {
    return this.#name;
  }

  /**
   * `Method#arity` (`vendor/ruby/v3.3.11/proc.c:2872` `method_arity`, over
   * `method_def_arity` at `:2808`): the required count when it is also the
   * maximum, else `-min-1`.
   *
   * @noRailsEquivalent PERMANENT
   */
  arity(): number {
    const [min, max] = rbIseqMinMaxArity(this.#func);
    return min === max ? min : -min - 1;
  }

  /**
   * `Method#source_location` (`vendor/ruby/v3.3.11/proc.c:3015` `rb_method_location`):
   * `[path, first_lineno]`, or `nil` for a body no {@link iseqLocationSetup} located.
   *
   * @noRailsEquivalent PERMANENT
   */
  sourceLocation(): [string, number] | null {
    return locations.get(this.#func) ?? null;
  }
}

const locations = new WeakMap<object, [string, number]>();

/**
 * `iseq_location_setup` (`vendor/ruby/v3.3.11/iseq.c:550`): the `path` and
 * `first_lineno` of a body, which a JS function does not expose by itself.
 *
 * @noRailsEquivalent PERMANENT
 */
export function iseqLocationSetup(
  iseq: (...args: never[]) => unknown,
  path: string,
  firstLineno: number,
): void {
  locations.set(iseq, [path, firstLineno]);
}

/**
 * `Kernel#method` (`vendor/ruby/v3.3.11/proc.c:2079` `rb_obj_method`, over `obj_method`
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

/**
 * `rb_iseq_min_max_arity` (`vendor/ruby/v3.3.11/proc.c:1069`): a body's
 * `[min, max]` argument counts, `max` `Infinity` for `UNLIMITED_ARGUMENTS`
 * once a rest parameter appears. JS `Function#length` stops counting at the
 * first default, so `(gid)` and `(gid, options = {})` both report 1; the
 * parameter list is read from the function's source instead.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbIseqMinMaxArity(func: (...args: never[]) => unknown): [number, number] {
  const src = Function.prototype.toString.call(func);
  const open = src.indexOf("(");
  const arrow = src.indexOf("=>");
  if (arrow !== -1 && (open === -1 || arrow < open)) {
    const lead =
      src
        .slice(0, arrow)
        .replace(/^async\s+/, "")
        .trim() === ""
        ? 0
        : 1;
    return [lead, lead];
  }
  let depth = 0;
  let current = "";
  let optional = false;
  const params: { text: string; optional: boolean }[] = [];
  for (let i = open + 1; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const start = i;
      for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === "\\") i++;
      current += src.slice(start, i + 1);
      continue;
    }
    if (ch === "/" && (src[i + 1] === "/" || src[i + 1] === "*")) {
      const close = src.indexOf(src[i + 1] === "/" ? "\n" : "*/", i + 2);
      i = close === -1 ? src.length : src[i + 1] === "/" ? close : close + 1;
      continue;
    }
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) {
      if (depth === 0) break;
      depth--;
    } else if (depth === 0 && ch === ",") {
      params.push({ text: current.trim(), optional });
      current = "";
      optional = false;
      continue;
    } else if (depth === 0 && ch === "=") optional = true;
    current += ch;
  }
  if (current.trim() !== "") params.push({ text: current.trim(), optional });
  const rest = params.some((p) => p.text.startsWith("..."));
  const min = params.filter((p) => !p.optional && !p.text.startsWith("...")).length;
  const max = rest ? Infinity : params.length;
  return [min, max];
}

/**
 * `argument_arity_error` (`vendor/ruby/v3.3.11/vm_args.c:800`), raised where
 * `setup_parameters_complex` finds `argc` outside the callee's range. JS never
 * checks call arity (a missing argument is `undefined`, an extra one is
 * dropped), so a caller whose Ruby body rescues that `ArgumentError` checks
 * the body's parameter list before sending.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbCheckArity(method: (...args: never[]) => unknown, argc: number): void {
  const [min, max] = rbIseqMinMaxArity(method);
  checkArity(argc, min, max);
}
