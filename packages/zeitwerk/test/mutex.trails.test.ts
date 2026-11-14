import { Mutex, ThreadError } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Map as CrefMap } from "../lib/cref/map.js";
import { Loader } from "../lib/loader.js";
import { newLoader, teardown } from "./support/loader-test.js";

describe("Zeitwerk synchronous Mutex#synchronize callers", () => {
  let loader: Loader;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
  });
  afterEach(teardown);

  it("a Config setter raises ThreadError while the loader mutex is held, before its block runs", async () => {
    let release!: () => void;
    const held = loader.mutex.synchronize(() => new Promise<void>((r) => (release = r)));

    try {
      expect(() => loader.doNotEagerLoad("/tmp/x")).toThrow(ThreadError);
      expect(loader.eagerLoadExclusions.size).toBe(0);
    } finally {
      release();
      await held;
    }
  });

  it("Cref::Map#clear raises ThreadError while its mutex is held", async () => {
    const map = new CrefMap<number>();
    let release!: () => void;
    const held = (map as unknown as { _mutex: Mutex })._mutex.synchronize(
      () => new Promise<void>((r) => (release = r)),
    );

    try {
      expect(() => map.clear()).toThrow(ThreadError);
    } finally {
      release();
      await held;
    }
    expect(() => map.clear()).not.toThrow();
  });
});
