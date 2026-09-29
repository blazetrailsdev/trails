import { ArgumentError } from "./argument-error.js";
import { ThreadError } from "./thread-error.js";

interface QueueData<T> {
  que: T[];
  waitq: Array<() => void>;
  max: number;
  pushq: Array<() => void>;
}

const QUEUE_DATA = new WeakMap<object, QueueData<unknown>>();

function queuePtr<T>(self: object): QueueData<T> {
  return QUEUE_DATA.get(self) as QueueData<T>;
}

function queueSleep(waitq: Array<() => void>): Promise<void> {
  return new Promise<void>((resolve) => waitq.push(resolve));
}

function wakeupOne(waitq: Array<() => void>): void {
  waitq.shift()?.();
}

function queueDoPush<T>(self: Queue<T>, q: QueueData<T>, obj: T): Queue<T> {
  q.que.push(obj);
  wakeupOne(q.waitq);
  return self;
}

function queueDoPop<T>(q: QueueData<T>, shouldBlock: boolean): T | Promise<T> {
  if (q.que.length === 0) {
    if (!shouldBlock) {
      throw new ThreadError("queue empty");
    }

    return (async () => {
      while (q.que.length === 0) {
        await queueSleep(q.waitq);
      }

      return q.que.shift()!;
    })();
  }

  return q.que.shift()!;
}

/**
 * `vendor/ruby/v3.3.11/thread_sync.c:1677` `rb_cQueue`, `Thread::Queue`. A thread
 * blocked in `pop` sleeps until a `push` wakes it; here `pop` is a promise that
 * the waking `push` resolves. Only the members trails calls are ported
 * (`packages/ruby-compat/README.md` rule 1): there is no `close`, `closed?`,
 * `empty?`, `num_waiting` or `SizedQueue#max=`, so no queue is ever
 * closed and `push` never raises `ClosedQueueError`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Thread::Queue`
 * (`vendor/ruby/v3.3.11/thread_sync.c:1677`).
 */
export class Queue<T = unknown> {
  constructor() {
    QUEUE_DATA.set(this, { que: [], waitq: [], max: Infinity, pushq: [] });
  }

  /**
   * `vendor/ruby/v3.3.11/thread_sync.c:1068` `rb_queue_push`. It never blocks, so
   * the object is enqueued before this returns.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Thread::Queue#push`
   * (`vendor/ruby/v3.3.11/thread_sync.c:1068`).
   */
  async push(obj: T): Promise<this> {
    return queueDoPush(this, queuePtr<T>(this), obj) as this;
  }

  /**
   * `vendor/ruby/v3.3.11/thread_sync.c:1162` `rb_queue_pop`
   * (`vendor/ruby/v3.3.11/thread_sync.rb:14`). The blocking form answers a promise of
   * the next object where Ruby's sleeps; `nonBlock` answers it at once or
   * raises `ThreadError` "queue empty".
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Thread::Queue#pop`
   * (`vendor/ruby/v3.3.11/thread_sync.c:1162`).
   */
  pop(nonBlock?: false): Promise<T>;
  pop(nonBlock: true): T;
  pop(nonBlock: boolean = false): T | Promise<T> {
    const retval = queueDoPop(queuePtr<T>(this), !nonBlock);
    return nonBlock ? retval : Promise.resolve(retval);
  }

  /**
   * `vendor/ruby/v3.3.11/thread_sync.c:1205` `rb_queue_length`, also `SizedQueue#length`
   * (`:1428`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Thread::Queue#length`
   * (`vendor/ruby/v3.3.11/thread_sync.c:1205`).
   */
  get length(): number {
    return queuePtr<T>(this).que.length;
  }

  /**
   * `vendor/ruby/v3.3.11/thread_sync.c:1187` `rb_queue_clear`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Thread::Queue#clear`
   * (`vendor/ruby/v3.3.11/thread_sync.c:1187`).
   */
  clear(): this {
    queuePtr<T>(this).que.length = 0;
    return this;
  }
}

/**
 * `vendor/ruby/v3.3.11/thread_sync.c:1696` `rb_cSizedQueue`, `Thread::SizedQueue`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Thread::SizedQueue`
 * (`vendor/ruby/v3.3.11/thread_sync.c:1696`).
 */
export class SizedQueue<T = unknown> extends Queue<T> {
  /**
   * `vendor/ruby/v3.3.11/thread_sync.c:1257` `rb_szqueue_initialize`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Thread::SizedQueue#initialize`
   * (`vendor/ruby/v3.3.11/thread_sync.c:1257`).
   */
  constructor(vmax: number) {
    super();
    const max = vmax;
    if (max <= 0) {
      throw new ArgumentError("queue size must be positive");
    }

    queuePtr<T>(this).max = max;
  }

  /**
   * `vendor/ruby/v3.3.11/thread_sync.c:1307` `rb_szqueue_max_get`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Thread::SizedQueue#max`
   * (`vendor/ruby/v3.3.11/thread_sync.c:1307`).
   */
  get max(): number {
    return queuePtr<T>(this).max;
  }

  /**
   * `vendor/ruby/v3.3.11/thread_sync.c:1338` `rb_szqueue_push`: while the queue
   * holds `max` objects the pusher sleeps on the push queue until a `pop` wakes
   * it, and the woken pusher then enqueues its object. A Ruby pusher runs as
   * soon as it is woken and blocks its own thread, so its next push cannot
   * overtake it. A JS caller may leave the promise pending and push again, and
   * a woken promise resumes only on a later microtask, so here the object waits
   * on the push queue with its pusher and the wakeup enqueues it; a push also
   * waits while any pusher is asleep (`num_waiting_push`), keeping arrival
   * order.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Thread::SizedQueue#push`
   * (`vendor/ruby/v3.3.11/thread_sync.c:1338`).
   */
  override push(object: T): Promise<this> {
    const sq = queuePtr<T>(this);

    if (sq.que.length >= sq.max || sq.pushq.length > 0) {
      return new Promise<this>((resolve) => {
        sq.pushq.push(() => {
          queueDoPush(this, sq, object);
          resolve(this);
        });
      });
    }

    queueDoPush(this, sq, object);
    return Promise.resolve(this);
  }

  /**
   * `vendor/ruby/v3.3.11/thread_sync.c:1397` `rb_szqueue_pop`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Thread::SizedQueue#pop`
   * (`vendor/ruby/v3.3.11/thread_sync.c:1397`).
   */
  override pop(nonBlock?: false): Promise<T>;
  override pop(nonBlock: true): T;
  override pop(nonBlock: boolean = false): T | Promise<T> {
    return nonBlock ? szqueueDoPop(this, false) : Promise.resolve(szqueueDoPop(this, true));
  }

  /**
   * `vendor/ruby/v3.3.11/thread_sync.c:1409` `rb_szqueue_clear`, which wakes every
   * sleeping pusher; each woken pusher whose object no longer fits sleeps again,
   * so only as many as fit are woken here.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Thread::SizedQueue#clear`
   * (`vendor/ruby/v3.3.11/thread_sync.c:1409`).
   */
  override clear(): this {
    const sq = queuePtr<T>(this);
    sq.que.length = 0;
    while (sq.pushq.length > 0 && sq.que.length < sq.max) {
      wakeupOne(sq.pushq);
    }
    return this;
  }
}

function szqueueDoPop<T>(self: SizedQueue<T>, shouldBlock: boolean): T | Promise<T> {
  const sq = queuePtr<T>(self);
  const wakeup = (retval: T): T => {
    if (sq.que.length < sq.max) {
      wakeupOne(sq.pushq);
    }

    return retval;
  };
  const retval = queueDoPop(sq, shouldBlock);
  return retval instanceof Promise ? retval.then(wakeup) : wakeup(retval);
}
