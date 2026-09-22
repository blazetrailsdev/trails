import { kernelThrow } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import {
  Value,
  CallbackChain,
  Callback,
  defineCallbacks,
  setCallback,
  skipCallback,
  runCallbacks,
  resetCallbacks,
  CallbacksMixin,
  CallTemplate,
  ProcCall,
  MethodCall,
  ObjectCall,
} from "./callbacks.js";

describe("CallbackChain compile memoization (trails)", () => {
  const makeCallback = (name: string) => new Callback(name, () => {}, "before", {}, {});

  it("returns the same compiled sequence on repeated calls", () => {
    const chain = new CallbackChain("save");
    chain.append(makeCallback("a"));
    expect(chain.compile()).toBe(chain.compile());
  });

  it("rebuilds after append", () => {
    const chain = new CallbackChain("save");
    chain.append(makeCallback("a"));
    const first = chain.compile();
    chain.append(makeCallback("b"));
    expect(chain.compile()).not.toBe(first);
  });

  it("rebuilds after prepend", () => {
    const chain = new CallbackChain("save");
    chain.append(makeCallback("a"));
    const first = chain.compile();
    chain.prepend(makeCallback("b"));
    expect(chain.compile()).not.toBe(first);
  });

  it("rebuilds after insert", () => {
    const chain = new CallbackChain("save");
    chain.append(makeCallback("a"));
    const first = chain.compile();
    chain.insert(0, makeCallback("b"));
    expect(chain.compile()).not.toBe(first);
  });

  it("rebuilds after delete", () => {
    const chain = new CallbackChain("save");
    const cb = makeCallback("a");
    chain.append(cb);
    chain.append(makeCallback("b"));
    const first = chain.compile();
    chain.delete(cb);
    expect(chain.compile()).not.toBe(first);
  });

  it("rebuilds after remove", () => {
    const chain = new CallbackChain("save");
    chain.append(makeCallback("a"));
    const first = chain.compile();
    chain.remove("before");
    expect(chain.compile()).not.toBe(first);
  });

  it("rebuilds after clear", () => {
    const chain = new CallbackChain("save");
    chain.append(makeCallback("a"));
    const first = chain.compile();
    chain.clear();
    expect(chain.compile()).not.toBe(first);
  });
});

describe("setCallback type-omitted form (trails)", () => {
  it("defaults the callback type to before", () => {
    const target = {};
    defineCallbacks(target, "save");
    const ran: string[] = [];
    setCallback(target, "save", () => ran.push("filter"));
    runCallbacks(target, "save", () => ran.push("block"));
    expect(ran).toEqual(["filter", "block"]);
  });

  it("skipCallback defaults the callback type to before", () => {
    const target = {};
    defineCallbacks(target, "save");
    const ran: string[] = [];
    const filter = () => ran.push("filter");
    setCallback(target, "save", filter);
    skipCallback(target, "save", filter);
    runCallbacks(target, "save", () => ran.push("block"));
    expect(ran).toEqual(["block"]);
  });
});

describe("runCallbacks type argument (trails)", () => {
  class Target {}

  const build = (ran: string[]): Target => {
    const target = new Target();
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", () => {
      ran.push("before");
    });
    setCallback(target, "save", "after", () => {
      ran.push("after");
    });
    return target;
  };

  it("runs only the callbacks of the given type", () => {
    const ran: string[] = [];
    const target = build(ran);
    runCallbacks(target, "save", () => ran.push("block"), undefined, "before");
    expect(ran).toEqual(["before", "block"]);
  });

  it("runs the whole chain when no type is given", () => {
    const ran: string[] = [];
    const target = build(ran);
    runCallbacks(target, "save", () => ran.push("block"));
    expect(ran).toEqual(["before", "block", "after"]);
  });

  it("memoizes each type separately from the unfiltered sequence", () => {
    const ran: string[] = [];
    const target = build(ran);
    runCallbacks(target, "save", () => ran.push("block"), undefined, "after");
    runCallbacks(target, "save", () => ran.push("block"), undefined, "after");
    expect(ran).toEqual(["block", "after", "block", "after"]);
  });
});

describe("ProcCall", () => {
  it("falls back to the runtime target when no override target was given", () => {
    const calls: unknown[] = [];
    const target = (...args: unknown[]) => {
      calls.push(args);
      return true;
    };

    const template = new ProcCall(null);

    expect(template.expand(target, 1, null)).toEqual([target, null, "call", target, 1]);
    expect(template.makeLambda()(target, 1)).toBe(true);
    expect(template.invertedLambda()(target, 1)).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("prefers the override target over the runtime target", () => {
    const overrideTarget = () => true;
    const target = () => false;
    const template = new ProcCall(overrideTarget);

    expect(template.expand(target, 1, null)[0]).toBe(overrideTarget);
    expect(template.makeLambda()(target, 1)).toBe(true);
  });
});

describe("MethodCall", () => {
  it("raises NoMethodError when the target does not answer the method", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", ":iDontExist");

    expect(() => runCallbacks(target, "save")).toThrow(
      /undefined method 'iDontExist' for an instance of Object/,
    );
  });
});

describe("normalizeCallbackParams (trails)", () => {
  it("takes a trailing hash carrying a class as options, the way extract_options! does", () => {
    const log: string[] = [];
    const target = { log };
    defineCallbacks(target, "save");
    class MyValidator {}

    setCallback(target, "save", "before", () => log.push("ran"), {
      class: MyValidator,
      if: () => true,
    } as never);
    runCallbacks(target, "save");

    expect(log).toEqual(["ran"]);
  });
});

describe("MethodCall / ObjectCall forward the block (trails)", () => {
  const block = () => "yielded";

  it("hands a Symbol-named around callback its continuation", () => {
    const log: string[] = [];
    const target = {
      wrapIt(proceed: () => void) {
        log.push("around-before");
        proceed();
        log.push("around-after");
      },
    };
    defineCallbacks(target, "save");
    setCallback(target, "save", "around", ":wrapIt");

    runCallbacks(target, "save", () => log.push("block"));

    expect(log).toEqual(["around-before", "block", "around-after"]);
  });

  it("MethodCall#makeLambda sends the block, like target.send(@method_name, &block)", () => {
    let seen: unknown = null;
    const target = {
      m(b: unknown) {
        seen = b;
      },
    };

    new MethodCall("m").makeLambda()(target, undefined, block);

    expect(seen).toBe(block);
  });

  it("ObjectCall#makeLambda sends the block, like send(@method_name, target, &block)", () => {
    let seen: unknown = null;
    const receiver = {
      around(_target: object, b: unknown) {
        seen = b;
      },
    };

    new ObjectCall(receiver, "around").makeLambda()({}, undefined, block);

    expect(seen).toBe(block);
  });
});

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
