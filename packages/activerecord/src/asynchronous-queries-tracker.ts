import { Executor } from "@blazetrails/activesupport";
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

  static complete(asynchronousQueriesTracker: AsynchronousQueriesTracker): void {
    asynchronousQueriesTracker.finalizeSession();
  }

  /** @missingRailsCall last — PERMANENT */
  get currentSession(): Session {
    const session = this.#stack[this.#stack.length - 1];
    if (!session)
      throw new ActiveRecordError("Can't perform asynchronous queries without a query session");
    return session;
  }

  startSession(): void {
    const session = new Session();
    this.#stack.push(session);
  }

  finalizeSession(wait = false): this {
    const session = this.#stack.pop();
    session?.finalize(wait);
    return this;
  }
}

/** @internal */
export class Session {
  #active = true;

  active(): boolean {
    return this.#active;
  }

  synchronize<T>(block: () => T): T {
    return block();
  }

  finalize(_wait = false): void {
    this.#active = false;
  }
}

AsynchronousQueriesTracker.Session = Session;
