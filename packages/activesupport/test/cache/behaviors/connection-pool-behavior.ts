import { expect, it as vitestIt } from "vitest";
import { SecureRandom } from "@blazetrails/ruby-compat/secure-random";
import { Thread } from "@blazetrails/ruby-compat/thread";
import type { Store, StoreOptions } from "../../../lib/cache/store.js";
import { lookupStore } from "../../../lib/cache.js";
import { assertNothingRaised } from "../../../lib/testing/assertions.js";

/** @internal */
export interface ConnectionPoolBehaviorHost {
  store: unknown[];
  storeOptions?(): StoreOptions;
  emulatingLatency(block: () => Promise<void>): Promise<void>;
}

export function connectionPoolBehavior(host?: ConnectionPoolBehaviorHost): void {
  const it = host ? vitestIt : vitestIt.skip;
  const storeOptions = (): StoreOptions => host!.storeOptions?.() ?? {};

  it("connection pool", async () => {
    const threads: Thread<Promise<unknown>>[] = [];

    await host!.emulatingLatency(async () => {
      try {
        const cache = lookupStore(...host!.store, {
          pool: { size: 2, timeout: 0.1 },
          ...storeOptions(),
        }) as Store;
        await cache.read("foo");

        await assertNothingRaised(async () => {
          for (let i = 0; i < 3; i++) {
            const thread = new Thread(() => cache.read("latency"));
            thread.reportOnException = false;
            threads.push(thread);
          }

          await Promise.all(threads.map((thread) => thread.join()));
        });
      } finally {
        threads.forEach((thread) => thread.kill());
      }
    });
  });

  it("connection pool fetch", async () => {
    const threads: Thread<Promise<unknown>>[] = [];
    let results: unknown[] = [];

    await host!.emulatingLatency(async () => {
      try {
        const cache = lookupStore(...host!.store, {
          pool: { size: 2, timeout: 0.1 },
          ...storeOptions(),
        }) as Store;
        const value = SecureRandom.hex();
        const baseKey = `latency:${SecureRandom.uuid()}`;

        await assertNothingRaised(async () => {
          for (let i = 0; i < 3; i++) {
            const thread = new Thread(() => cache.fetch(`${baseKey}:${i}`, () => value));
            thread.reportOnException = false;
            threads.push(thread);
          }

          results = await Promise.all(threads.map((thread) => thread.value()));
          expect(results).toEqual([value, value, value]);
        });
      } finally {
        threads.forEach((thread) => thread.kill());
      }
    });
  });

  it("no connection pool", async () => {
    const threads: Thread<Promise<unknown>>[] = [];

    await host!.emulatingLatency(async () => {
      try {
        const cache = lookupStore(...host!.store, { ...storeOptions(), pool: false }) as Store;

        await assertNothingRaised(async () => {
          for (let i = 0; i < 10; i++) {
            threads.push(new Thread(() => cache.read("latency")));
          }

          await Promise.all(threads.map((thread) => thread.join()));
        });
      } finally {
        threads.forEach((thread) => thread.kill());
      }
    });
  });
}
