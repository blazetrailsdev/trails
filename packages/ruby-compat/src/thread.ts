import { isSymbol, symbolToS } from "./symbol.js";
import {
  getAsyncContext,
  type AsyncContext,
  type AsyncContextAdapter,
} from "./async-context-adapter.js";

let _current: AsyncContext<Thread> | null = null;
let _adapter: AsyncContextAdapter | null = null;
let _threadIdCounter = 0;
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
   * which sleeps the current thread until another wakes or kills it. Nothing
   * here wakes one, so the promise never settles and a killed thread's body
   * stops at this call, as Ruby's does.
   */
  static stop(): Promise<null> {
    return new Promise(() => {});
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
  status: "run" | "dead";
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
    this.status = "run";
    const frame = new Error().stack?.split("\n")[2] ?? "";
    const location = /\(?((?:file:\/\/)?[^\s()]+):(\d+):\d+\)?$/.exec(frame);
    if (location) _locations.set(this, `${location[1]}:${location[2]}`);
    try {
      this.#value = currentSlot().run(this as Thread, () => block(...args));
    } catch (error) {
      this.#error = { raised: error };
      this.status = "dead";
      if (this.abortOnException) this.#abort(error);
      return;
    }
    const value = this.#value as unknown;
    if (value && typeof (value as PromiseLike<unknown>).then === "function") {
      const die = () => void (this.status = "dead");
      (value as PromiseLike<unknown>).then(die, (error) => {
        die();
        if (this.abortOnException) this.#abort(error);
      });
    } else {
      this.status = "dead";
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
