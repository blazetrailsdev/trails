import { beforeEach, expect, it as vitestIt } from "vitest";
import type { Store, StoreOptions } from "../../../lib/cache/store.js";

/** @internal */
export interface FailureRaisingBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
  emulatingUnavailability(block: (cache: Store) => Promise<unknown>): Promise<void>;
  unavailableError: new (...args: never[]) => Error;
}

function alphanumeric(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export function failureRaisingBehavior(host?: FailureRaisingBehaviorHost): void {
  const it = host ? vitestIt : vitestIt.skip;
  let cache: Store;

  beforeEach(() => {
    if (!host) return;
    cache = host.lookupStore({ expiresIn: 60 });
  });

  const emulatingUnavailability = (block: (cache: Store) => Promise<unknown>): Promise<void> =>
    host!.emulatingUnavailability(block);

  it("fetch read failure raises", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, alphanumeric());

    await expect(emulatingUnavailability((cache) => cache.fetch(key))).rejects.toThrow(
      host!.unavailableError,
    );
  });

  it("fetch with block read failure raises", async () => {
    const key = crypto.randomUUID();
    const value = alphanumeric();
    await cache.write(key, value);

    await expect(
      emulatingUnavailability((cache) => cache.fetch(key, () => alphanumeric())),
    ).rejects.toThrow(host!.unavailableError);

    expect(await cache.read(key)).toBe(value);
  });

  it("read failure raises", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, alphanumeric());

    await expect(emulatingUnavailability((cache) => cache.read(key))).rejects.toThrow(
      host!.unavailableError,
    );
  });

  it("read multi failure raises", async () => {
    const key = crypto.randomUUID();
    const otherKey = crypto.randomUUID();
    await cache.writeMulti({ [key]: alphanumeric(), [otherKey]: alphanumeric() });

    await expect(
      emulatingUnavailability((cache) => cache.readMulti(key, otherKey)),
    ).rejects.toThrow(host!.unavailableError);
  });

  it("write failure raises", async () => {
    await expect(
      emulatingUnavailability((cache) => cache.write(crypto.randomUUID(), alphanumeric())),
    ).rejects.toThrow(host!.unavailableError);
  });

  it("write multi failure raises", async () => {
    await expect(
      emulatingUnavailability((cache) =>
        cache.writeMulti({
          [crypto.randomUUID()]: alphanumeric(),
          [crypto.randomUUID()]: alphanumeric(),
        }),
      ),
    ).rejects.toThrow(host!.unavailableError);
  });

  it("fetch multi failure raises", async () => {
    const key = crypto.randomUUID();
    const otherKey = crypto.randomUUID();
    await cache.writeMulti({ [key]: alphanumeric(), [otherKey]: alphanumeric() });

    await expect(
      emulatingUnavailability((cache) => cache.fetchMulti(key, otherKey, () => "unavailable")),
    ).rejects.toThrow(host!.unavailableError);
  });

  it("delete failure raises", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, alphanumeric());

    await expect(emulatingUnavailability((cache) => cache.delete(key))).rejects.toThrow(
      host!.unavailableError,
    );
  });

  it("exist failure raises", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, alphanumeric());

    await expect(emulatingUnavailability((cache) => cache.exist(key))).rejects.toThrow(
      host!.unavailableError,
    );
  });

  it("increment failure raises", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, 1, { raw: true });

    await expect(emulatingUnavailability((cache) => cache.increment(key))).rejects.toThrow(
      host!.unavailableError,
    );
  });

  it("decrement failure raises", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, 1, { raw: true });

    await expect(emulatingUnavailability((cache) => cache.decrement(key))).rejects.toThrow(
      host!.unavailableError,
    );
  });

  it("clear failure returns nil", async () => {
    await expect(emulatingUnavailability((cache) => cache.clear())).rejects.toThrow(
      host!.unavailableError,
    );
  });
}
