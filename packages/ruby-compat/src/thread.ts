import {
  getAsyncContext,
  type AsyncContext,
  type AsyncContextAdapter,
} from "./async-context-adapter.js";

let _current: AsyncContext<Thread> | null = null;
let _adapter: AsyncContextAdapter | null = null;
let _threadIdCounter = 0;
const _locations = new WeakMap<object, string>();

function currentSlot(): AsyncContext<Thread> {
  const adapter = getAsyncContext();
  if (!_current || _adapter !== adapter) {
    _adapter = adapter;
    _current = adapter.create<Thread>();
  }
  return _current;
}

/**
 * @noRailsEquivalent PERMANENT — Ruby core `Thread` (`vendor/ruby/vm.c:4043`).
 */
export class Thread<R = unknown> {
  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread.main` (`vendor/ruby/thread.c:2962`).
   */
  static readonly main: Thread = Object.assign(Object.create(Thread.prototype) as Thread, {
    id: 0,
    status: "run",
    name: null,
  });

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread.current` (`vendor/ruby/thread.c:2943`).
   */
  static current(): Thread {
    return currentSlot().getStore() ?? Thread.main;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread.pass` (`vendor/ruby/thread.c:1904`).
   */
  static pass(): Promise<null> {
    return new Promise((resolve) => setTimeout(() => resolve(null), 0));
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread` object identity (`vendor/ruby/thread.c:3473`).
   */
  readonly id: number;
  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#status` (`vendor/ruby/thread.c:3480`).
   */
  status: "run" | "dead";
  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#name` (`vendor/ruby/thread.c:3396`).
   */
  name: string | null = null;
  #value!: R;
  #error: { raised: unknown } | null = null;

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread.new` (`vendor/ruby/thread.c:897`).
   */
  constructor(block: () => R) {
    this.id = ++_threadIdCounter;
    this.status = "run";
    const frame = new Error().stack?.split("\n")[2] ?? "";
    const location = /\(?((?:file:\/\/)?[^\s()]+):(\d+):\d+\)?$/.exec(frame);
    if (location) _locations.set(this, `${location[1]}:${location[2]}`);
    try {
      this.#value = currentSlot().run(this as Thread, block);
    } catch (error) {
      this.#error = { raised: error };
      this.status = "dead";
      return;
    }
    const value = this.#value as unknown;
    if (value && typeof (value as PromiseLike<unknown>).then === "function") {
      const die = () => void (this.status = "dead");
      (value as PromiseLike<unknown>).then(die, die);
    } else {
      this.status = "dead";
    }
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#value` (`vendor/ruby/thread.c:1222`).
   */
  value(): R {
    if (this.#error) throw this.#error.raised;
    return this.#value;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#to_s` (`vendor/ruby/thread.c:3473`).
   */
  toString(): string {
    const location = _locations.has(this) ? ` ${_locations.get(this)}` : "";
    const name = this.name != null ? `@${this.name}` : "";
    const cname = this.constructor.name;
    return `#<${cname}:0x${this.id.toString(16).padStart(16, "0")}${name}${location} ${this.status}>`;
  }
}
