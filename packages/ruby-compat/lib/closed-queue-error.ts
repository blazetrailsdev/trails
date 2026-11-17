import { StopIteration } from "./stop-iteration.js";

/**
 * Ruby's core `ClosedQueueError` (`vendor/ruby/v3.3.11/thread_sync.c:1675`),
 * raised by a push onto a closed `Thread::Queue`.
 *
 * @noRailsEquivalent PERMANENT
 */
export class ClosedQueueError extends StopIteration {}
