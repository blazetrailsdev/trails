import { describe, it, expect, beforeEach } from "vitest";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { Reloader } from "../lib/reloader.js";
import { Executor } from "../lib/executor.js";
import { assertNot, assertRaises } from "../lib/testing/assertions.js";
import { ErrorCollector } from "../lib/testing/error-reporter-assertions.js";

describe("ReloaderTest", () => {
  function newReloader(check: () => boolean): typeof Reloader {
    const r = class extends Reloader {};
    r.check = check;
    r.executor = class extends Executor {};
    return r;
  }

  let reloader: typeof Reloader;
  beforeEach(() => {
    reloader = newReloader(() => true);
  });

  it("prepare callback", async () => {
    let prepared = false;
    let completed = false;
    reloader.toPrepare(() => (prepared = true));
    reloader.toComplete(() => (completed = true));

    assertNot(prepared);
    assertNot(completed);
    await reloader.prepareBang();
    expect(prepared).toBeTruthy();
    assertNot(completed);

    prepared = false;
    reloader.wrap(() => {
      expect(prepared).toBeTruthy();
      prepared = false;
    });
    assertNot(prepared);
  });

  it("prepend prepare callback", async () => {
    let i = 10;
    reloader.toPrepare(() => (i += 1));
    reloader.toPrepare(() => (i = 0), { prepend: true });

    await reloader.prepareBang();
    expect(i).toBe(1);
  });

  it("only run when check passes", () => {
    let r = newReloader(() => true);
    let invoked = false;
    r.toRun(() => (invoked = true));
    r.wrap(() => {});
    expect(invoked).toBeTruthy();

    r = newReloader(() => false);
    invoked = false;
    r.toRun(() => (invoked = true));
    r.wrap(() => {});
    assertNot(invoked);
  });

  it("full reload sequence", async () => {
    let called: string[] = [];
    reloader.toPrepare(() => called.push("prepare"));
    reloader.toRun(() => called.push("reloader_run"));
    reloader.toComplete(() => called.push("reloader_complete"));
    reloader.executor.toRun(() => called.push("executor_run"));
    reloader.executor.toComplete(() => called.push("executor_complete"));

    reloader.wrap(() => {});
    expect(called).toEqual([
      "executor_run",
      "reloader_run",
      "prepare",
      "reloader_complete",
      "executor_complete",
    ]);

    called = [];
    await reloader.reloadBang();
    expect(called).toEqual([
      "executor_run",
      "reloader_run",
      "prepare",
      "reloader_complete",
      "executor_complete",
      "prepare",
    ]);

    reloader.check = () => false;

    called = [];
    reloader.wrap(() => {});
    expect(called).toEqual(["executor_run", "executor_complete"]);

    called = [];
    await reloader.reloadBang();
    expect(called).toEqual([
      "executor_run",
      "reloader_run",
      "prepare",
      "reloader_complete",
      "executor_complete",
      "prepare",
    ]);
  });

  it("class unload block", () => {
    const called: string[] = [];
    reloader.beforeClassUnload(() => called.push("before_unload"));
    reloader.afterClassUnload(() => called.push("after_unload"));
    reloader.toRun(function (this: Reloader) {
      this.classUnloadBang(() => called.push("unload"));
    });
    reloader.wrap(() => called.push("body"));

    expect(called).toEqual(["before_unload", "unload", "after_unload", "body"]);
  });

  it("report errors once", async () => {
    const reports = await ErrorCollector.record(async () => {
      await assertRaises([RuntimeError], {}, () => {
        reloader.wrap(() => {
          throw new RuntimeError("Oops");
        });
      });
    });
    expect(reports.length).toEqual(1);
  });
});
