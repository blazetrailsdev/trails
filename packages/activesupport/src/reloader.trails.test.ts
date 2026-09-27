import { describe, it, expect } from "vitest";
import { Executor } from "./executor.js";
import { Reloader } from "./reloader.js";

describe("Reloader (trails)", () => {
  it("runs to_prepare callbacks on prepare!", () => {
    class AppReloader extends Reloader {}
    const ran: string[] = [];
    AppReloader.toPrepare(() => ran.push("first"));
    AppReloader.toPrepare(() => ran.push("second"));

    expect(ran).toEqual([]);
    AppReloader.prepareBang();
    expect(ran).toEqual(["first", "second"]);
    AppReloader.prepareBang();
    expect(ran).toEqual(["first", "second", "first", "second"]);
  });

  it("keeps each subclass's prepare callbacks to itself", () => {
    class OneReloader extends Reloader {}
    class TwoReloader extends Reloader {}
    const ran: string[] = [];
    OneReloader.toPrepare(() => ran.push("one"));

    TwoReloader.prepareBang();
    expect(ran).toEqual([]);
    OneReloader.prepareBang();
    expect(ran).toEqual(["one"]);
  });

  it("awaits an async to_run callback before run! resolves", async () => {
    class AppReloader extends Reloader {}
    AppReloader.check = () => true;
    AppReloader.executor = class extends Executor {};
    const called: string[] = [];
    AppReloader.toRun(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      called.push("run");
    });
    AppReloader.toPrepare(() => called.push("prepare"));

    const instance = await AppReloader.runBang();
    expect(called).toEqual(["run", "prepare"]);
    await instance.completeBang();
    expect(AppReloader.active()).toBe(false);
  });

  it("wrap and reload! await an async to_run callback before the block and prepare!", async () => {
    class AppReloader extends Reloader {}
    AppReloader.check = () => true;
    AppReloader.executor = class extends Executor {};
    const called: string[] = [];
    AppReloader.toRun(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      called.push("run");
    });
    AppReloader.toComplete(() => called.push("complete"));

    await AppReloader.wrap(() => called.push("body"));
    expect(called).toEqual(["run", "body", "complete"]);

    called.length = 0;
    AppReloader.toPrepare(() => called.push("prepare"));
    await AppReloader.reloadBang();
    expect(called).toEqual(["run", "prepare", "complete", "prepare"]);
  });

  it("run!(reset: true) awaits the lost instance's async to_complete before running", async () => {
    class AppReloader extends Reloader {}
    AppReloader.check = () => true;
    const called: string[] = [];
    AppReloader.toRun(() => called.push("run"));
    AppReloader.toComplete(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      called.push("complete");
    });

    await AppReloader.runBang();
    const instance = await AppReloader.runBang({ reset: true });
    expect(called).toEqual(["run", "complete", "run"]);
    await instance.completeBang();
  });

  it("wrap completes after an async block settles", async () => {
    class AppReloader extends Reloader {}
    AppReloader.check = () => true;
    const called: string[] = [];
    AppReloader.toRun(() => called.push("run"));
    AppReloader.toComplete(() => called.push("complete"));

    await AppReloader.wrap(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      called.push("body");
    });
    expect(called).toEqual(["run", "body", "complete"]);
  });
});
