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

interface Transfer {
  promise: Promise<unknown>;
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

function newTransfer(): Transfer {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Fiber.yield` (`vendor/ruby/v3.3.11/cont.c:3263`).
   *
   * A JS body cannot be switched away from, so the fiber's body suspends by
   * awaiting the returned promise, which the next `resume` settles.
   */
  static yield(): Promise<void> {
    const fiber = Fiber.current();
    const transfer = fiber.#transfer;
    if (transfer === null) {
      throw new FiberError("attempt to yield on a not resumed fiber");
    }
    fiber.#status = "suspended";
    fiber.#transfer = null;
    return new Promise<void>((resolve) => {
      fiber.#continue = resolve;
      transfer.resolve(undefined);
    });
  }

  readonly #thread: Thread = Thread.current();
  readonly #block: () => R;
  #status: "created" | "resumed" | "suspended" | "terminated" = "created";
  #running = false;
  #transfer: Transfer | null = null;
  #continue: (() => void) | null = null;

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Fiber.new` (`vendor/ruby/v3.3.11/cont.c:3539`).
   */
  constructor(block: () => R) {
    this.#block = block;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Fiber#resume` (`vendor/ruby/v3.3.11/cont.c:3543`).
   *
   * Resuming an async body whose segment is still in flight returns that
   * segment's promise instead of raising `fiber_resume_kw`'s double-resume
   * error (`cont.c:2986-2987`). A Ruby resumer is blocked until the fiber
   * yields or terminates, so a second outside resume cannot happen there; a JS
   * resumer is not blocked, and the later caller waits exactly as Ruby's first
   * one would, receiving the segment's value or its error. A resume re-entered
   * while the body is still running synchronously keeps Ruby's error.
   */
  resume(): R {
    if (this.#status === "terminated") {
      throw new FiberError("attempt to resume a terminated fiber");
    } else if (this === Fiber.current()) {
      throw new FiberError("attempt to resume the current fiber");
    } else if (this.#status === "resumed") {
      if (this.#transfer !== null && !this.#running) return this.#transfer.promise as R;
      throw new FiberError("attempt to resume a resumed fiber (double resume)");
    }
    if (this.#thread !== Thread.current()) {
      throw new FiberError("fiber called across threads");
    }

    const transfer = (this.#transfer = newTransfer());
    if (this.#status === "suspended") {
      this.#status = "resumed";
      const resume = this.#continue!;
      this.#continue = null;
      resume();
      return transfer.promise as R;
    }

    this.#status = "resumed";
    let value: R;
    this.#running = true;
    try {
      value = currentSlot().run(this as Fiber, this.#block);
    } catch (error) {
      this.#status = "terminated";
      this.#transfer = null;
      throw error;
    } finally {
      this.#running = false;
    }
    if (value && typeof (value as unknown as PromiseLike<unknown>).then === "function") {
      const terminate = (settle: (current: Transfer) => void) => {
        this.#status = "terminated";
        const current = this.#transfer;
        this.#transfer = null;
        if (current !== null) settle(current);
      };
      (value as unknown as PromiseLike<unknown>).then(
        (result) => terminate((current) => current.resolve(result)),
        (error) => terminate((current) => current.reject(error)),
      );
      return transfer.promise as R;
    }
    this.#status = "terminated";
    this.#transfer = null;
    return value;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Fiber#alive?` (`vendor/ruby/v3.3.11/cont.c:3551`).
   */
  isAlive(): boolean {
    return this.#status !== "terminated";
  }
}
