import { Executor } from "@blazetrails/activesupport";
import { Concurrent } from "@blazetrails/ruby-compat";
import { ActiveRecordError } from "./errors.js";
import type { Base } from "./base.js";

/** @internal */
let _base: typeof Base | undefined;

/** @internal */
export function _registerBase(base: typeof Base): void {
  _base = base;
}

function baseClass(): typeof Base {
  if (!_base) throw new ActiveRecordError("ActiveRecord::Base has not finished loading");
  return _base;
}

/** @internal */
export class AsynchronousQueriesTracker {
  static Session: typeof Session;

  #stack: Session[];

  constructor() {
    this.#stack = [];
  }

  static installExecutorHooks(executor: typeof Executor = Executor): void {
    executor.registerHook(this);
  }

  static run(): AsynchronousQueriesTracker {
    const tracker = baseClass().asynchronousQueriesTracker();
    tracker.startSession();
    return tracker;
  }

  static complete(
    asynchronousQueriesTracker: AsynchronousQueriesTracker,
  ): Promise<AsynchronousQueriesTracker> {
    return asynchronousQueriesTracker.finalizeSession();
  }

  get currentSession(): Session {
    const session = this.#stack[this.#stack.length - 1];
    if (!session)
      throw new ActiveRecordError("Can't perform asynchronous queries without a query session");
    return session;
  }

  startSession(): Session[] {
    const session = new Session();
    this.#stack.push(session);
    return this.#stack;
  }

  async finalizeSession(wait = false): Promise<this> {
    const session = this.#stack.pop();
    await session?.finalize(wait);
    return this;
  }
}

/** @internal */
export class Session {
  #active: InstanceType<typeof Concurrent.AtomicBoolean>;
  #lock: InstanceType<typeof Concurrent.ReadWriteLock>;

  constructor() {
    this.#active = new Concurrent.AtomicBoolean(true);
    this.#lock = new Concurrent.ReadWriteLock();
  }

  isActive(): boolean {
    return this.#active.isTrue();
  }

  synchronize<T>(block: () => T): T | Promise<Awaited<T>> {
    return this.#lock.withReadLock(block);
  }

  async finalize(wait = false): Promise<void> {
    this.#active.makeFalse();
    if (wait) {
      await this.#lock.withWriteLock(() => {});
    }
  }
}

AsynchronousQueriesTracker.Session = Session;
