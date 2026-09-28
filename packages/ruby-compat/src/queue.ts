import { ArgumentError } from "./argument-error.js";

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

async function queueDoPop<T>(q: QueueData<T>): Promise<T> {
  while (q.que.length === 0) {
    await queueSleep(q.waitq);
  }

  return q.que.shift()!;
}

/**
 * `vendor/ruby/v3.3.11/thread_sync.c:1677` `rb_cQueue`, `Thread::Queue`. A thread
 * blocked in `pop` sleeps until a `push` wakes it; here `pop` is a promise that
 * the waking `push` resolves.
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
   * `vendor/ruby/v3.3.11/thread_sync.c:1162` `rb_queue_pop`, awaiting the next object
   * where Ruby's blocking form sleeps.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Thread::Queue#pop`
   * (`vendor/ruby/v3.3.11/thread_sync.c:1162`).
   */
  pop(): Promise<T> {
    return queueDoPop(queuePtr<T>(this));
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
   * it. A Ruby pusher blocks its own thread, so its next push cannot overtake
   * it; a JS caller may leave the promise pending and push again, so a push
   * also waits while earlier pushers are still asleep, keeping arrival order.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Thread::SizedQueue#push`
   * (`vendor/ruby/v3.3.11/thread_sync.c:1338`).
   */
  override async push(object: T): Promise<this> {
    const sq = queuePtr<T>(this);

    while (sq.que.length >= sq.max || sq.pushq.length > 0) {
      await queueSleep(sq.pushq);
      if (sq.que.length < sq.max) break;
    }

    return queueDoPush(this, sq, object) as this;
  }

  /**
   * `vendor/ruby/v3.3.11/thread_sync.c:1385` `szqueue_do_pop`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Thread::SizedQueue#pop`
   * (`vendor/ruby/v3.3.11/thread_sync.c:1397`).
   */
  override async pop(): Promise<T> {
    const sq = queuePtr<T>(this);
    const retval = await queueDoPop(sq);

    if (sq.que.length < sq.max) {
      wakeupOne(sq.pushq);
    }

    return retval;
  }

  /**
   * `vendor/ruby/v3.3.11/thread_sync.c:1409` `rb_szqueue_clear`, which wakes every
   * sleeping pusher.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Thread::SizedQueue#clear`
   * (`vendor/ruby/v3.3.11/thread_sync.c:1409`).
   */
  override clear(): this {
    const sq = queuePtr<T>(this);
    sq.que.length = 0;
    while (sq.pushq.length > 0) wakeupOne(sq.pushq);
    return this;
  }
}
