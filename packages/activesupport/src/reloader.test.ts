import { describe, expect, it } from "vitest";

describe("ReloaderTest", () => {
  class Reloader {
    private prepareCallbacks: Array<() => void> = [];
    private checkFn: () => boolean;
    private version = 0;

    constructor(checkFn: () => boolean = () => true) {
      this.checkFn = checkFn;
    }

    onPrepare(fn: () => void) {
      this.prepareCallbacks.push(fn);
    }
    prependOnPrepare(fn: () => void) {
      this.prepareCallbacks.unshift(fn);
    }

    reload(): boolean {
      if (!this.checkFn()) return false;
      this.version++;
      for (const cb of this.prepareCallbacks) cb();
      return true;
    }
  }

  it("prepare callback", () => {
    const reloader = new Reloader();
    let prepared = false;
    reloader.onPrepare(() => {
      prepared = true;
    });
    reloader.reload();
    expect(prepared).toBe(true);
  });

  it("prepend prepare callback", () => {
    const reloader = new Reloader();
    const order: string[] = [];
    reloader.onPrepare(() => order.push("second"));
    reloader.prependOnPrepare(() => order.push("first"));
    reloader.reload();
    expect(order).toEqual(["first", "second"]);
  });

  it("only run when check passes", () => {
    let shouldReload = false;
    const reloader = new Reloader(() => shouldReload);
    let prepared = false;
    reloader.onPrepare(() => {
      prepared = true;
    });
    reloader.reload();
    expect(prepared).toBe(false);
    shouldReload = true;
    reloader.reload();
    expect(prepared).toBe(true);
  });

  it("full reload sequence", () => {
    const sequence: string[] = [];
    const reloader = new Reloader();
    reloader.onPrepare(() => sequence.push("prepare"));
    reloader.reload();
    reloader.reload();
    expect(sequence).toEqual(["prepare", "prepare"]);
  });

  it("class unload block", () => {
    const unloaded: string[] = [];
    const reloader = new Reloader();
    reloader.onPrepare(() => unloaded.push("unloaded MyClass"));
    reloader.reload();
    expect(unloaded).toContain("unloaded MyClass");
  });

  it("report errors once", () => {
    let errorCount = 0;
    const reloader = new Reloader();
    reloader.onPrepare(() => {
      errorCount++;
      if (errorCount === 1) throw new Error("reload error");
    });
    expect(() => reloader.reload()).toThrow("reload error");
    expect(errorCount).toBe(1);
  });
});
