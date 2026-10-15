import {
  monSynchronize,
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

export class ShareLock {
  /** @noRailsEquivalent PERMANENT */
  synchronize = monSynchronize;
  /** @noRailsEquivalent PERMANENT */
  newCond = newCond;

  private cv: MonitorConditionVariable;
  private _sharing: Map<Thread, number>;
  private waiting: Map<Thread, [Purpose, Compatible]>;
  private sleeping: Map<Thread, string>;
  private exclusiveThread: Thread | null;
  private exclusiveDepth: number;

  rawState<T>(block: (data: Map<Thread, ShareLockThreadInfo>) => T): Promise<T> {
    return this.synchronize(() => {
      let threads = [
        ...new Set([...this.sleeping.keys(), ...this._sharing.keys(), ...this.waiting.keys()]),
      ];
      if (this.exclusiveThread) threads = [...new Set([...threads, this.exclusiveThread])];

      const data = new Map<Thread, ShareLockThreadInfo>();

      for (const thread of threads) {
        const [purpose = null, compatible = null] = this.waiting.get(thread) ?? [];

        data.set(thread, {
          thread: thread,
          sharing: this._sharing.get(thread) ?? 0,
          exclusive: this.exclusiveThread === thread,
          purpose: purpose,
          compatible: compatible,
          waiting: !!this.waiting.get(thread),
          sleeper: this.sleeping.get(thread) ?? null,
        });
      }

      return block(data);
    });
  }

  constructor() {
    this.cv = this.newCond();

    this._sharing = new Map();
    this.waiting = new Map();
    this.sleeping = new Map();
    this.exclusiveThread = null;
    this.exclusiveDepth = 0;
  }

  startExclusive({
    purpose = null,
    compatible = [],
    noWait = false,
  }: { purpose?: Purpose; compatible?: Compatible; noWait?: boolean } = {}): Promise<boolean> {
    return this.synchronize(async () => {
      if (this.exclusiveThread !== Thread.current()) {
        if (this.isBusyForExclusive(purpose)) {
          if (noWait) return false;

          await this.yieldShares(
            { purpose: purpose, compatible: compatible, blockShare: true },
            () => this.waitFor("start_exclusive", () => this.isBusyForExclusive(purpose)),
          );
        }
        this.exclusiveThread = Thread.current();
      }
      this.exclusiveDepth += 1;

      return true;
    });
  }

  stopExclusive({ compatible = [] }: { compatible?: Compatible } = {}): Promise<void> {
    return this.synchronize(async () => {
      if (this.exclusiveThread !== Thread.current()) throw new RuntimeError("invalid unlock");

      this.exclusiveDepth -= 1;
      if (this.exclusiveDepth === 0) {
        this.exclusiveThread = null;

        if (this.hasEligibleWaiters(compatible)) {
          await this.yieldShares({ compatible: compatible, blockShare: true }, () =>
            this.waitFor(
              "stop_exclusive",
              () => this.exclusiveThread || this.hasEligibleWaiters(compatible),
            ),
          );
        }
        this.cv.broadcast();
      }
    });
  }

  startSharing(): Promise<void> {
    return this.synchronize(async () => {
      if (
        (this._sharing.get(Thread.current()) ?? 0) > 0 ||
        this.exclusiveThread === Thread.current()
      ) {
      } else if (this.waiting.get(Thread.current())) {
        await this.waitFor("start_sharing", () => this.exclusiveThread);
      } else {
        await this.waitFor("start_sharing", () => this.isBusyForSharing(false));
      }
      this._sharing.set(Thread.current(), (this._sharing.get(Thread.current()) ?? 0) + 1);
    });
  }

  stopSharing(): Promise<void> {
    return this.synchronize(() => {
      if ((this._sharing.get(Thread.current()) ?? 0) > 1) {
        this._sharing.set(Thread.current(), this._sharing.get(Thread.current())! - 1);
      } else {
        this._sharing.delete(Thread.current());
        this.cv.broadcast();
      }
    });
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
    } = {},
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
      await this.stopSharing();
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
    await this.synchronize(() => {
      if ((looseShares = this._sharing.get(Thread.current())) !== undefined) {
        this._sharing.delete(Thread.current());
        if ((previousWait = this.waiting.get(Thread.current()))) {
          if (purpose !== previousWait[0]) purpose = null;
          compatible = [...new Set(compatible)].filter((c) => previousWait![1].includes(c));
        }
        if (!blockShare) compatible = [...new Set<Purpose | false>([...compatible, false])];
        this.waiting.set(Thread.current(), [purpose, compatible]);
      }

      this.cv.broadcast();
    });

    try {
      return await block();
    } finally {
      await this.synchronize(async () => {
        await this.waitFor(
          "yield_shares",
          () => this.exclusiveThread && this.exclusiveThread !== Thread.current(),
        );

        if (previousWait) {
          this.waiting.set(Thread.current(), previousWait);
        } else {
          this.waiting.delete(Thread.current());
        }
        if (looseShares) this._sharing.set(Thread.current(), looseShares);
      });
    }
  }

  /** @internal */
  private isBusyForExclusive(purpose: Purpose): boolean {
    return (
      this.isBusyForSharing(purpose) ||
      this._sharing.size > ((this._sharing.get(Thread.current()) ?? 0) > 0 ? 1 : 0)
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
  private hasEligibleWaiters(compatible: Compatible): boolean {
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
