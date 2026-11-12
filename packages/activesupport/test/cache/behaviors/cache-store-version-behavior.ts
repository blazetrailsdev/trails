import { beforeEach, expect, it } from "vitest";
import { SecureRandom } from "@blazetrails/ruby-compat";
import type { Store, StoreOptions } from "../../../lib/cache/store.js";

class ModelWithKeyAndVersion {
  constructor(
    private _cacheKey: string,
    private _cacheVersion: number,
  ) {}

  cacheKey(): string {
    return this._cacheKey;
  }

  cacheVersion(): number {
    return this._cacheVersion;
  }
}

/** @internal */
export interface CacheStoreVersionBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
}

export function cacheStoreVersionBehavior(host: CacheStoreVersionBehaviorHost): void {
  let cache: Store;

  beforeEach(() => {
    cache = host.lookupStore({ expiresIn: 60 });
  });

  it("fetch with right version should hit", async () => {
    const key = SecureRandom.uuid();
    const value = SecureRandom.hex();

    await cache.fetch(key, { version: 1 }, () => value);
    expect(await cache.read(key, { version: 1 })).toBe(value);
  });

  it("fetch with wrong version should miss", async () => {
    const key = SecureRandom.uuid();

    await cache.fetch(key, { version: 1 }, () => SecureRandom.hex());
    expect(await cache.read(key, { version: 2 })).toBeNull();
  });

  it("read with right version should hit", async () => {
    const key = SecureRandom.uuid();
    const value = SecureRandom.hex();

    await cache.write(key, value, { version: 1 });
    expect(await cache.read(key, { version: 1 })).toBe(value);
  });

  it("read with wrong version should miss", async () => {
    const key = SecureRandom.uuid();
    const value = SecureRandom.hex();

    await cache.write(key, value, { version: 1 });
    expect(await cache.read(key, { version: 2 })).toBeNull();
  });

  it("exist with right version should be true", async () => {
    const key = SecureRandom.uuid();

    await cache.write(key, SecureRandom.hex(), { version: 1 });
    expect(await cache.exist(key, { version: 1 })).toBeTruthy();
  });

  it("exist with wrong version should be false", async () => {
    const key = SecureRandom.uuid();

    await cache.write(key, SecureRandom.hex(), { version: 1 });
    expect(await cache.exist(key, { version: 2 })).toBeFalsy();
  });

  it("reading and writing with model supporting cache version", async () => {
    const modelName = SecureRandom.hex();

    const m1v1 = new ModelWithKeyAndVersion(`${modelName}/1`, 1);
    const m1v2 = new ModelWithKeyAndVersion(`${modelName}/1`, 2);

    const value = SecureRandom.hex();

    await cache.write(m1v1 as never, value);
    expect(await cache.read(m1v1 as never)).toBe(value);
    expect(await cache.read(m1v2 as never)).toBeNull();
  });

  it("reading and writing with model supporting cache version using nested key", async () => {
    const modelName = SecureRandom.hex();

    const m1v1 = new ModelWithKeyAndVersion(`${modelName}/1`, 1);
    const m1v2 = new ModelWithKeyAndVersion(`${modelName}/1`, 2);

    const value = SecureRandom.hex();

    await cache.write(["something", m1v1] as never, value);
    expect(await cache.read(["something", m1v1] as never)).toBe(value);
    expect(await cache.read(["something", m1v2] as never)).toBeNull();
  });

  it("fetching with model supporting cache version", async () => {
    const modelName = SecureRandom.hex();

    const m1v1 = new ModelWithKeyAndVersion(`${modelName}/1`, 1);
    const m1v2 = new ModelWithKeyAndVersion(`${modelName}/1`, 2);

    const value = SecureRandom.hex();
    const otherValue = SecureRandom.hex();

    await cache.fetch(m1v1 as never, () => value);
    expect(await cache.fetch(m1v1 as never, () => otherValue)).toBe(value);
    expect(await cache.fetch(m1v2 as never, () => otherValue)).toBe(otherValue);
  });

  it("exist with model supporting cache version", async () => {
    const modelName = SecureRandom.hex();

    const m1v1 = new ModelWithKeyAndVersion(`${modelName}/1`, 1);
    const m1v2 = new ModelWithKeyAndVersion(`${modelName}/1`, 2);

    const value = SecureRandom.hex();

    await cache.write(m1v1 as never, value);
    expect(await cache.exist(m1v1 as never)).toBeTruthy();
    expect(await cache.fetch(m1v2 as never)).toBeFalsy();
  });

  it("fetch multi with model supporting cache version", async () => {
    const modelName = SecureRandom.hex();

    const m1v1 = new ModelWithKeyAndVersion(`${modelName}/1`, 1);
    const m2v1 = new ModelWithKeyAndVersion(`${modelName}/2`, 1);
    const m2v2 = new ModelWithKeyAndVersion(`${modelName}/2`, 2);

    const firstFetchValues = await cache.fetchMulti(m1v1, m2v1, (m) =>
      (m as ModelWithKeyAndVersion).cacheKey(),
    );
    const secondFetchValues = await cache.fetchMulti(
      m1v1,
      m2v2,
      (m) => (m as ModelWithKeyAndVersion).cacheKey() + " 2nd",
    );

    expect(firstFetchValues).toEqual(
      new Map<unknown, unknown>([
        [m1v1, `${modelName}/1`],
        [m2v1, `${modelName}/2`],
      ]),
    );
    expect(secondFetchValues).toEqual(
      new Map<unknown, unknown>([
        [m1v1, `${modelName}/1`],
        [m2v2, `${modelName}/2 2nd`],
      ]),
    );
  });

  it("version is normalized", async () => {
    const key = SecureRandom.uuid();
    const value = SecureRandom.hex();

    await cache.write(key, value, { version: 1 });
    expect(await cache.read(key, { version: "1" as never })).toBe(value);
  });
}
