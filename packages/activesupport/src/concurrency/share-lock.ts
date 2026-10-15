import {
  newCond,
  RuntimeError,
  Thread,
  type MonitorConditionVariable,
} from "@blazetrails/ruby-compat";

type Purpose = string | null;
type Compatible = Array<Purpose | false>;

export interface ShareLockThreadInfo {
  thread: Thread;
  sharing: number;
  exclusive: boolean;
  purpose: Purpose;
  compatible: Compatible | null;
  waiting: boolean;
  sleeper: string | null;
  index?: number;
  backtrace?: string[] | null;
}

/** @missingRailsCall synchronize — PERMANENT */
export class ShareLock {
  private cv: MonitorConditionVariable;
  private sharing_: Map<Thread, number>;
  private waiting: Map<Thread, [Purpose, Compatible]>;
  private sleeping: Map<Thread, string>;
  private exclusiveThread: Thread | null;
  private exclusiveDepth: number;

  /** @internal */
  rawState<T>(block: (data: Map<Thread, ShareLockThreadInfo>) => T): T {
    let threads = [
      ...new Set([...this.sleeping.keys(), ...this.sharing_.keys(), ...this.waiting.keys()]),
    ];
    if (this.exclusiveThread) threads = [...new Set([...threads, this.exclusiveThread])];

    const data = new Map<Thread, ShareLockThreadInfo>();

    for (const thread of threads) {
      const [purpose = null, compatible = null] = this.waiting.get(thread) ?? [];

      data.set(thread, {
        thread: thread,
        sharing: this.sharing_.get(thread) ?? 0,
        exclusive: this.exclusiveThread === thread,
        purpose: purpose,
        compatible: compatible,
        waiting: this.waiting.has(thread),
        sleeper: this.sleeping.get(thread) ?? null,
      });
    }

    return block(data);
  }

  constructor() {
    this.cv = newCond.call(this);

    this.sharing_ = new Map();
    this.waiting = new Map();
    this.sleeping = new Map();
    this.exclusiveThread = null;
    this.exclusiveDepth = 0;
  }

  async startExclusive({
    purpose = null,
    compatible = [],
    noWait = false,
  }: { purpose?: Purpose; compatible?: Compatible; noWait?: boolean } = {}): Promise<boolean> {
    if (this.exclusiveThread !== Thread.current()) {
      if (this.isBusyForExclusive(purpose)) {
        if (noWait) return false;

        await this.yieldShares({ purpose: purpose, compatible: compatible, blockShare: true }, () =>
          this.waitFor("start_exclusive", () => this.isBusyForExclusive(purpose)),
        );
      }
      this.exclusiveThread = Thread.current();
    }
    this.exclusiveDepth += 1;

    return true;
  }

  async stopExclusive({ compatible = [] }: { compatible?: Compatible } = {}): Promise<void> {
    if (this.exclusiveThread !== Thread.current()) throw new RuntimeError("invalid unlock");

    this.exclusiveDepth -= 1;
    if (this.exclusiveDepth === 0) {
      this.exclusiveThread = null;

      if (this.isEligibleWaiters(compatible)) {
        await this.yieldShares({ compatible: compatible, blockShare: true }, () =>
          this.waitFor(
            "stop_exclusive",
            () => this.exclusiveThread || this.isEligibleWaiters(compatible),
          ),
        );
      }
      this.cv.broadcast();
    }
  }

  async startSharing(): Promise<void> {
    if (
      (this.sharing_.get(Thread.current()) ?? 0) > 0 ||
      this.exclusiveThread === Thread.current()
    ) {
    } else if (this.waiting.get(Thread.current())) {
      await this.waitFor("start_sharing", () => this.exclusiveThread);
    } else {
      await this.waitFor("start_sharing", () => this.isBusyForSharing(false));
    }
    this.sharing_.set(Thread.current(), (this.sharing_.get(Thread.current()) ?? 0) + 1);
  }

  stopSharing(): void {
    if ((this.sharing_.get(Thread.current()) ?? 0) > 1) {
      this.sharing_.set(Thread.current(), this.sharing_.get(Thread.current())! - 1);
    } else {
      this.sharing_.delete(Thread.current());
      this.cv.broadcast();
    }
  }

  async exclusive<T>(
    {
      purpose = null,
      compatible = [],
      afterCompatible = [],
      noWait = false,
    }: {
      purpose?: Purpose;
      compatible?: Compatible;
      afterCompatible?: Compatible;
      noWait?: boolean;
    },
    block: () => T | Promise<T>,
  ): Promise<T | undefined> {
    if (await this.startExclusive({ purpose: purpose, compatible: compatible, noWait: noWait })) {
      try {
        return await block();
      } finally {
        await this.stopExclusive({ compatible: afterCompatible });
      }
    }
    return undefined;
  }

  async sharing<T>(block: () => T | Promise<T>): Promise<T> {
    await this.startSharing();
    try {
      return await block();
    } finally {
      this.stopSharing();
    }
  }

  async yieldShares<T>(
    {
      purpose = null,
      compatible = [],
      blockShare = false,
    }: { purpose?: Purpose; compatible?: Compatible; blockShare?: boolean },
    block: () => T | Promise<T>,
  ): Promise<T> {
    let looseShares: number | undefined;
    let previousWait: [Purpose, Compatible] | undefined;
    if ((looseShares = this.sharing_.get(Thread.current())) !== undefined) {
      this.sharing_.delete(Thread.current());
      if ((previousWait = this.waiting.get(Thread.current()))) {
        if (purpose !== previousWait[0]) purpose = null;
        compatible = compatible.filter((c) => previousWait![1].includes(c));
      }
      if (!blockShare && !compatible.includes(false)) compatible = [...compatible, false];
      this.waiting.set(Thread.current(), [purpose, compatible]);
    }

    this.cv.broadcast();

    try {
      return await block();
    } finally {
      await this.waitFor(
        "yield_shares",
        () => this.exclusiveThread && this.exclusiveThread !== Thread.current(),
      );

      if (previousWait) {
        this.waiting.set(Thread.current(), previousWait);
      } else {
        this.waiting.delete(Thread.current());
      }
      if (looseShares) this.sharing_.set(Thread.current(), looseShares);
    }
  }

  /** @internal */
  private isBusyForExclusive(purpose: Purpose): boolean {
    return (
      this.isBusyForSharing(purpose) ||
      this.sharing_.size > ((this.sharing_.get(Thread.current()) ?? 0) > 0 ? 1 : 0)
    );
  }

  /** @internal */
  private isBusyForSharing(purpose: Purpose | false): boolean {
    return (
      (this.exclusiveThread != null && this.exclusiveThread !== Thread.current()) ||
      [...this.waiting].some(([t, [, c]]) => t !== Thread.current() && !c.includes(purpose))
    );
  }

  /** @internal */
  private isEligibleWaiters(compatible: Compatible): boolean {
    return [...this.waiting].some(
      ([t, [p]]) =>
        compatible.includes(p) &&
        [...this.waiting].every(([t2, [, c2]]) => t === t2 || c2.includes(p)),
    );
  }

  /** @internal */
  private async waitFor(method: string, block: () => unknown): Promise<void> {
    this.sleeping.set(Thread.current(), method);
    try {
      await this.cv.waitWhile(block);
    } finally {
      this.sleeping.delete(Thread.current());
    }
  }
}
