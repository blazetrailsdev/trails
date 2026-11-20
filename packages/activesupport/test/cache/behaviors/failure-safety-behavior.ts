import { beforeEach, expect, it as vitestIt } from "vitest";
import type { Store, StoreOptions } from "../../../lib/cache/store.js";

/** @internal */
export interface FailureSafetyBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
  emulatingUnavailability(block: (cache: Store) => Promise<void>): Promise<void>;
}

function alphanumeric(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export function failureSafetyBehavior(host?: FailureSafetyBehaviorHost): void {
  const it = host ? vitestIt : vitestIt.skip;
  let cache: Store;

  beforeEach(() => {
    if (!host) return;
    cache = host.lookupStore({ expiresIn: 60 });
  });

  const emulatingUnavailability = (block: (cache: Store) => Promise<void>): Promise<void> =>
    host!.emulatingUnavailability(block);

  it("fetch read failure returns nil", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, alphanumeric());

    await emulatingUnavailability(async (cache) => {
      expect(await cache.fetch(key)).toBeNull();
    });
  });

  it("fetch read failure does not attempt to write", async () => {
    const key = crypto.randomUUID();
    const value = alphanumeric();
    await cache.write(key, value);

    await emulatingUnavailability(async (cache) => {
      const val = await cache.fetch(key, () => "1");

      expect(val).toBe("1");
    });

    expect(await cache.read(key)).toBe(value);
  });

  it("read failure returns nil", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, alphanumeric());

    await emulatingUnavailability(async (cache) => {
      expect(await cache.read(key)).toBeNull();
    });
  });

  it("read multi failure returns empty hash", async () => {
    const key = crypto.randomUUID();
    const otherKey = crypto.randomUUID();
    await cache.writeMulti({ [key]: alphanumeric(), [otherKey]: alphanumeric() });

    await emulatingUnavailability(async (cache) => {
      expect(Object.fromEntries(await cache.readMulti(key, otherKey))).toEqual({});
    });
  });

  it("write failure returns nil", async () => {
    const key = crypto.randomUUID();
    await emulatingUnavailability(async (cache) => {
      expect(await cache.write(key, alphanumeric())).toBeNull();
    });
  });

  it("write multi failure not raises", async () => {
    await emulatingUnavailability(async (cache) => {
      await expect(
        cache.writeMulti({
          [crypto.randomUUID()]: alphanumeric(),
          [crypto.randomUUID()]: alphanumeric(),
        }),
      ).resolves.not.toThrow();
    });
  });

  it("fetch multi failure returns fallback results", async () => {
    const key = crypto.randomUUID();
    const otherKey = crypto.randomUUID();
    await cache.writeMulti({ [key]: alphanumeric(), [otherKey]: alphanumeric() });

    await emulatingUnavailability(async (cache) => {
      const fetched = await cache.fetchMulti(key, otherKey, () => "unavailable");
      expect(Object.fromEntries(fetched)).toEqual({
        [key]: "unavailable",
        [otherKey]: "unavailable",
      });
    });
  });

  it("delete failure returns false", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, alphanumeric());

    await emulatingUnavailability(async (cache) => {
      expect(await cache.delete(key)).toBe(false);
    });
  });

  it("delete multi failure returns zero", async () => {
    const key = crypto.randomUUID();
    const otherKey = crypto.randomUUID();
    await cache.writeMulti({ [key]: alphanumeric(), [otherKey]: alphanumeric() });

    await emulatingUnavailability(async (cache) => {
      expect(await cache.deleteMulti([key, otherKey])).toBe(0);
    });
  });

  it("exist failure returns false", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, alphanumeric());

    await emulatingUnavailability(async (cache) => {
      expect(await cache.isExist(key)).toBeFalsy();
    });
  });

  it("increment failure returns nil", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, 1, { raw: true });

    await emulatingUnavailability(async (cache) => {
      expect(await cache.increment(key)).toBeNull();
    });
  });

  it("decrement failure returns nil", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, 1, { raw: true });

    await emulatingUnavailability(async (cache) => {
      expect(await cache.decrement(key)).toBeNull();
    });
  });

  it("clear failure returns nil", async () => {
    await emulatingUnavailability(async (cache) => {
      expect(await cache.clear()).toBeNull();
    });
  });
}
