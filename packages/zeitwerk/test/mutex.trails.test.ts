import { Mutex, ThreadError } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Cref } from "../lib/cref.js";
import { Map as CrefMap } from "../lib/cref/map.js";
import { Loader } from "../lib/loader.js";
import { newLoader, teardown } from "./support/loader-test.js";

async function whileHeld(mutex: Mutex, body: () => void): Promise<void> {
  let release!: () => void;
  const held = mutex.synchronize(() => new Promise<void>((r) => (release = r)));
  try {
    body();
  } finally {
    release();
    await held;
  }
}

describe("Zeitwerk synchronous Mutex#synchronize callers", () => {
  let loader: Loader;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
  });
  afterEach(teardown);

  it("each Config setter raises ThreadError while the loader mutex is held, and its block never runs", async () => {
    const snapshot = () => ({
      reloading: loader.isReloadingEnabled(),
      exclusions: [...loader.eagerLoadExclusions],
      ignored: [...loader.ignoredGlobPatterns],
      collapsed: [...loader.collapseGlobPatterns],
      onLoad: JSON.stringify(Object.keys(loader.onLoadCallbacks)),
      onUnload: JSON.stringify(Object.keys(loader.onUnloadCallbacks)),
    });
    const before = snapshot();

    await whileHeld(loader.mutex, () => {
      expect(() => loader.enableReloading()).toThrow(ThreadError);
      expect(() => loader.doNotEagerLoad("/tmp/x")).toThrow(ThreadError);
      expect(() => loader.ignore("/tmp/y")).toThrow(ThreadError);
      expect(() => loader.collapse("/tmp/z")).toThrow(ThreadError);
      expect(() => loader.onLoad("X", () => {})).toThrow(ThreadError);
      expect(() => loader.onUnload("X", () => {})).toThrow(ThreadError);
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(snapshot()).toEqual(before);
  });

  it("Cref::Map raises ThreadError while its mutex is held, and its block never runs", async () => {
    const map = new CrefMap<number>();
    const cref = new Cref(Object, "X");
    map.set(cref, 1);
    const mutex = (map as unknown as { _mutex: Mutex })._mutex;
    const seen: Cref[] = [];

    await whileHeld(mutex, () => {
      expect(() => map.deleteByValue(1)).toThrow(ThreadError);
      expect(() => map.eachKey((c) => seen.push(c))).toThrow(ThreadError);
      expect(() => map.clear()).toThrow(ThreadError);
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(seen).toEqual([]);
    expect(map.get(cref)).toBe(1);
  });
});
