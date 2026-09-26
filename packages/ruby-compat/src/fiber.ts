import {
  getAsyncContext,
  type AsyncContext,
  type AsyncContextAdapter,
} from "./async-context-adapter.js";
import { FiberError } from "./fiber-error.js";
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
 * @noRailsEquivalent PERMANENT — Ruby core `Fiber` (`vendor/ruby/v3.3.11/cont.c:3530`).
 */
export class Fiber<R = unknown> {
  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Fiber.current` (`vendor/ruby/v3.3.11/cont.c:3534`).
   */
  static current(): Fiber {
    const thread = Thread.current();
    const fiber = currentSlot().getStore();
    if (fiber && fiber.#thread === thread) return fiber;
    let root = _roots.get(thread);
    if (!root) {
      _roots.set(thread, (root = new Fiber<unknown>(() => undefined)));
      root.#status = "resumed";
    }
    return root;
  }

  readonly #thread: Thread = Thread.current();
  readonly #block: () => R;
  #status: "created" | "resumed" | "terminated" = "created";

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Fiber.new` (`vendor/ruby/v3.3.11/cont.c:3539`).
   */
  constructor(block: () => R) {
    this.#block = block;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Fiber#resume` (`vendor/ruby/v3.3.11/cont.c:3543`).
   */
  resume(): R {
    if (this.#status === "terminated") {
      throw new FiberError("attempt to resume a terminated fiber");
    } else if (this === Fiber.current()) {
      throw new FiberError("attempt to resume the current fiber");
    } else if (this.#status === "resumed") {
      throw new FiberError("attempt to resume a resumed fiber (double resume)");
    }
    if (this.#thread !== Thread.current()) {
      throw new FiberError("fiber called across threads");
    }

    this.#status = "resumed";
    let value: R;
    try {
      value = currentSlot().run(this as Fiber, this.#block);
    } catch (error) {
      this.#status = "terminated";
      throw error;
    }
    if (value && typeof (value as unknown as PromiseLike<unknown>).then === "function") {
      const terminate = () => void (this.#status = "terminated");
      (value as unknown as PromiseLike<unknown>).then(terminate, terminate);
    } else {
      this.#status = "terminated";
    }
    return value;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Fiber#alive?` (`vendor/ruby/v3.3.11/cont.c:3551`).
   */
  isAlive(): boolean {
    return this.#status !== "terminated";
  }
}
