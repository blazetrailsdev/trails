import {
  getAsyncContext,
  type AsyncContext,
  type AsyncContextAdapter,
} from "./async-context-adapter.js";
import { Thread } from "./thread.js";

let _current: AsyncContext<Fiber> | null = null;
let _adapter: AsyncContextAdapter | null = null;
const _roots = new WeakMap<Thread, Fiber>();

function currentSlot(): AsyncContext<Fiber> {
  const adapter = getAsyncContext();
  if (!_current || _adapter !== adapter) {
    _adapter = adapter;
    _current = adapter.create<Fiber>();
  }
  return _current;
}

/**
 * @noRailsEquivalent PERMANENT — Ruby core `Fiber` (`vendor/ruby/cont.c:3530`).
 */
export class Fiber<R = unknown> {
  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Fiber.current` (`vendor/ruby/cont.c:3534`).
   */
  static current(): Fiber {
    const thread = Thread.current();
    const fiber = currentSlot().getStore();
    if (fiber && fiber.#thread === thread) return fiber;
    let root = _roots.get(thread);
    if (!root) _roots.set(thread, (root = new Fiber<unknown>(() => undefined)));
    return root;
  }

  readonly #thread: Thread = Thread.current();
  readonly #block: () => R;
  #terminated = false;

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Fiber.new` (`vendor/ruby/cont.c:3539`).
   */
  constructor(block: () => R) {
    this.#block = block;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Fiber#resume` (`vendor/ruby/cont.c:3543`).
   */
  resume(): R {
    try {
      return currentSlot().run(this as Fiber, this.#block);
    } finally {
      this.#terminated = true;
    }
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Fiber#alive?` (`vendor/ruby/cont.c:3551`).
   */
  isAlive(): boolean {
    return !this.#terminated;
  }
}
