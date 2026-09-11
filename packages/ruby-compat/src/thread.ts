import {
  getAsyncContext,
  type AsyncContext,
  type AsyncContextAdapter,
} from "./async-context-adapter.js";

let _current: AsyncContext<Thread> | null = null;
let _adapter: AsyncContextAdapter | null = null;
let _threadIdCounter = 0;

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
   * @noRailsEquivalent PERMANENT — Ruby core `Thread` identity (`vendor/ruby/thread.c:3473`).
   */
  readonly id: number;
  #value!: R;

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread.new` (`vendor/ruby/thread.c:897`).
   */
  constructor(block: () => R) {
    this.id = ++_threadIdCounter;
    this.#value = currentSlot().run(this as Thread, block);
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#value` (`vendor/ruby/thread.c:1222`).
   */
  value(): R {
    return this.#value;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Thread#to_s` (`vendor/ruby/thread.c:3473`).
   */
  toString(): string {
    return `#<Thread:${this.id} run>`;
  }
}
