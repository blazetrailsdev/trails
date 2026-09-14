import { ArgumentError } from "./argument-error.js";
import {
  getAsyncContext,
  type AsyncContext,
  type AsyncContextAdapter,
} from "./async-context-adapter.js";
import { format } from "./kernel-format.js";
import { LocalJumpError } from "./local-jump-error.js";

/**
 * Ruby's core `UncaughtThrowError < ArgumentError`
 * (`vendor/ruby/vm_eval.c:2588-2591`): `initialize(tag, value, *args)` stores
 * the tag and value and hands the rest to `super`
 * (`uncaught_throw_init`, `vm_eval.c:2180-2188`); `to_s` formats the message
 * with the tag (`uncaught_throw_to_s`, `vm_eval.c:2222-2228`). A JS `message`
 * is read eagerly, so the format runs at construction.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `UncaughtThrowError`, which Rails
 * inherits rather than defines.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class UncaughtThrowError extends ArgumentError {
  constructor(tag: unknown, value: unknown, mesg: string) {
    super(format(mesg, tag));
    Object.assign(this, { tag, value });
  }
}

/** @noRailsEquivalent PERMANENT */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface UncaughtThrowError {
  readonly tag: unknown;
  readonly value: unknown;
}

UncaughtThrowError.prototype.name = "UncaughtThrowError";

interface RbVmTag {
  tag: unknown;
  retval: unknown;
  prev: RbVmTag | undefined;
}

class VmThrowData {
  constructor(readonly tag: unknown) {}
}

let _ecTag: AsyncContext<RbVmTag> | null = null;
let _adapter: AsyncContextAdapter | null = null;

function ecTagSlot(): AsyncContext<RbVmTag> {
  const adapter = getAsyncContext();
  if (!_ecTag || _adapter !== adapter) {
    _adapter = adapter;
    _ecTag = adapter.create<RbVmTag>();
  }
  return _ecTag;
}

/**
 * `Kernel#throw` (`vendor/ruby/vm_eval.c:2244-2251` `rb_f_throw`):
 * `rb_scan_args(argc, argv, "11", &tag, &value)`, then `rb_throw_obj`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#throw`, which Rails calls
 * without defining.
 */
export function kernelThrow(tag: unknown, value: unknown = null): never {
  if (arguments.length > 2) {
    throw new ArgumentError(`wrong number of arguments (given ${arguments.length}, expected 1..2)`);
  }
  return rbThrowObj(tag, value);
}

function rbThrowObj(tag: unknown, value: unknown): never {
  let tt = ecTagSlot().getStore();

  while (tt) {
    if (tt.tag === tag) {
      tt.retval = value;
      break;
    }
    tt = tt.prev;
  }
  if (!tt) {
    throw new UncaughtThrowError(tag, value, "uncaught throw %p");
  }

  throw new VmThrowData(tag);
}

/** @noRailsEquivalent PERMANENT */
export function kernelCatch<T>(block: (tag: object) => T): T | unknown;
/** @noRailsEquivalent PERMANENT */
export function kernelCatch<T>(tag: unknown, block: (tag: unknown) => T): T | unknown;
/**
 * `Kernel#catch` (`vendor/ruby/vm_eval.c:2331-2336` `rb_f_catch`): the tag
 * defaults to a fresh `Object.new`, and a missing block raises
 * `LocalJumpError` at `catch_i`'s `rb_yield_0`.
 *
 * A block returning a thenable keeps its tag pushed until it settles, and a
 * rejection carrying a matching throw resolves to the thrown value — the
 * `EC_POP_TAG` Ruby runs after the block returns, moved to where an async
 * block actually returns. A sync block stays sync.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#catch`, which Rails calls
 * without defining.
 */
export function kernelCatch(...argv: unknown[]): unknown {
  if (argv.length > 2) {
    throw new ArgumentError(`wrong number of arguments (given ${argv.length}, expected 0..1)`);
  }
  const block = argv.length === 2 ? argv[1] : argv[0];
  if (typeof block !== "function") {
    throw new LocalJumpError("no block given (yield)");
  }
  const tag = argv.length === 2 ? argv[0] : {};
  return rbCatchObj(tag, block as (tag: unknown) => unknown);
}

function rbCatchObj(tag: unknown, func: (tag: unknown) => unknown): unknown {
  const context = ecTagSlot();
  const tt: RbVmTag = { tag, retval: null, prev: context.getStore() };
  const rescue = (errinfo: unknown): unknown => {
    if (errinfo instanceof VmThrowData && errinfo.tag === tag) return tt.retval;
    throw errinfo;
  };
  return context.run(tt, () => {
    let val: unknown;
    try {
      val = func(tag);
    } catch (errinfo) {
      return rescue(errinfo);
    }
    if (val !== null && typeof (val as PromiseLike<unknown>)?.then === "function") {
      return Promise.resolve(val as PromiseLike<unknown>).then(undefined, rescue);
    }
    return val;
  });
}
