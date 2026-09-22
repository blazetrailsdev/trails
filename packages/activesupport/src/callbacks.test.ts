import { kernelThrow } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import {
  Value,
  defineCallbacks,
  setCallback,
  skipCallback,
  resetCallbacks,
  runCallbacks,
  CallbacksMixin,
  CallTemplate,
  peekCallbackChain,
} from "./callbacks.js";
import { ArgumentError } from "./hash-utils.js";

describe("Callbacks", () => {
  describe("defineCallbacks / setCallback / runCallbacks", () => {
    it("runs before callbacks in order", () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "before", (t: any) => {
        t.log.push("before1");
      });
      setCallback(target, "save", "before", (t: any) => {
        t.log.push("before2");
      });

      runCallbacks(target, "save", () => {
        target.log.push("block");
      });

      expect(target.log).toEqual(["before1", "before2", "block"]);
    });

    it("runs after callbacks in reverse order", () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "after", (t: any) => {
        t.log.push("after1");
      });
      setCallback(target, "save", "after", (t: any) => {
        t.log.push("after2");
      });

      runCallbacks(target, "save", () => {
        target.log.push("block");
      });

      expect(target.log).toEqual(["block", "after2", "after1"]);
    });

    it("runs around callbacks wrapping the block", () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "around", (t: any, next: () => void) => {
        t.log.push("around-before");
        next();
        t.log.push("around-after");
      });

      runCallbacks(target, "save", () => {
        target.log.push("block");
      });

      expect(target.log).toEqual(["around-before", "block", "around-after"]);
    });

    it("binds this to the record inside proc/block callbacks (Rails instance_exec)", () => {
      const target = {
        seen: [] as unknown[],
        beforeThis: null as unknown,
        afterThis: null as unknown,
        aroundThis: null as unknown,
        aroundArg: null as unknown,
      };
      defineCallbacks(target, "save");
      setCallback(target, "save", "before", function (this: any, record: any) {
        target.beforeThis = this;
        target.seen.push(record);
      });
      setCallback(target, "save", "after", function (this: any) {
        target.afterThis = this;
      });
      setCallback(target, "save", "around", function (this: any, record: any, next: () => void) {
        target.aroundThis = this;
        target.aroundArg = record;
        next();
      });

      runCallbacks(target, "save", () => {});

      expect(target.beforeThis).toBe(target);
      expect(target.afterThis).toBe(target);
      expect(target.aroundThis).toBe(target);
      expect(target.aroundArg).toBe(target);
      expect(target.seen).toEqual([target]);
    });

    it("InstanceExec call templates bind this to the record (Rails instance_exec)", () => {
      const target = {};
      const block = () => "block-result";
      const seen: Array<{ self: unknown; args: unknown[] }> = [];
      const record = function (this: unknown, ...args: unknown[]) {
        seen.push({ self: this, args });
      };

      new CallTemplate.InstanceExec0(record).makeLambda()(target, "v");
      new CallTemplate.InstanceExec1(record).makeLambda()(target, "v");
      new CallTemplate.InstanceExec2(record).makeLambda()(target, "v", block);

      expect(seen[0]).toEqual({ self: target, args: [] });
      expect(seen[1]).toEqual({ self: target, args: [target] });
      expect(seen[2]).toEqual({ self: target, args: [target, block] });
    });

    it("InstanceExec2 requires a block (Rails raises ArgumentError without one)", () => {
      const target = {};
      const template = new CallTemplate.InstanceExec2(() => undefined);
      expect(() => template.makeLambda()(target, "v")).toThrow();
      expect(() => template.makeLambda()(target, "v", null)).toThrow();
    });

    it("runs before, around, and after in correct order", () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "before", (t: any) => t.log.push("before"));
      setCallback(target, "save", "after", (t: any) => t.log.push("after"));
      setCallback(target, "save", "around", (t: any, next: () => void) => {
        t.log.push("around-pre");
        next();
        t.log.push("around-post");
      });

      runCallbacks(target, "save", () => target.log.push("block"));

      expect(target.log).toEqual(["before", "around-pre", "block", "around-post", "after"]);
    });

    it("after registered after an around runs inside it", () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "around", (t: any, next: () => void) => {
        t.log.push("around-pre");
        next();
        t.log.push("around-post");
      });
      setCallback(target, "save", "after", (t: any) => t.log.push("after"));

      runCallbacks(target, "save", () => target.log.push("block"));

      expect(target.log).toEqual(["around-pre", "block", "after", "around-post"]);
    });
  });

  describe("around dispatch shapes (method-name & object)", () => {
    it("test_save_around", () => {
      const tweedleDum = Symbol("tweedleDum");
      const target: any = { history: [] as string[], result: null };
      target[tweedleDum] = function (this: any, next: () => unknown) {
        this.history.push("tweedle dum pre");
        this.result = next();
        this.history.push("tweedle dum post");
      };
      defineCallbacks(target, "save");
      setCallback(target, "save", "around", tweedleDum as any);

      runCallbacks(target, "save", () => {
        target.history.push("running");
        return "running";
      });

      expect(target.history).toEqual(["tweedle dum pre", "running", "tweedle dum post"]);
      expect(target.result).toBe("running");
    });
  });

  describe("halting", () => {
    it("halts when a before callback throws the abort sentinel", () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "before", (t: any) => {
        t.log.push("before1");
        kernelThrow(":abort");
      });
      setCallback(target, "save", "before", (t: any) => {
        t.log.push("should-not-run");
      });

      const result = runCallbacks(target, "save", () => {
        target.log.push("block");
      });

      expect(result).toBe(false);
      expect(target.log).toEqual(["before1"]);
    });

    it("propagates non-sentinel errors thrown by a before callback", () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "before", () => {
        throw new Error("boom");
      });
      setCallback(target, "save", "before", (t: any) => {
        t.log.push("should-not-run");
      });

      expect(() =>
        runCallbacks(target, "save", () => {
          target.log.push("block");
        }),
      ).toThrow("boom");
      expect(target.log).toEqual([]);
    });

    it("halts when an async before callback rejects with the abort sentinel", async () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "before", async (t: any) => {
        t.log.push("before1");
        kernelThrow(":abort");
      });
      setCallback(target, "save", "before", (t: any) => {
        t.log.push("should-not-run");
      });

      const result = await runCallbacks(target, "save", () => {
        target.log.push("block");
      });

      expect(result).toBe(false);
      expect(target.log).toEqual(["before1"]);
    });

    it("propagates a non-sentinel rejection from an async before callback", async () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "before", async () => {
        throw new Error("async-boom");
      });

      await expect(
        runCallbacks(target, "save", () => {
          target.log.push("block");
        }),
      ).rejects.toThrow("async-boom");
      expect(target.log).toEqual([]);
    });

    it("does not swallow the abort sentinel when terminator is disabled", () => {
      const target = {};
      defineCallbacks(target, "save", { terminator: false });
      setCallback(target, "save", "before", () => kernelThrow(":abort"));

      expect(() => runCallbacks(target, "save", () => {})).toThrow();
    });

    it("does not swallow the abort sentinel for a custom terminator", () => {
      const target = {};
      defineCallbacks(target, "save", {
        terminator: (_t, fn) => fn() === false,
      });
      setCallback(target, "save", "before", () => kernelThrow(":abort"));

      expect(() => runCallbacks(target, "save", () => {})).toThrow();
    });

    it("does not halt when terminator is disabled", () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save", { terminator: false });
      setCallback(target, "save", "before", () => false);

      const result = runCallbacks(target, "save", () => {
        target.log.push("block");
        return true;
      });

      expect(result).toBe(true);
      expect(target.log).toEqual(["block"]);
    });

    it("around callback can halt by not calling next", () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "around", (t: any) => {
        t.log.push("halted");
      });

      runCallbacks(target, "save", () => {
        target.log.push("block");
      });

      expect(target.log).toEqual(["halted"]);
    });

    it("after callbacks are skipped when around does not yield", () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "around", (t: any) => {
        t.log.push("around");
      });
      setCallback(target, "save", "after", (t: any) => {
        t.log.push("after");
      });
      const result = runCallbacks(target, "save", () => {
        target.log.push("block");
      });
      expect(result).toBeUndefined();
      expect(target.log).toEqual(["around"]);
    });

    it("fire-and-forget around does not swallow inner rejection", async () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "around", (_t: any, next: any) => {
        next();
      });
      await expect(
        runCallbacks(target, "save", async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
    });

    it("fire-and-forget next().finally(...) does not swallow inner rejection", async () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "around", (_t: any, next: any) => {
        next().finally(() => {});
      });
      await expect(
        runCallbacks(target, "save", async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
    });

    it("fire-and-forget next().catch() with no handler does not swallow rejection", async () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "around", (_t: any, next: any) => {
        next().catch();
      });
      await expect(
        runCallbacks(target, "save", async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
    });

    it("awaited around can rescue inner rejection", async () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      let caught: Error | null = null;
      setCallback(target, "save", "around", async (_t: any, next: any) => {
        try {
          await next();
        } catch (e) {
          caught = e as Error;
        }
      });
      await runCallbacks(target, "save", async () => {
        throw new Error("boom");
      });
      expect(caught!.message).toBe("boom");
    });
  });

  describe("conditional callbacks", () => {
    it("respects :if condition", () => {
      const target = { log: [] as string[], shouldRun: false };
      defineCallbacks(target, "save");
      setCallback(target, "save", "before", (t: any) => t.log.push("conditional"), {
        if: (t) => t.shouldRun,
      });

      runCallbacks(target, "save");
      expect(target.log).toEqual([]);

      target.shouldRun = true;
      runCallbacks(target, "save");
      expect(target.log).toEqual(["conditional"]);
    });

    it("respects :unless condition", () => {
      const target = { log: [] as string[], skip: true };
      defineCallbacks(target, "save");
      setCallback(target, "save", "before", (t: any) => t.log.push("run"), {
        unless: (t) => t.skip,
      });

      runCallbacks(target, "save");
      expect(target.log).toEqual([]);

      target.skip = false;
      runCallbacks(target, "save");
      expect(target.log).toEqual(["run"]);
    });

    it("supports array of :if conditions", () => {
      const target = { log: [] as string[], a: true, b: false };
      defineCallbacks(target, "save");
      setCallback(target, "save", "before", (t: any) => t.log.push("run"), {
        if: [(t) => t.a, (t) => t.b],
      });

      runCallbacks(target, "save");
      expect(target.log).toEqual([]);

      target.b = true;
      runCallbacks(target, "save");
      expect(target.log).toEqual(["run"]);
    });

    it("forwards the block's return value (env.value) to after-callback conditions", () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "after", (t: any) => t.log.push("after"), {
        unless: new Value((value) => value === false),
      });

      runCallbacks(target, "save", () => false);
      expect(target.log).toEqual([]);

      runCallbacks(target, "save", () => "ok");
      expect(target.log).toEqual(["after"]);
    });
  });

  describe("prepend", () => {
    it("prepends callback to front of chain", () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "before", (t: any) => t.log.push("first"));
      setCallback(target, "save", "before", (t: any) => t.log.push("prepended"), {
        prepend: true,
      });

      runCallbacks(target, "save");
      expect(target.log).toEqual(["prepended", "first"]);
    });
  });

  describe("skipCallback", () => {
    it("removes a specific callback", () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      const cb = (t: any) => t.log.push("skipped");
      setCallback(target, "save", "before", cb);
      setCallback(target, "save", "before", (t: any) => t.log.push("kept"));

      skipCallback(target, "save", "before", cb);
      runCallbacks(target, "save");
      expect(target.log).toEqual(["kept"]);
    });
  });

  describe("resetCallbacks", () => {
    it("removes all callbacks from a chain", () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "before", (t: any) => t.log.push("a"));
      setCallback(target, "save", "after", (t: any) => t.log.push("b"));

      resetCallbacks(target, "save");
      runCallbacks(target, "save", () => target.log.push("block"));
      expect(target.log).toEqual(["block"]);
    });
  });

  describe("error handling", () => {
    it("throws when setting callback on undefined chain", () => {
      const target = {};
      expect(() => setCallback(target, "save", "before", () => {})).toThrow(
        /No callback chain "save"/,
      );
    });

    it("runs block when no chain is defined", () => {
      const target = {};
      const log: string[] = [];
      runCallbacks(target, "nonexistent", () => log.push("ran"));
      expect(log).toEqual(["ran"]);
    });
  });

  describe("no block", () => {
    it("works without a block", () => {
      const target = { log: [] as string[] };
      defineCallbacks(target, "save");
      setCallback(target, "save", "before", (t: any) => t.log.push("before"));
      setCallback(target, "save", "after", (t: any) => t.log.push("after"));

      runCallbacks(target, "save");
      expect(target.log).toEqual(["before", "after"]);
    });
  });

  describe("save around", () => {
    it("save around", () => {
      const history: string[] = [];
      const target = { history, yes: true, no: false };
      defineCallbacks(target, "save");

      setCallback(target, "save", "before", (t: any) => {
        t.history.push("yup");
      });
      setCallback(
        target,
        "save",
        "before",
        (t: any) => {
          t.history.push("yup");
        },
        { if: () => true },
      );
      setCallback(target, "save", "after", (t: any) => {
        t.history.push("tweedle");
      });
      setCallback(target, "save", "around", (t: any, next: () => void) => {
        t.history.push("tweedle dum pre");
        next();
        t.history.push("tweedle dum post");
      });
      setCallback(
        target,
        "save",
        "around",
        (t: any, next: () => void) => {
          t.history.push("w0tyes before");
          next();
          t.history.push("w0tyes after");
        },
        { if: (t) => t.yes },
      );
      setCallback(target, "save", "around", (t: any, next: () => void) => {
        t.history.push("tweedle deedle pre");
        next();
        t.history.push("tweedle deedle post");
      });

      runCallbacks(target, "save", () => {
        target.history.push("running");
      });

      expect(target.history).toEqual([
        "yup",
        "yup",
        "tweedle dum pre",
        "w0tyes before",
        "tweedle deedle pre",
        "running",
        "tweedle deedle post",
        "w0tyes after",
        "tweedle dum post",
        "tweedle",
      ]);
    });
  });

  describe("around callback result", () => {
    it("save around", () => {
      const target = { result: null as unknown };
      defineCallbacks(target, "save");
      setCallback(target, "save", "after", () => "tweedle_1");
      setCallback(target, "save", "around", (t: any, next: any) => {
        t.result = next();
      });
      setCallback(target, "save", "after", () => "tweedle_2");

      runCallbacks(target, "save", () => "running");

      expect(target.result).toBe("running");
    });
  });

  describe("save conditional person", () => {
    it("save conditional person", () => {
      const history: string[] = [];
      const target = { history, yes: true, no: false };
      defineCallbacks(target, "save");

      setCallback(
        target,
        "save",
        "before",
        (t: any) => {
          t.history.push("proc_true");
        },
        { if: () => true },
      );
      setCallback(
        target,
        "save",
        "before",
        (t: any) => {
          t.history.push("b00m");
        },
        { if: () => false },
      );
      setCallback(
        target,
        "save",
        "before",
        (t: any) => {
          t.history.push("proc_unless_false");
        },
        { unless: () => false },
      );
      setCallback(
        target,
        "save",
        "before",
        (t: any) => {
          t.history.push("b00m");
        },
        { unless: () => true },
      );
      setCallback(
        target,
        "save",
        "before",
        (t: any) => {
          t.history.push("symbol_true");
        },
        { if: (t) => t.yes },
      );
      setCallback(
        target,
        "save",
        "before",
        (t: any) => {
          t.history.push("b00m");
        },
        { if: (t) => t.no },
      );
      setCallback(
        target,
        "save",
        "before",
        (t: any) => {
          t.history.push("symbol_unless_false");
        },
        { unless: (t) => t.no },
      );
      setCallback(
        target,
        "save",
        "before",
        (t: any) => {
          t.history.push("b00m");
        },
        { unless: (t) => t.yes },
      );
      setCallback(
        target,
        "save",
        "before",
        (t: any) => {
          t.history.push("combined");
        },
        { if: (t) => t.yes, unless: (t) => t.no },
      );
      setCallback(
        target,
        "save",
        "before",
        (t: any) => {
          t.history.push("b00m");
        },
        { if: (t) => t.yes, unless: (t) => t.yes },
      );

      runCallbacks(target, "save");
      expect(target.history).toEqual([
        "proc_true",
        "proc_unless_false",
        "symbol_true",
        "symbol_unless_false",
        "combined",
      ]);
    });
  });

  describe("reset callbacks", () => {
    it("save conditional person after reset has empty history", () => {
      const target = { history: [] as string[], yes: true, no: false };
      defineCallbacks(target, "save");
      setCallback(
        target,
        "save",
        "before",
        (t: any) => {
          t.history.push("proc");
        },
        { if: () => true },
      );
      resetCallbacks(target, "save");
      runCallbacks(target, "save");
      expect(target.history).toEqual([]);
    });

    it("reset callbacks", () => {
      const events: string[] = [];
      const target = { events };
      defineCallbacks(target, "foo");
      setCallback(target, "foo", "before", (t: any) => {
        t.events.push("hi");
      });
      runCallbacks(target, "foo");
      expect(events.length).toBe(1);

      resetCallbacks(target, "foo");
      runCallbacks(target, "foo");
      expect(events.length).toBe(1);
    });
  });

  describe("termination skips following before and around callbacks", () => {
    it("termination skips following before and around callbacks", () => {
      const history: string[] = [];
      const target = { history, saved: false as boolean | undefined };
      defineCallbacks(target, "save", {
        terminator: (_t: object, fn: () => unknown) => fn() === "halt",
      });
      setCallback(target, "save", "before", (t: any) => {
        t.history.push("first");
      });
      setCallback(target, "save", "before", (t: any) => {
        t.history.push("second");
        return "halt";
      });
      setCallback(target, "save", "around", (t: any, next: () => void) => {
        t.history.push("around1");
        next();
        t.history.push("around2");
      });
      setCallback(target, "save", "before", (t: any) => {
        t.history.push("third");
      });
      setCallback(target, "save", "after", (t: any) => {
        t.history.push("first_after");
      });
      setCallback(target, "save", "after", (t: any) => {
        t.history.push("third_after");
      });

      const result = runCallbacks(target, "save", () => {
        target.saved = true;
      });
      expect(result).toBe(false);
      expect(target.saved).toBeFalsy();
      expect(target.history).toContain("first");
      expect(target.history).toContain("second");
      expect(target.history).not.toContain("third");
    });

    it("block never called if terminated", () => {
      const target = { saved: false as boolean };
      defineCallbacks(target, "save", {
        terminator: (_t: object, fn: () => unknown) => fn() === "halt",
      });
      setCallback(target, "save", "before", () => "halt");
      runCallbacks(target, "save", () => {
        target.saved = true;
      });
      expect(target.saved).toBe(false);
    });

    it("returning false does not halt callback when terminator disabled", () => {
      const target = { saved: false as boolean, halted: null as any };
      defineCallbacks(target, "save", { terminator: false });
      setCallback(target, "save", "before", () => false);
      setCallback(target, "save", "before", (t: any) => {});
      runCallbacks(target, "save", () => {
        target.saved = true;
      });
      expect(target.halted).toBeNull();
      expect(target.saved).toBe(true);
    });
  });

  describe("skip callback", () => {
    it("skip person — removes specific callbacks conditionally", () => {
      const history: string[] = [];
      const target = { history };
      defineCallbacks(target, "save");

      const beforeCb = (t: any) => {
        t.history.push("before_symbol");
      };
      const afterCb = (t: any) => {
        t.history.push("after_symbol");
      };
      setCallback(target, "save", "before", beforeCb);
      setCallback(target, "save", "after", afterCb);
      setCallback(target, "save", "before", (t: any) => {
        t.history.push("before_proc");
      });

      skipCallback(target, "save", "before", beforeCb);

      runCallbacks(target, "save");
      expect(target.history).not.toContain("before_symbol");
      expect(target.history).toContain("before_proc");
      expect(target.history).toContain("after_symbol");
    });
  });

  describe("excludes duplicates in separate calls", () => {
    it("excludes duplicates in separate calls", () => {
      const record: string[] = [];
      const target = { record };
      defineCallbacks(target, "save");

      const first = (t: any) => {
        t.record.push("one");
      };
      const second = (t: any) => {
        t.record.push("two");
      };
      const third = (t: any) => {
        t.record.push("three");
      };

      setCallback(target, "save", "before", first);
      setCallback(target, "save", "before", second);
      setCallback(target, "save", "before", third);

      runCallbacks(target, "save", () => {
        target.record.push("yielded");
      });
      expect(target.record).toContain("one");
      expect(target.record).toContain("two");
      expect(target.record).toContain("three");
      expect(target.record).toContain("yielded");
    });
  });

  describe("run callbacks only before", () => {
    it("run callbacks only before", () => {
      const history: string[] = [];
      const target = { history };
      defineCallbacks(target, "save");
      setCallback(target, "save", "before", (t: any) => {
        t.history.push("before_save_1");
      });
      setCallback(target, "save", "before", (t: any) => {
        t.history.push("before_save_2");
      });
      setCallback(target, "save", "after", (t: any) => {
        t.history.push("after_save_1");
      });

      runCallbacks(target, "save");
      expect(target.history.indexOf("before_save_1")).toBeLessThan(
        target.history.indexOf("before_save_2"),
      );
    });
  });

  describe("run callbacks only after", () => {
    it("run callbacks only after", () => {
      const history: string[] = [];
      const target = { history };
      defineCallbacks(target, "save");
      setCallback(target, "save", "after", (t: any) => {
        t.history.push("after_save_1");
      });
      setCallback(target, "save", "after", (t: any) => {
        t.history.push("after_save_2");
      });

      runCallbacks(target, "save");
      expect(target.history).toEqual(["after_save_2", "after_save_1"]);
    });
  });

  describe("run callbacks only around", () => {
    it("run callbacks only around", () => {
      const history: string[] = [];
      const target = { history };
      defineCallbacks(target, "save");
      setCallback(target, "save", "around", (t: any, next: () => void) => {
        t.history.push("around_save_1_before");
        next();
        t.history.push("around_save_1_after");
      });
      setCallback(target, "save", "around", (t: any, next: () => void) => {
        t.history.push("around_save_2_before");
        next();
        t.history.push("around_save_2_after");
      });

      runCallbacks(target, "save");
      expect(target.history).toEqual([
        "around_save_1_before",
        "around_save_2_before",
        "around_save_2_after",
        "around_save_1_after",
      ]);
    });
  });

  describe("hyphenated key", () => {
    it("save with conditional before callback", () => {
      const target = { stuff: null as string | null, yes: true };
      defineCallbacks(target, "save");
      setCallback(
        target,
        "save",
        "before",
        (t: any) => {
          t.stuff = "ACTION";
        },
        { if: (t) => t.yes },
      );
      runCallbacks(target, "save", () => {});
      expect(target.stuff).toBe("ACTION");
    });
  });
});

describe("CallbacksMixin", () => {
  it("provides defineCallbacks and runCallbacks as class/instance methods", () => {
    class MyModel extends CallbacksMixin() {
      log: string[] = [];

      static {
        this.defineCallbacks("save");
        this.beforeCallback("save", (self: MyModel) => {
          self.log.push("before");
        });
        this.afterCallback("save", (self: MyModel) => {
          self.log.push("after");
        });
      }

      save() {
        this.runCallbacks("save", () => {
          this.log.push("saved");
        });
      }
    }

    const m = new MyModel();
    m.save();
    expect(m.log).toEqual(["before", "saved", "after"]);
  });

  it("aroundCallback wraps block", () => {
    class MyModel extends CallbacksMixin() {
      log: string[] = [];

      static {
        this.defineCallbacks("run");
        this.aroundCallback("run", (self: MyModel, next: () => void) => {
          self.log.push("before_around");
          next();
          self.log.push("after_around");
        });
      }

      run() {
        this.runCallbacks("run", () => {
          this.log.push("core");
        });
      }
    }

    const m = new MyModel();
    m.run();
    expect(m.log).toEqual(["before_around", "core", "after_around"]);
  });

  it("skipCallback removes a callback", () => {
    const cb = (self: any) => {
      self.log.push("skipped");
    };

    class MyModel extends CallbacksMixin() {
      log: string[] = [];

      static {
        this.defineCallbacks("save");
        this.beforeCallback("save", cb);
      }

      save() {
        this.runCallbacks("save");
      }
    }

    MyModel.skipCallback("save", "before", cb);
    const m = new MyModel();
    m.save();
    expect(m.log).toEqual([]);
  });

  it("can extend an existing base class", () => {
    class Base {
      type = "base";
    }

    class Extended extends CallbacksMixin(Base) {
      log: string[] = [];

      static {
        this.defineCallbacks("action");
        this.beforeCallback("action", (self: Extended) => self.log.push("before"));
      }

      doAction() {
        this.runCallbacks("action");
      }
    }

    const e = new Extended();
    expect(e.type).toBe("base");
    e.doAction();
    expect(e.log).toEqual(["before"]);
  });

  it("conditional callbacks work with if option", () => {
    class MyModel extends CallbacksMixin() {
      log: string[] = [];
      active = true;

      static {
        this.defineCallbacks("save");
        this.beforeCallback("save", (self: MyModel) => self.log.push("conditional"), {
          if: (self: any) => self.active,
        });
      }

      save() {
        this.runCallbacks("save");
      }
    }

    const m = new MyModel();
    m.save();
    expect(m.log).toContain("conditional");

    m.log = [];
    m.active = false;
    m.save();
    expect(m.log).not.toContain("conditional");
  });
});

class Record {
  static beforeSave(...filters: any[]): void {
    setCallback(this.prototype, "save", "before", ...filters);
  }

  static afterSave(...filters: any[]): void {
    setCallback(this.prototype, "save", "after", ...filters);
  }

  static callbackSymbol(callbackMethod: string): string {
    const methodName = `${callbackMethod}Method`;
    Object.defineProperty(this.prototype, methodName, {
      value: function (this: Record) {
        this.history.push([callbackMethod, "symbol"]);
      },
      configurable: true,
      writable: true,
    });
    return `:${methodName}`;
  }

  static callbackProc(callbackMethod: string): (model: Record) => void {
    return (model: Record) => {
      model.history.push([callbackMethod, "proc"]);
    };
  }

  static callbackObject(callbackMethod: string): object {
    const klass = class {};
    Object.defineProperty(klass.prototype, callbackMethod, {
      value: (model: Record) => {
        model.history.push([`${callbackMethod}Save`, "object"]);
      },
    });
    return new klass();
  }

  private _history?: unknown[];

  get history(): unknown[] {
    return (this._history ??= []);
  }
}
defineCallbacks(Record.prototype, "save");

const CallbackClass = new (class CallbackClass {
  before(model: Record) {
    model.history.push(["beforeSave", "class"]);
  }

  after(model: Record) {
    model.history.push(["afterSave", "class"]);
  }
})();

class Person extends Record {
  saveFails = false;

  static {
    for (const callbackMethod of ["beforeSave", "afterSave"] as const) {
      this[callbackMethod](this.callbackSymbol(callbackMethod));
      this[callbackMethod](this.callbackProc(callbackMethod));
      this[callbackMethod](this.callbackObject(callbackMethod.replace(/Save/, "")));
      this[callbackMethod](CallbackClass);
      this[callbackMethod]((model: Record) => {
        model.history.push([callbackMethod, "block"]);
      });
    }
  }

  save(): unknown {
    return runCallbacks(this, "save", () => {
      if (this.saveFails) throw new Error("inside save");
    });
  }
}

class PersonSkipper extends Person {
  static {
    skipCallback(this.prototype, "save", "before", ":beforeSaveMethod", { if: ":yes" });
    skipCallback(this.prototype, "save", "after", ":afterSaveMethod", { unless: ":yes" });
    skipCallback(this.prototype, "save", "after", ":afterSaveMethod", { if: ":no" });
    skipCallback(this.prototype, "save", "before", ":beforeSaveMethod", { unless: ":no" });
    skipCallback(this.prototype, "save", "before", CallbackClass, { if: ":yes" });
  }

  yes(): boolean {
    return true;
  }

  no(): boolean {
    return false;
  }
}

class PersonForProgrammaticSkipping extends Person {}

class ConditionalPerson extends Record {
  static {
    this.beforeSave((r: Record) => r.history.push(["beforeSave", "proc"]), {
      if: (r: Record) => true,
    });
    this.beforeSave((r: Record) => r.history.push("b00m"), { if: (r: Record) => false });
    this.beforeSave((r: Record) => r.history.push(["beforeSave", "proc"]), {
      unless: (r: Record) => false,
    });
    this.beforeSave((r: Record) => r.history.push("b00m"), { unless: (r: Record) => true });
    this.beforeSave((r: Record) => r.history.push("b00m"), { unless: (r: Record) => r.history });
    this.beforeSave((r: Record) => r.history.push("b00m"), { unless: (r: Record) => r.history });
    this.beforeSave((r: Record) => r.history.push(["beforeSave", "symbol"]), { if: ":yes" });
    this.beforeSave((r: Record) => r.history.push("b00m"), { if: ":no" });
    this.beforeSave((r: Record) => r.history.push(["beforeSave", "symbol"]), { unless: ":no" });
    this.beforeSave((r: Record) => r.history.push("b00m"), { unless: ":yes" });
    this.beforeSave((r: Record) => r.history.push(["beforeSave", "combinedSymbol"]), {
      if: ":yes",
      unless: ":no",
    });
    this.beforeSave((r: Record) => r.history.push("b00m"), { if: ":yes", unless: ":yes" });
  }

  yes(): boolean {
    return true;
  }

  otherYes(): boolean {
    return true;
  }

  no(): boolean {
    return false;
  }

  otherNo(): boolean {
    return false;
  }

  save(): unknown {
    return runCallbacks(this, "save");
  }
}

class CleanPerson extends ConditionalPerson {
  static {
    resetCallbacks(this.prototype, "save");
  }
}

class MySuper {}
defineCallbacks(MySuper.prototype, "save");

class MySlate extends MySuper {
  history: string[] = [];
  saveFails = false;

  save(): unknown {
    return runCallbacks(this, "save", () => {
      if (this.saveFails) throw new Error("inside save");
      this.history.push("running");
    });
  }

  no(): boolean {
    return false;
  }

  yes(): boolean {
    return true;
  }
}

class AroundPerson extends MySlate {
  static {
    setCallback(this.prototype, "save", "before", ":nope", { if: ":no" });
    setCallback(this.prototype, "save", "before", ":nope", { unless: ":yes" });
    setCallback(this.prototype, "save", "after", ":tweedle");
    setCallback(this.prototype, "save", "before", (m: MySlate) => m.history.push("yup"));
    setCallback(this.prototype, "save", "before", ":nope", { if: () => false });
    setCallback(this.prototype, "save", "before", ":nope", { unless: () => true });
    setCallback(this.prototype, "save", "before", ":yup", { if: () => true });
    setCallback(this.prototype, "save", "before", ":yup", { unless: () => false });
    setCallback(this.prototype, "save", "around", ":tweedleDum");
    setCallback(this.prototype, "save", "around", ":w0tyes", { if: ":yes" });
    setCallback(this.prototype, "save", "around", ":w0tno", { if: ":no" });
    setCallback(this.prototype, "save", "around", ":tweedleDeedle");
  }

  nope(): void {
    this.history.push("boom");
  }

  yup(): void {
    this.history.push("yup");
  }

  w0tyes(block: () => unknown): void {
    this.history.push("w0tyes before");
    block();
    this.history.push("w0tyes after");
  }

  w0tno(block: () => unknown): void {
    this.history.push("boom");
    block();
  }

  tweedleDum(block: () => unknown): void {
    this.history.push("tweedle dum pre");
    block();
    this.history.push("tweedle dum post");
  }

  tweedle(): void {
    this.history.push("tweedle");
  }

  tweedleDeedle(block: () => unknown): void {
    this.history.push("tweedle deedle pre");
    block();
    this.history.push("tweedle deedle post");
  }
}

class AroundPersonResult extends MySuper {
  result: unknown;

  static {
    setCallback(this.prototype, "save", "after", ":tweedle1");
    setCallback(this.prototype, "save", "around", ":tweedleDum");
    setCallback(this.prototype, "save", "after", ":tweedle2");
  }

  tweedleDum(block: () => unknown): void {
    this.result = block();
  }

  tweedle1(): string {
    return "tweedle1";
  }

  tweedle2(): string {
    return "tweedle2";
  }

  save(): unknown {
    return runCallbacks(this, "save", () => "running");
  }
}

class AbstractCallbackTerminator {
  static setSaveCallbacks(): void {
    setCallback(this.prototype, "save", "before", ":first");
    setCallback(this.prototype, "save", "before", ":second");
    setCallback(this.prototype, "save", "around", ":aroundIt");
    setCallback(this.prototype, "save", "before", ":third");
    setCallback(this.prototype, "save", "after", ":first");
    setCallback(this.prototype, "save", "around", ":aroundIt");
    setCallback(this.prototype, "save", "after", ":third");
  }

  history: string[] = [];
  saved: boolean | undefined;
  halted: unknown;
  callbackName: unknown;

  aroundIt(block: () => unknown): void {
    this.history.push("around1");
    block();
    this.history.push("around2");
  }

  first(): void {
    this.history.push("first");
  }

  second(): unknown {
    this.history.push("second");
    return ":halt";
  }

  third(): void {
    this.history.push("third");
  }

  save(): unknown {
    return runCallbacks(this, "save", () => {
      this.saved = true;
    });
  }

  haltedCallbackHook(filter: unknown, name: string): void {
    this.halted = filter;
    this.callbackName = name;
  }
}

class CallbackTerminator extends AbstractCallbackTerminator {
  static {
    defineCallbacks(this.prototype, "save", {
      terminator: (_: object, resultLambda: () => unknown) => resultLambda() === ":halt",
    });
    this.setSaveCallbacks();
  }
}

class CallbackTerminatorSkippingAfterCallbacks extends AbstractCallbackTerminator {
  static {
    defineCallbacks(this.prototype, "save", {
      terminator: (_: object, resultLambda: () => unknown) => resultLambda() === ":halt",
      skipAfterCallbacksIfTerminated: true,
    });
    this.setSaveCallbacks();
  }
}

class CallbackDefaultTerminator extends AbstractCallbackTerminator {
  static {
    defineCallbacks(this.prototype, "save");
  }

  override second(): unknown {
    this.history.push("second");
    return kernelThrow(":abort");
  }

  static {
    this.setSaveCallbacks();
  }
}

class CallbackFalseTerminator extends AbstractCallbackTerminator {
  static {
    defineCallbacks(this.prototype, "save");
  }

  override second(): unknown {
    this.history.push("second");
    return false;
  }

  static {
    this.setSaveCallbacks();
  }
}

class WriterSkipper extends Person {
  age = 0;

  static {
    skipCallback(this.prototype, "save", "before", ":beforeSaveMethod", {
      if: function (this: WriterSkipper) {
        return this.age > 21;
      },
    });
  }
}

describe("CallbacksTest", () => {
  it("save person", () => {
    const person = new Person();
    expect(person.history).toEqual([]);
    person.save();
    expect(person.history).toEqual([
      ["beforeSave", "symbol"],
      ["beforeSave", "proc"],
      ["beforeSave", "object"],
      ["beforeSave", "class"],
      ["beforeSave", "block"],
      ["afterSave", "block"],
      ["afterSave", "class"],
      ["afterSave", "object"],
      ["afterSave", "proc"],
      ["afterSave", "symbol"],
    ]);
  });
});

describe("AroundCallbacksTest", () => {
  it("save around", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    setCallback(target, "save", "around", (t: any, next: () => void) => {
      t.log.push("before_around");
      next();
      t.log.push("after_around");
    });
    runCallbacks(target, "save", () => target.log.push("body"));
    expect(target.log).toEqual(["before_around", "body", "after_around"]);
  });
});

describe("OneTimeCompileTest", () => {
  it("optimized first compile", () => {
    const target = { log: [] as string[], count: 0 };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", (t: any) => {
      t.log.push("a");
      t.count++;
    });
    runCallbacks(target, "save");
    runCallbacks(target, "save");
    expect(target.count).toBe(2);
  });
});

describe("DoubleYieldTest", () => {
  class DoubleYieldModel extends MySlate {
    static {
      setCallback(this.prototype, "save", "around", ":wrapOuter");
      setCallback(this.prototype, "save", "around", ":doubleTrouble");
      setCallback(this.prototype, "save", "around", ":wrapInner");
    }

    wrapOuter(block: () => unknown): void {
      this.history.push("wrap_outer");
      block();
      this.history.push("unwrap_outer");
    }

    doubleTrouble(block: () => unknown): void {
      this.history.push("first_trouble");
      block();
      this.history.push("second_trouble");
      block();
      this.history.push("third_trouble");
    }

    wrapInner(block: () => unknown): void {
      this.history.push("wrap_inner");
      block();
      this.history.push("unwrap_inner");
    }
  }

  it("double save", () => {
    const double = new DoubleYieldModel();
    double.save();
    expect(double.history).toEqual([
      "wrap_outer",
      "first_trouble",
      "wrap_inner",
      "running",
      "unwrap_inner",
      "second_trouble",
      "wrap_inner",
      "running",
      "unwrap_inner",
      "third_trouble",
      "unwrap_outer",
    ]);
  });
});

describe("CallStackTest", () => {
  it.skip("tidy call stack", () => {
    // BLOCKED: callbacks-runner-exceeds-rails-call-stack-budget
    const around = new AroundPerson();
    around.saveFails = true;

    let exception!: Error;
    try {
      around.save();
    } catch (e) {
      exception = e as Error;
    }

    expect(exception.message).toBe("inside save");

    const callStack = exception
      .stack!.split("\n")
      .slice(1)
      .map((line) => /^\s*at (\S+) \(/.exec(line)?.[1] ?? "<anonymous>");
    callStack.splice(callStack.length - (new Error().stack!.split("\n").length - 1));

    // eslint-disable-next-line vitest/no-conditional-in-test
    if (callStack[callStack.length - 1].includes(".")) {
      // eslint-disable-next-line vitest/no-conditional-expect
      expect(callStack.join("\n")).toBe(
        [
          "<anonymous>",
          "next",
          "AroundPerson.tweedleDeedle",
          "next",
          "AroundPerson.w0tyes",
          "next",
          "AroundPerson.tweedleDum",
          "next",
          "runCallbacks",
          "AroundPerson.save",
        ].join("\n"),
      );
    } else {
      // eslint-disable-next-line vitest/no-conditional-expect
      expect(callStack.join("\n")).toBe(
        [
          "<anonymous>",
          "next",
          "tweedleDeedle",
          "next",
          "w0tyes",
          "next",
          "tweedleDum",
          "next",
          "runCallbacks",
          "save",
        ].join("\n"),
      );
    }
  });

  it.skip("short call stack", () => {
    // BLOCKED: callbacks-runner-exceeds-rails-call-stack-budget
    const person = new Person();
    person.saveFails = true;

    let exception!: Error;
    try {
      person.save();
    } catch (e) {
      exception = e as Error;
    }

    expect(exception.message).toBe("inside save");

    const callStack = exception
      .stack!.split("\n")
      .slice(1)
      .map((line) => /^\s*at (\S+) \(/.exec(line)?.[1] ?? "<anonymous>");
    callStack.splice(callStack.length - (new Error().stack!.split("\n").length - 1));

    // eslint-disable-next-line vitest/no-conditional-in-test
    if (callStack[callStack.length - 1].includes(".")) {
      // eslint-disable-next-line vitest/no-conditional-expect
      expect(callStack.join("\n")).toBe(["<anonymous>", "runCallbacks", "Person.save"].join("\n"));
    } else {
      // eslint-disable-next-line vitest/no-conditional-expect
      expect(callStack.join("\n")).toBe(["<anonymous>", "runCallbacks", "save"].join("\n"));
    }
  });
});

describe("ExtendCallbacksTest", () => {
  const ExtendModule = {
    extended(base: ExtendCallbacks) {
      setCallback(base, "save", "before", ":record3");
    },

    record3(this: ExtendCallbacks) {
      this.recorder.push(3);
    },
  };

  const IncludeModule = {
    included(base: typeof ExtendCallbacks) {
      setCallback(base.prototype, "save", "before", ":record2");
    },

    record2(this: ExtendCallbacks) {
      this.recorder.push(2);
    },
  };

  class ExtendCallbacks {
    static {
      defineCallbacks(this.prototype, "save");
      setCallback(this.prototype, "save", "before", ":record1");

      Object.defineProperty(this.prototype, "record2", { value: IncludeModule.record2 });
      IncludeModule.included(this);
    }

    save(): unknown {
      return runCallbacks(this, "save");
    }

    recorder: number[] = [];

    private record1(): void {
      this.recorder.push(1);
    }
  }

  it("save", () => {
    const model = Object.assign(new ExtendCallbacks(), { record3: ExtendModule.record3 });
    ExtendModule.extended(model);
    model.save();
    expect(model.recorder).toEqual([1, 2, 3]);
  });
});

describe("HyphenatedKeyTest", () => {
  it("save", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "my-save");
    setCallback(target, "my-save", "before", (t: any) => t.log.push("before"));
    runCallbacks(target, "my-save", () => target.log.push("body"));
    expect(target.log).toEqual(["before", "body"]);
  });
});

describe("CallbackFalseTerminatorTest", () => {
  it("returning false does not halt callback", () => {
    const obj = new CallbackFalseTerminator();
    obj.save();
    expect(obj.halted).toBeUndefined();
    expect(obj.saved).toBeTruthy();
  });
});

describe("WriterCallbacksTest", () => {
  it("skip writer", () => {
    const writer = new WriterSkipper();
    writer.age = 18;
    expect(writer.history).toEqual([]);
    writer.save();
    expect(writer.history).toEqual([
      ["beforeSave", "symbol"],
      ["beforeSave", "proc"],
      ["beforeSave", "object"],
      ["beforeSave", "class"],
      ["beforeSave", "block"],
      ["afterSave", "block"],
      ["afterSave", "class"],
      ["afterSave", "object"],
      ["afterSave", "proc"],
      ["afterSave", "symbol"],
    ]);
  });
});

describe("ConditionalCallbackTest", () => {
  it("save conditional person", () => {
    const person = new ConditionalPerson();
    person.save();
    expect(person.history).toEqual([
      ["beforeSave", "proc"],
      ["beforeSave", "proc"],
      ["beforeSave", "symbol"],
      ["beforeSave", "symbol"],
      ["beforeSave", "combinedSymbol"],
    ]);
  });
});

describe("AroundCallbackResultTest", () => {
  it("save around", () => {
    const around = new AroundPersonResult();
    around.save();
    expect(around.result).toBe("running");
  });
});

describe("ResetCallbackTest", () => {
  function buildClass(memo: unknown[]) {
    class Klass {
      static {
        defineCallbacks(this.prototype, "foo");
        setCallback(this.prototype, "foo", "before", ":hello");
      }

      run(): unknown {
        return runCallbacks(this, "foo");
      }

      hello(): void {
        memo.push("hi");
      }
    }
    return Klass;
  }

  it("save conditional person", () => {
    const person = new CleanPerson();
    person.save();
    expect(person.history).toEqual([]);
  });

  it("reset callbacks", () => {
    const events: unknown[] = [];
    const klass = buildClass(events);
    new klass().run();
    expect(events.length).toBe(1);

    resetCallbacks(klass.prototype, "foo");
    new klass().run();
    expect(events.length).toBe(1);
  });

  it.skip("reset impacts subclasses", () => {
    // BLOCKED: reset-callbacks-does-not-remove-from-descendants
    const events: unknown[] = [];
    const klass = buildClass(events);
    class Subclass extends klass {
      static {
        setCallback(this.prototype, "foo", "before", ":world");
      }

      world(): void {
        events.push("world");
      }
    }

    new Subclass().run();
    expect(events.length).toBe(2);

    resetCallbacks(klass.prototype, "foo");
    new Subclass().run();
    expect(events.length).toBe(3);
  });
});

describe("ConditionalTests", () => {
  function buildClass(callback: unknown) {
    class Klass {
      static {
        defineCallbacks(this.prototype, "foo");
        setCallback(this.prototype, "foo", "before", ":foo", { if: callback as any });
      }

      foo(): void {}

      run(): unknown {
        return runCallbacks(this, "foo");
      }
    }
    return Klass;
  }

  it("class conditional with scope", () => {
    const z: unknown[] = [];
    const callback = {
      foo(o: unknown) {
        z.push(o);
      },
    };
    class Klass {
      static {
        defineCallbacks(this.prototype, "foo", { scope: ["name"] });
        setCallback(this.prototype, "foo", "before", ":foo", { if: callback as any });
      }

      run(): unknown {
        return runCallbacks(this, "foo");
      }

      private foo(): void {}
    }
    const object = new Klass();
    object.run();
    expect(z).toEqual([object]);
  });

  it("class", () => {
    const z: unknown[] = [];
    const klass = buildClass({
      before(o: unknown) {
        z.push(o);
      },
    });
    const object = new klass();
    object.run();
    expect(z).toEqual([object]);
  });

  it("proc negative arity", () => {
    const z: unknown[] = [];
    const object = new (buildClass((...args: unknown[]) => z.push(args)))();
    object.run();
    expect(z.flat()).toEqual([]);
  });

  it("proc arity0", () => {
    const z: unknown[] = [];
    const object = new (buildClass(() => z.push(0)))();
    object.run();
    expect(z).toEqual([0]);
  });

  it("proc arity1", () => {
    const z: unknown[] = [];
    const object = new (buildClass((x: unknown) => z.push(x)))();
    object.run();
    expect(z).toEqual([object]);
  });

  it("proc arity2", () => {
    expect(() => {
      const object = new (buildClass((a: unknown, b: unknown) => {}))();
      object.run();
    }).toThrow(ArgumentError);
  });
});

describe("SkipCallbacksTest", () => {
  it("skip person", () => {
    const person = new PersonSkipper();
    expect(person.history).toEqual([]);
    person.save();
    expect(person.history).toEqual([
      ["beforeSave", "proc"],
      ["beforeSave", "object"],
      ["beforeSave", "block"],
      ["afterSave", "block"],
      ["afterSave", "class"],
      ["afterSave", "object"],
      ["afterSave", "proc"],
      ["afterSave", "symbol"],
    ]);
  });

  it("skip person programmatically", () => {
    for (const saveCallback of peekCallbackChain(PersonForProgrammaticSkipping.prototype, "save")!
      .entries) {
      if ("before" === String(saveCallback.kind)) {
        skipCallback(
          PersonForProgrammaticSkipping.prototype,
          "save",
          saveCallback.kind,
          saveCallback.filter as any,
        );
      }
    }
    const person = new PersonForProgrammaticSkipping();
    expect(person.history).toEqual([]);
    person.save();
    expect(person.history).toEqual([
      ["afterSave", "block"],
      ["afterSave", "class"],
      ["afterSave", "object"],
      ["afterSave", "proc"],
      ["afterSave", "symbol"],
    ]);
  });
});

describe("ExcludingDuplicatesCallbackTest", () => {
  function oneTwoThreeSave(): any {
    const target: any = {
      record: [] as string[],
      first() {
        target.record.push("one");
      },
      second() {
        target.record.push("two");
      },
      third() {
        target.record.push("three");
      },
      save() {
        runCallbacks(target, "save", () => {
          target.record.push("yielded");
        });
      },
    };
    defineCallbacks(target, "save");
    return target;
  }

  it("excludes duplicates in separate calls", () => {
    const model = oneTwoThreeSave();
    setCallback(model, "save", "before", ":first");
    setCallback(model, "save", "before", ":second");
    setCallback(model, "save", "before", ":first");
    setCallback(model, "save", "before", ":third");

    model.save();
    expect(model.record).toEqual(["two", "one", "three", "yielded"]);
  });

  it("excludes duplicates in one call", () => {
    const model = oneTwoThreeSave();
    setCallback(model, "save", "before", ":first", ":second", ":first", ":third");

    model.save();
    expect(model.record).toEqual(["two", "one", "three", "yielded"]);
  });
});

describe("RunSpecificCallbackTest", () => {
  it("run callbacks only before", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", (t: any) => t.log.push("before"));
    setCallback(target, "save", "after", (t: any) => t.log.push("after"));
    runCallbacks(target, "save", () => target.log.push("body"));
    expect(target.log[0]).toBe("before");
  });
  it("run callbacks only after", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    setCallback(target, "save", "after", (t: any) => t.log.push("after"));
    runCallbacks(target, "save", () => target.log.push("body"));
    expect(target.log[target.log.length - 1]).toBe("after");
  });
  it("run callbacks only around", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    setCallback(target, "save", "around", (t: any, next: () => void) => {
      t.log.push("wrap-before");
      next();
      t.log.push("wrap-after");
    });
    runCallbacks(target, "save", () => target.log.push("body"));
    expect(target.log).toEqual(["wrap-before", "body", "wrap-after"]);
  });
});

describe("UsingObjectTest", () => {
  class CallbackObject {
    before(caller: { record: string[] }): void {
      caller.record.push("before");
    }
    beforeSave(caller: { record: string[] }): void {
      caller.record.push("before save");
    }
    around(caller: { record: string[] }, next: () => unknown): void {
      caller.record.push("around before");
      next();
      caller.record.push("around after");
    }
  }

  const usingObjectBefore = () => {
    const u = { record: [] as string[] };
    defineCallbacks(u, "save");
    setCallback(u, "save", "before", new CallbackObject());
    return u;
  };
  const usingObjectAround = () => {
    const u = { record: [] as string[] };
    defineCallbacks(u, "save");
    setCallback(u, "save", "around", new CallbackObject());
    return u;
  };
  const customScopeObject = () => {
    const u = { record: [] as string[] };
    defineCallbacks(u, "save", { scope: ["kind", "name"] });
    setCallback(u, "save", "before", new CallbackObject());
    return u;
  };
  const save = (u: { record: string[] }) =>
    runCallbacks(u, "save", () => {
      u.record.push("yielded");
    });

  it("before object", () => {
    const u = usingObjectBefore();
    save(u);
    expect(u.record).toEqual(["before", "yielded"]);
  });
  it("around object", () => {
    const u = usingObjectAround();
    save(u);
    expect(u.record).toEqual(["around before", "yielded", "around after"]);
  });
  const customScopeSave = (u: { record: string[] }) =>
    runCallbacks(u, "save", () => {
      u.record.push("yielded");
      return "CallbackResult";
    });

  it("customized object", () => {
    const u = customScopeObject();
    customScopeSave(u);
    expect(u.record).toEqual(["before save", "yielded"]);
  });
  it("block result is returned", () => {
    const u = customScopeObject();
    expect(customScopeSave(u)).toBe("CallbackResult");
  });
});

describe("NotPermittedStringCallbackTest", () => {
  it("passing string callback is not permitted", () => {
    const target = {};
    defineCallbacks(target, "save");
    expect(() => setCallback(target, "save", "before", "not-a-function" as any)).toThrow();
  });
});

describe("CallbackTerminatorTest", () => {
  it("termination skips following before and around callbacks", () => {
    const terminator = new CallbackTerminator();
    terminator.save();
    expect(terminator.history).toEqual(["first", "second", "third", "first"]);
  });

  it("termination invokes hook", () => {
    const terminator = new CallbackTerminator();
    terminator.save();
    expect(terminator.halted).toBe(":second");
    expect(terminator.callbackName).toBe("save");
  });

  it("block never called if terminated", () => {
    const obj = new CallbackTerminator();
    obj.save();
    expect(obj.saved).toBeFalsy();
  });
});

describe("CallbackDefaultTerminatorTest", () => {
  it("default termination", () => {
    const terminator = new CallbackDefaultTerminator();
    terminator.save();
    expect(terminator.history).toEqual(["first", "second", "third", "first"]);
  });

  it("default termination invokes hook", () => {
    const terminator = new CallbackDefaultTerminator();
    terminator.save();
    expect(terminator.halted).toBe(":second");
  });

  it("block never called if abort is thrown", () => {
    const obj = new CallbackDefaultTerminator();
    obj.save();
    expect(obj.saved).toBeFalsy();
  });
});

describe("CallbackProcTest", () => {
  function buildClass(callback: unknown) {
    class Klass {
      static {
        defineCallbacks(this.prototype, "foo");
        setCallback(this.prototype, "foo", "before", callback as any);
      }

      run(): unknown {
        return runCallbacks(this, "foo");
      }
    }
    return Klass;
  }

  it("proc returns value", () => {
    const target = { log: [] as string[], value: 0 };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", (t: any) => {
      t.value = 42;
    });
    runCallbacks(target, "save");
    expect(target.value).toBe(42);
  });
  it("proc arity 0", () => {
    const target = { ran: false };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", () => {
      target.ran = true;
    });
    runCallbacks(target, "save");
    expect(target.ran).toBe(true);
  });
  it("proc arity 1", () => {
    const target = { ran: false };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", (t: any) => {
      t.ran = true;
    });
    runCallbacks(target, "save");
    expect(target.ran).toBe(true);
  });
  it("proc arity 2", () => {
    expect(() => {
      const klass = buildClass((x: unknown, y: unknown) => {});
      new klass().run();
    }).toThrow(ArgumentError);
  });
  it("proc negative called with empty list", () => {
    const target = { ran: false };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", () => {
      target.ran = true;
    });
    runCallbacks(target, "save");
    expect(target.ran).toBe(true);
  });
});

describe("CallbackTerminatorSkippingAfterCallbacksTest", () => {
  it("termination skips after callbacks", () => {
    const terminator = new CallbackTerminatorSkippingAfterCallbacks();
    terminator.save();
    expect(terminator.history).toEqual(["first", "second"]);
  });
});

describe("CallbackTypeTest", () => {
  function buildClass(callback: unknown, n = 10) {
    class Klass {
      static {
        defineCallbacks(this.prototype, "foo");
        for (let i = 0; i < n; i++) setCallback(this.prototype, "foo", "before", callback as any);
      }

      run(): unknown {
        return runCallbacks(this, "foo");
      }
    }
    return Klass;
  }

  it("add class", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    class CallbackClass {
      before(t: any) {
        t.log.push("class before");
      }
    }
    const cb = new CallbackClass();
    setCallback(target, "save", "before", (t: any) => cb.before(t));
    runCallbacks(target, "save");
    expect(target.log).toEqual(["class before"]);
  });

  it("add lambda", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    const cb = (t: any) => t.log.push("lambda");
    setCallback(target, "save", "before", cb);
    runCallbacks(target, "save");
    expect(target.log).toEqual(["lambda"]);
  });

  it("add symbol", () => {
    const target = {
      log: [] as string[],
      myCallback() {
        this.log.push("symbol");
      },
    };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", (t: any) => t.myCallback());
    runCallbacks(target, "save");
    expect(target.log).toEqual(["symbol"]);
  });

  it("skip class", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    const cb = (t: any) => t.log.push("cb");
    setCallback(target, "save", "before", cb);
    skipCallback(target, "save", "before", cb);
    runCallbacks(target, "save");
    expect(target.log).toEqual([]);
  });

  it("skip symbol", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    const cb = (t: any) => t.log.push("cb");
    setCallback(target, "save", "before", cb);
    skipCallback(target, "save", "before", cb);
    runCallbacks(target, "save");
    expect(target.log).toEqual([]);
  });

  it("skip string", () => {
    const calls: unknown[] = [];
    const klass = buildClass(":bar");
    Object.defineProperty(klass.prototype, "bar", { value: () => calls.push(klass) });
    expect(() => skipCallback(klass.prototype, "foo", "before", "bar")).toThrow(ArgumentError);
    new klass().run();
    expect(calls.length).toBe(1);
  });

  it("skip undefined callback", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", (t: any) => t.log.push("cb"));
    expect(() => skipCallback(target, "save", "before", ":qux")).toThrow(
      "Before save callback :qux has not been defined",
    );
    runCallbacks(target, "save");
    expect(target.log.length).toBe(1);
  });

  it("skip without raise", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", (t: any) => t.log.push("cb"));
    skipCallback(target, "save", "before", ":qux", { raise: false });
    runCallbacks(target, "save");
    expect(target.log.length).toBe(1);
  });
});

describe("NotSupportedStringConditionalTest", () => {
  it("string conditional options", () => {
    class Klass extends Record {}

    expect(() => Klass.beforeSave(":tweedle", { if: ["true"] })).toThrow(ArgumentError);
    expect(() => Klass.beforeSave(":tweedle", { if: "true" })).toThrow(ArgumentError);
    expect(() => Klass.afterSave(":tweedle", { unless: "false" })).toThrow(ArgumentError);
    expect(() =>
      skipCallback(Klass.prototype, "save", "before", ":tweedle", { if: "true" }),
    ).toThrow(ArgumentError);
    expect(() =>
      skipCallback(Klass.prototype, "save", "after", ":tweedle", { unless: "false" }),
    ).toThrow(ArgumentError);
  });
});

describe("AfterSaveConditionalPersonCallbackTest", () => {
  it("after save runs in the reverse order", () => {
    const history: string[] = [];
    const target = { history };
    defineCallbacks(target, "save");
    setCallback(target, "save", "after", (t: any) => {
      t.history.push("string1");
    });
    setCallback(target, "save", "after", (t: any) => {
      t.history.push("string2");
    });
    runCallbacks(target, "save");
    expect(target.history).toEqual(["string2", "string1"]);
  });
});

describe("custom terminator function", () => {
  it("custom terminator halts when it returns true", () => {
    const log: string[] = [];
    const target = { log };
    defineCallbacks(target, "save", {
      terminator: (_t, fn) => {
        const result = fn();
        return result === "halt";
      },
    });
    setCallback(target, "save", "before", () => "halt");
    setCallback(target, "save", "before", (t: any) => t.log.push("second"));
    runCallbacks(target, "save", () => log.push("block"));
    expect(log).not.toContain("second");
    expect(log).not.toContain("block");
  });

  it("custom terminator does not halt when it returns false", () => {
    const log: string[] = [];
    const target = { log };
    defineCallbacks(target, "save", {
      terminator: (_t, fn) => {
        fn();
        return false;
      },
    });
    setCallback(target, "save", "before", () => false);
    setCallback(target, "save", "before", (t: any) => t.log.push("second"));
    runCallbacks(target, "save", () => log.push("block"));
    expect(log).toContain("second");
    expect(log).toContain("block");
  });

  it("throws when an async before callback is registered with a custom terminator", () => {
    const t = {};
    defineCallbacks(t, "v", { terminator: (_t, fn) => fn() === "halt" });
    setCallback(t, "v", "before", async () => "halt");
    expect(() => runCallbacks(t, "v")).toThrow(/unsupported with a custom terminator/);
  });
});

describe("skipAfterCallbacksIfTerminated", () => {
  it("after callbacks run by default even when halted", () => {
    const log: string[] = [];
    const target = { log };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", () => kernelThrow(":abort"));
    setCallback(target, "save", "after", (t: any) => t.log.push("after"));
    const result = runCallbacks(target, "save");
    expect(result).toBe(false);
    expect(log).toContain("after");
  });

  it("skips after callbacks when halted and option is set", () => {
    const log: string[] = [];
    const target = { log };
    defineCallbacks(target, "save", { skipAfterCallbacksIfTerminated: true });
    setCallback(target, "save", "before", () => kernelThrow(":abort"));
    setCallback(target, "save", "after", (t: any) => t.log.push("after"));
    runCallbacks(target, "save");
    expect(log).not.toContain("after");
  });

  it("runs after callbacks when not halted even with option set", () => {
    const log: string[] = [];
    const target = { log };
    defineCallbacks(target, "save", { skipAfterCallbacksIfTerminated: true });
    setCallback(target, "save", "before", () => undefined);
    setCallback(target, "save", "after", (t: any) => t.log.push("after"));
    runCallbacks(target, "save");
    expect(log).toContain("after");
  });
});

describe("Callbacks — async propagation", () => {
  it("sync chain returns synchronously when no callback is async", () => {
    const t = { log: [] as string[] };
    defineCallbacks(t, "save");
    setCallback(t, "save", "before", (x: any) => x.log.push("b"));
    setCallback(t, "save", "after", (x: any) => x.log.push("a"));
    const r = runCallbacks(t, "save", () => {
      t.log.push("block");
      return true;
    });
    expect(r).toBe(true);
    expect(typeof (r as any)?.then).toBe("undefined");
    expect(t.log).toEqual(["b", "block", "a"]);
  });

  it("async before callback propagates Promise and preserves order", async () => {
    const t = { log: [] as string[] };
    defineCallbacks(t, "save");
    setCallback(t, "save", "before", async (x: any) => x.log.push("b1"));
    setCallback(t, "save", "before", (x: any) => x.log.push("b2"));
    setCallback(t, "save", "after", (x: any) => x.log.push("a"));
    const r = runCallbacks(t, "save", () => t.log.push("block"));
    expect(r).toBeInstanceOf(Promise);
    await r;
    expect(t.log).toEqual(["b1", "b2", "block", "a"]);
  });

  it("async after callback propagates Promise and runs in reverse order", async () => {
    const t = { log: [] as string[] };
    defineCallbacks(t, "save");
    setCallback(t, "save", "after", async (x: any) => x.log.push("a1"));
    setCallback(t, "save", "after", (x: any) => x.log.push("a2"));
    const r = runCallbacks(t, "save", () => t.log.push("block"));
    expect(r).toBeInstanceOf(Promise);
    await r;
    expect(t.log).toEqual(["block", "a2", "a1"]);
  });

  it("async around callback propagates Promise and runs after callbacks when complete", async () => {
    const t = { log: [] as string[] };
    defineCallbacks(t, "save");
    setCallback(t, "save", "after", (x: any) => x.log.push("after"));
    setCallback(t, "save", "around", async (x: any, next) => {
      x.log.push("ao");
      await next();
      x.log.push("ac");
    });
    const r = runCallbacks(t, "save", async () => t.log.push("block"));
    expect(r).toBeInstanceOf(Promise);
    await r;
    expect(t.log).toEqual(["ao", "block", "ac", "after"]);
  });

  it("awaited next() resolves to the async block result", async () => {
    const t = { result: null as unknown };
    defineCallbacks(t, "save");
    setCallback(t, "save", "around", async (x: any, next: any) => {
      x.result = await next();
    });
    await runCallbacks(t, "save", async () => "running");
    expect(t.result).toBe("running");
  });

  it("strict:sync throws on async callback", () => {
    const t = {};
    defineCallbacks(t, "v");
    setCallback(t, "v", "before", async () => {});
    expect(() => runCallbacks(t, "v", undefined, { strict: "sync" })).toThrow(/sync chain/);
  });
});

describe("CallbackObject dispatch", () => {
  const callbackObject = <T extends object>(methods: T & ThisType<T>): T =>
    Object.assign(new (class CallbackObject {})(), methods);
  it("before — calls the object's before method", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    const obj = callbackObject({ before: (t: typeof target) => t.log.push("before-obj") });
    setCallback(target, "save", "before", obj);
    runCallbacks(target, "save");
    expect(target.log).toEqual(["before-obj"]);
  });

  it("after — calls the object's after method", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    const obj = callbackObject({ after: (t: typeof target) => t.log.push("after-obj") });
    setCallback(target, "save", "after", obj);
    runCallbacks(target, "save");
    expect(target.log).toEqual(["after-obj"]);
  });

  it("around — calls the object's around method with target and proceed", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    const obj = callbackObject({
      around: (t: typeof target, next: () => void) => {
        t.log.push("around-pre");
        next();
        t.log.push("around-post");
      },
    });
    setCallback(target, "save", "around", obj);
    runCallbacks(target, "save", () => target.log.push("body"));
    expect(target.log).toEqual(["around-pre", "body", "around-post"]);
  });

  it("custom scope dispatches the kind+name method", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save", { scope: ["kind", "name"] });
    const obj = callbackObject({ beforeSave: (t: typeof target) => t.log.push("before-save-obj") });
    setCallback(target, "save", "before", obj);
    runCallbacks(target, "save");
    expect(target.log).toEqual(["before-save-obj"]);
  });

  it("missing scoped method raises when the chain runs", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", callbackObject({ beforeSave: () => {} }));
    expect(() => runCallbacks(target, "save")).toThrow(/before/);
  });

  it("object method called with correct this binding", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    const obj = callbackObject({
      label: "my-obj",
      before(t: typeof target) {
        t.log.push(this.label);
      },
    });
    setCallback(target, "save", "before", obj);
    runCallbacks(target, "save");
    expect(target.log).toEqual(["my-obj"]);
  });

  it("around object method reads object state via this", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    const obj = callbackObject({
      label: "around-obj",
      around(t: typeof target, next: () => void) {
        t.log.push(`${this.label}-pre`);
        next();
        t.log.push(`${this.label}-post`);
      },
    });
    setCallback(target, "save", "around", obj);
    runCallbacks(target, "save", () => target.log.push("body"));
    expect(target.log).toEqual(["around-obj-pre", "body", "around-obj-post"]);
  });

  it("mixed chain: function + object + function all run", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", (t: typeof target) => t.log.push("fn1"));
    setCallback(
      target,
      "save",
      "before",
      callbackObject({ before: (t: typeof target) => t.log.push("obj") }),
    );
    setCallback(target, "save", "before", (t: typeof target) => t.log.push("fn2"));
    runCallbacks(target, "save");
    expect(target.log).toEqual(["fn1", "obj", "fn2"]);
  });

  it("async object method — chain returns Promise", async () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    const obj = callbackObject({
      before: async (t: typeof target) => {
        await Promise.resolve();
        t.log.push("async-obj");
      },
    });
    setCallback(target, "save", "before", obj);
    const r = runCallbacks(target, "save");
    expect(r).toBeInstanceOf(Promise);
    await r;
    expect(target.log).toEqual(["async-obj"]);
  });

  it("CallbacksMixin.beforeCallback accepts object form", () => {
    class Model extends CallbacksMixin() {}
    Model.defineCallbacks("save");
    const log: string[] = [];
    Model.beforeCallback("save", callbackObject({ before: () => log.push("mixin-obj") }));
    const inst = new Model();
    (inst as any).runCallbacks("save");
    expect(log).toEqual(["mixin-obj"]);
  });

  it("CallbacksMixin.afterCallback accepts object form", () => {
    class Model extends CallbacksMixin() {}
    Model.defineCallbacks("save");
    const log: string[] = [];
    Model.afterCallback("save", { after: () => log.push("after-mixin") });
    const inst = new Model();
    (inst as any).runCallbacks("save");
    expect(log).toEqual(["after-mixin"]);
  });

  it("skipCallback removes object-form callback by original reference", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    const obj = { before: (t: typeof target) => t.log.push("obj") };
    setCallback(target, "save", "before", obj);
    setCallback(target, "save", "before", (t: typeof target) => t.log.push("fn"));
    skipCallback(target, "save", "before", obj);
    runCallbacks(target, "save");
    expect(target.log).toEqual(["fn"]);
  });

  it("skipCallback matches object by reference after chain inheritance clone", () => {
    const parent = { log: [] as string[] };
    defineCallbacks(parent, "save");
    const obj = { before: (t: typeof parent) => t.log.push("obj") };
    setCallback(parent, "save", "before", obj);

    const child = Object.create(parent) as typeof parent;
    skipCallback(child, "save", "before", obj);
    runCallbacks(child, "save");
    expect(child.log).toEqual([]);
  });

  it("CallbacksMixin.aroundCallback accepts object form", () => {
    class Model extends CallbacksMixin() {}
    Model.defineCallbacks("save");
    const log: string[] = [];
    Model.aroundCallback("save", {
      around: (_: unknown, next: () => void) => {
        log.push("pre");
        next();
        log.push("post");
      },
    });
    const inst = new Model();
    (inst as any).runCallbacks("save", () => log.push("body"));
    expect(log).toEqual(["pre", "body", "post"]);
  });
});
