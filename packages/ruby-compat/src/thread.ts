import { excBacktraceLocations, type Location } from "./backtrace-location.js";
import { ThreadError } from "./thread-error.js";
import { isSymbol, symbolToS } from "./symbol.js";
import {
  getAsyncContext,
  type AsyncContext,
  type AsyncContextAdapter,
} from "./async-context-adapter.js";

class IterBreak {
  constructor(readonly value: unknown) {}
}

/**
 * `rb_iter_break_value` (`vendor/ruby/v3.3.11/vm.c:2058`), Ruby's `break val`
 * in a block: the walk the block was yielded from stops, and the method that
 * yielded answers `val`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbIterBreakValue(val: unknown): never {
  throw new IterBreak(val);
}

let _current: AsyncContext<Thread> | null = null;
let _adapter: AsyncContextAdapter | null = null;
let _threadIdCounter = 0;
const _threads = new Set<Thread>();
const _locations = new WeakMap<object, string>();
const _locals = new WeakMap<object, Map<string, unknown>>();
const _variables = new WeakMap<object, Map<string, unknown>>();

function currentSlot(): AsyncContext<Thread> {
  const adapter = getAsyncContext();
  if (!_current || _adapter !== adapter) {
    _adapter = adapter;
    _current = adapter.create<Thread>();
  }
  return _current;
}

/**
 * @noRailsEquivalent PERMANENT — Ruby core `Thread` (`vendor/ruby/v3.3.11/vm.c:4043`).
 */
export class Thread<R = unknown> {
  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread.main` (`vendor/ruby/v3.3.11/thread.c:2962`).
   */
  static readonly main: Thread = Object.assign(Object.create(Thread.prototype) as Thread, {
    id: 0,
    status: "run",
    name: null,
  });

  /**
   * `Thread.list` (`vendor/ruby/v3.3.11/thread.c:2922` `thread_list`), the
   * main thread and every thread still alive (`rb_thread_list`, `:2895`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Thread.list` (`vendor/ruby/v3.3.11/thread.c:2922`).
   */
  static list(): Thread[] {
    return [Thread.main, ..._threads];
  }

  /**
   * `rb_thread_s_handle_interrupt` (`vendor/ruby/v3.3.11/thread.c:2230`), which
   * masks asynchronous interrupts (`Thread#raise`, `Thread#kill`) around the
   * block. Nothing can interrupt a JS body from outside, so every mask is
   * already in force and the block runs as it is.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Thread.handle_interrupt` (`vendor/ruby/v3.3.11/thread.c:2230`).
   */
  static handleInterrupt<T>(maskArg: Readonly<Record<string, string>>, block: () => T): T {
    return block();
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread.stop` (`vendor/ruby/v3.3.11/thread.c:2861`),
   * which sleeps the current thread until another wakes or kills it. A thread
   * woken by `wakeup` / `run` before it reaches this call does not sleep: MRI's
   * GVL lets a new thread run to its first blocking point before its creator
   * resumes, so Ruby's `t.run` always finds the thread asleep, and a JS body
   * reaches this call only after awaits the creator does not wait for. A killed
   * thread's body stops at this call, as Ruby's does.
   */
  static stop(): Promise<null> {
    const th = Thread.current();
    if (!(#ready in th)) return new Promise(() => {});
    if (th.#ready) {
      th.#ready = false;
      return Promise.resolve(null);
    }
    th.status = "sleep";
    return new Promise((resolve) => (th.#wake = () => resolve(null)));
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread.pass` (`vendor/ruby/v3.3.11/thread.c:1904`),
   * which hands the scheduler to another thread: here, to every other pending
   * task and timer.
   */
  static pass(): Promise<null> {
    return new Promise((resolve) => setTimeout(() => resolve(null), 0));
  }

  /**
   * `Thread.each_caller_location` (`vendor/ruby/v3.3.11/vm_backtrace.c:1273-1278`):
   * yields each frame above the method calling it, as `caller_locations` would
   * answer them, and answers nil. A block that calls `rbIterBreakValue(val)`
   * stops the walk, and the call answers `val`. The break is a thrown value, so a
   * block that catches every thrown value swallows it.
   *
   * @noRailsEquivalent PERMANENT
   */
  static eachCallerLocation<V = never>(block: (location: Location) => void): V | null {
    const V8Error = Error as {
      stackTraceLimit?: number;
      captureStackTrace?: (exc: object, fn: unknown) => void;
    };
    const exc = new Error();
    const stackTraceLimit = V8Error.stackTraceLimit;
    V8Error.stackTraceLimit = Infinity;
    try {
      V8Error.captureStackTrace?.(exc, Thread.eachCallerLocation);
    } finally {
      V8Error.stackTraceLimit = stackTraceLimit;
    }
    try {
      for (const location of (excBacktraceLocations(exc) ?? []).slice(1)) block(location);
    } catch (e) {
      if (e instanceof IterBreak) return e.value as V;
      throw e;
    }
    return null;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread.current` (`vendor/ruby/v3.3.11/thread.c:2943`).
   */
  static current(): Thread {
    return currentSlot().getStore() ?? Thread.main;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread` object identity (`vendor/ruby/v3.3.11/thread.c:3473`).
   */
  readonly id: number;
  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#status` (`vendor/ruby/v3.3.11/thread.c:3480`).
   */
  status: "run" | "sleep" | "dead";
  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#name` (`vendor/ruby/v3.3.11/thread.c:3396`).
   */
  name: string | null = null;
  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#abort_on_exception=` (`vendor/ruby/v3.3.11/thread.c:3069`):
   * an exception the thread dies of is re-raised in the main thread, which in JS
   * is a throw outside every promise chain.
   */
  abortOnException = false;
  #value!: R;
  #error: { raised: unknown } | null = null;
  #kill!: () => void;
  #wake: (() => void) | null = null;
  #ready = false;
  readonly #killed = new Promise<void>((resolve) => (this.#kill = resolve));

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread.new` (`vendor/ruby/v3.3.11/thread.c:897`):
   * the arguments before the block are handed to it (`thread_create_core`'s
   * `proc.args`, `vendor/ruby/v3.3.11/thread.c:822`).
   */
  constructor(...argsAndBlock: [...args: unknown[], block: (...args: never[]) => R]) {
    const block = argsAndBlock.pop() as (...args: unknown[]) => R;
    const args = argsAndBlock;
    this.id = ++_threadIdCounter;
    _threads.add(this as Thread);
    this.status = "run";
    const frame = new Error().stack?.split("\n")[2] ?? "";
    const location = /\(?((?:file:\/\/)?[^\s()]+):(\d+):\d+\)?$/.exec(frame);
    if (location) _locations.set(this, `${location[1]}:${location[2]}`);
    try {
      this.#value = currentSlot().run(this as Thread, () => block(...args));
    } catch (error) {
      this.#error = { raised: error };
      this.status = "dead";
      _threads.delete(this as Thread);
      if (this.abortOnException) this.#abort(error);
      return;
    }
    const value = this.#value as unknown;
    if (value && typeof (value as PromiseLike<unknown>).then === "function") {
      const die = () => {
        this.status = "dead";
        _threads.delete(this as Thread);
      };
      (value as PromiseLike<unknown>).then(die, (error) => {
        die();
        if (this.abortOnException) this.#abort(error);
      });
    } else {
      this.status = "dead";
      _threads.delete(this as Thread);
    }
  }

  #abort(error: unknown): void {
    queueMicrotask(() => {
      throw error;
    });
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#value` (`vendor/ruby/v3.3.11/thread.c:1222`).
   */
  value(): R {
    if (this.#error) throw this.#error.raised;
    return this.#value;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#join` (`vendor/ruby/v3.3.11/thread.c:1179`),
   * which waits for the thread to finish, re-raises the exception it died of, and
   * returns the thread itself. Ruby blocks the calling thread to wait; JS has no
   * synchronous await, so a thread whose block is async answers a `Promise` of
   * itself and the caller awaits it — the same language shortcoming the repo
   * guide ratifies for `serializable_hash` and `Relation`.
   */
  join(): this | Promise<this>;
  join(limit: number): this | null | Promise<this | null>;
  join(limit?: number): this | null | Promise<this | null> {
    if (this.#error) throw this.#error.raised;
    const value = this.#value as unknown;
    if (value && typeof (value as PromiseLike<unknown>).then === "function") {
      const joined = Promise.race([value as PromiseLike<unknown>, this.#killed]).then(() => this);
      if (limit == null) return joined;
      let timer: ReturnType<typeof setTimeout>;
      const expired = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), limit * 1000);
      });
      return Promise.race([joined, expired]).finally(() => clearTimeout(timer));
    }
    return this;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#wakeup` (`vendor/ruby/v3.3.11/thread.c:2805-2827`),
   * which raises `ThreadError` for a killed thread and otherwise marks it
   * eligible for scheduling, ending a `Thread.stop`.
   */
  wakeup(): this {
    if (this.status === "dead") throw new ThreadError("killed thread");
    const wake = this.#wake;
    if (wake == null) {
      this.#ready = true;
      return this;
    }
    this.#wake = null;
    this.status = "run";
    wake();
    return this;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#run` (`vendor/ruby/v3.3.11/thread.c:2852-2857`):
   * `wakeup`, then `rb_thread_schedule`, which here is `Thread.pass`.
   */
  async run(): Promise<this> {
    this.wakeup();
    await Thread.pass();
    return this;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#exit` / `#kill`
   * (`vendor/ruby/v3.3.11/thread.c:2710`), which terminates the thread and returns it.
   * MRI interrupts the thread wherever it is. JS cannot stop a running async
   * body from outside, so this marks the thread dead and settles a pending
   * `join`; a body parked in `Thread.stop` never resumes, and a body awaiting
   * anything else runs on to its end.
   */
  exit(): this {
    if (this.status === "dead") return this;
    this.status = "dead";
    _threads.delete(this as Thread);
    this.#kill();
    return this;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#kill` (`vendor/ruby/v3.3.11/thread.c:5403`).
   */
  kill(): this {
    return this.exit();
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#terminate` (`vendor/ruby/v3.3.11/thread.c:5404`).
   */
  terminate(): this {
    return this.exit();
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#alive?` (`vendor/ruby/v3.3.11/thread.c:5420`).
   */
  isAlive(): boolean {
    return this.status !== "dead";
  }

  /**
   * A dead thread answers `nil`, as Ruby's does. V8 exposes no stack for an
   * async context other than the running one, so a live thread answers an
   * empty backtrace.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#backtrace` (`vendor/ruby/v3.3.11/thread.c:5323`).
   */
  backtrace(): string[] | null {
    return this.status === "dead" ? null : [];
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#[]` (`vendor/ruby/v3.3.11/thread.c:5408`).
   */
  get(key: string): unknown {
    const id = isSymbol(key) ? symbolToS(key) : key;
    return _locals.get(this)?.get(id) ?? null;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#[]=` (`vendor/ruby/v3.3.11/thread.c:5409`).
   */
  set(key: string, value: unknown): unknown {
    const id = isSymbol(key) ? symbolToS(key) : key;
    let locals = _locals.get(this);
    if (value == null) {
      if (!locals) return null;
      locals.delete(id);
      return null;
    }
    if (!locals) _locals.set(this, (locals = new Map()));
    locals.set(id, value);
    return value;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#thread_variable_get` (`vendor/ruby/v3.3.11/thread.c:3722`).
   */
  threadVariableGet(key: string): unknown {
    return _variables.get(this)?.get(isSymbol(key) ? symbolToS(key) : key) ?? null;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#thread_variable_set` (`vendor/ruby/v3.3.11/thread.c:3743`).
   */
  threadVariableSet(key: string, val: unknown): unknown {
    let locals = _variables.get(this);
    if (!locals) _variables.set(this, (locals = new Map()));
    locals.set(isSymbol(key) ? symbolToS(key) : key, val);
    return val;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#keys` (`vendor/ruby/v3.3.11/thread.c:3810`).
   */
  keys(): string[] {
    return [...(_locals.get(this)?.keys() ?? [])];
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#to_s` (`vendor/ruby/v3.3.11/thread.c:3473`).
   */
  toString(): string {
    const location = _locations.has(this) ? ` ${_locations.get(this)}` : "";
    const name = this.name != null ? `@${this.name}` : "";
    const cname = this.constructor.name;
    return `#<${cname}:0x${this.id.toString(16).padStart(16, "0")}${name}${location} ${this.status}>`;
  }
}
