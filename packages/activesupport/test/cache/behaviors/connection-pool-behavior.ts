import { expect, it as vitestIt } from "vitest";
import { Thread } from "@blazetrails/ruby-compat";
import type { Store, StoreOptions } from "../../../lib/cache/store.js";
import { lookupStore } from "../../../lib/cache.js";
import { assertNothingRaised } from "../../../lib/testing/assertions.js";

/** @internal */
export interface ConnectionPoolBehaviorHost {
  store: unknown[];
  storeOptions?(): StoreOptions;
  emulatingLatency(block: () => Promise<void>): Promise<void>;
}

function alphanumeric(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export function connectionPoolBehavior(host?: ConnectionPoolBehaviorHost): void {
  const it = host ? vitestIt : vitestIt.skip;
  const storeOptions = (): StoreOptions => host!.storeOptions?.() ?? {};

  it("connection pool", async () => {
    const threads: Thread<Promise<unknown>>[] = [];

    try {
      await host!.emulatingLatency(async () => {
        const cache = lookupStore(...host!.store, {
          ...{ pool: { size: 2, timeout: 0.1 } },
          ...storeOptions(),
        }) as Store;
        await cache.read("foo");

        await assertNothingRaised(async () => {
          for (let i = 0; i < 3; i++) {
            threads.push(new Thread(() => cache.read("latency")));
          }

          await Promise.all(threads.map((thread) => thread.join()));
        });
      });
    } finally {
      threads.forEach((thread) => thread.kill());
    }
  });

  it("connection pool fetch", async () => {
    const threads: Thread<Promise<unknown>>[] = [];
    let results: unknown[] = [];

    try {
      await host!.emulatingLatency(async () => {
        const cache = lookupStore(...host!.store, {
          ...{ pool: { size: 2, timeout: 0.1 } },
          ...storeOptions(),
        }) as Store;
        const value = alphanumeric();
        const baseKey = `latency:${crypto.randomUUID()}`;

        await assertNothingRaised(async () => {
          for (let i = 0; i < 3; i++) {
            threads.push(new Thread(() => cache.fetch(`${baseKey}:${i}`, () => value)));
          }

          results = await Promise.all(threads.map((thread) => thread.value()));
          expect(results).toEqual([value, value, value]);
        });
      });
    } finally {
      threads.forEach((thread) => thread.kill());
    }
  });

  it("no connection pool", async () => {
    const threads: Thread<Promise<unknown>>[] = [];

    try {
      await host!.emulatingLatency(async () => {
        const cache = lookupStore(...host!.store, { ...storeOptions(), pool: false }) as Store;

        await assertNothingRaised(async () => {
          for (let i = 0; i < 10; i++) {
            threads.push(new Thread(() => cache.read("latency")));
          }

          await Promise.all(threads.map((thread) => thread.join()));
        });
      });
    } finally {
      threads.forEach((thread) => thread.kill());
    }
  });
}
