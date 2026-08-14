import { ActiveRecordError } from "./errors.js";

/**
 * Tracks the async-query sessions opened around a unit of work.
 *
 * Rails guards each session with `Concurrent::AtomicBoolean` and a
 * `Concurrent::ReadWriteLock` so a worker thread can be barred from starting a
 * query once the request that opened the session has finished. On a
 * single-threaded event loop the boolean needs no atomicity and the read/write
 * lock collapses to running the block inline: nothing can interleave between
 * the `active()` check and the block.
 *
 * Mirrors: ActiveRecord::AsynchronousQueriesTracker (asynchronous_queries_tracker.rb)
 * @internal
 */
export class AsynchronousQueriesTracker {
  /** Mirrors Ruby's nested `AsynchronousQueriesTracker::Session`. */
  static Session: typeof Session;

  #stack: Session[] = [];

  static run(tracker: AsynchronousQueriesTracker): AsynchronousQueriesTracker {
    tracker.startSession();
    return tracker;
  }

  static complete(asynchronousQueriesTracker: AsynchronousQueriesTracker): void {
    asynchronousQueriesTracker.finalizeSession();
  }

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

/**
 * Mirrors: ActiveRecord::AsynchronousQueriesTracker::Session
 * (asynchronous_queries_tracker.rb:8-29)
 * @internal
 */
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
