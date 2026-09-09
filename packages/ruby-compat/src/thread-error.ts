import { StandardError } from "./standard-error.js";

/**
 * Ruby's core `ThreadError` (`vendor/ruby/thread.c:5451`), a `StandardError`
 * subclass — what `rb_mutex_lock` raises with `"deadlock; recursive locking"`
 * when a fiber locks a `Mutex` it already holds
 * (`vendor/ruby/thread_sync.c:351`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `ThreadError`, which Rails inherits
 * rather than defines.
 */
export class ThreadError extends StandardError {}

ThreadError.prototype.name = "ThreadError";
