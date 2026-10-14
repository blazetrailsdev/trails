import { block, include, kernelThrow, rbObjSingletonClass } from "@blazetrails/ruby-compat";
import type { Extended, Included } from "@blazetrails/ruby-compat/include";
import { classAttribute } from "./class-attribute.js";
import { describe, it, expect } from "vitest";
import {
  Value,
  CallbackChain,
  Callback,
  Callbacks,
  CallTemplate,
  ProcCall,
  MethodCall,
  ObjectCall,
} from "./callbacks.js";

type ClassMethods = Extended<typeof Callbacks.ClassMethods>;
type RunCallbacks = Included<typeof Callbacks>["runCallbacks"];

class Model {
  declare static defineCallbacks: ClassMethods["defineCallbacks"];
  declare static setCallback: ClassMethods["setCallback"];
  declare static skipCallback: ClassMethods["skipCallback"];
  declare static resetCallbacks: ClassMethods["resetCallbacks"];
  declare static getCallbacks: (name: string) => CallbackChain;
  declare static __callbacks: { [name: string]: CallbackChain };
  declare static readonly descendants: (typeof Model)[];
  declare __callbacks: { [name: string]: CallbackChain };
  declare runCallbacks: RunCallbacks;

  static {
    include(this, Callbacks);
  }

  log: string[] = [];
}

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

describe("include ActiveSupport::Callbacks (trails)", () => {
  it("mixes in run_callbacks and extends ClassMethods, which stays off the instance", () => {
    class Record {
      declare static defineCallbacks: ClassMethods["defineCallbacks"];
      declare static setCallback: ClassMethods["setCallback"];
      declare runCallbacks: RunCallbacks;
    }
    include(Record, Callbacks);
    Record.defineCallbacks("save");
    const log: string[] = [];
    Record.setCallback("save", "before", () => log.push("before"));

    const record = new Record();
    record.runCallbacks("save", () => log.push("save"));

    expect(log).toEqual(["before", "save"]);
    expect("ClassMethods" in record).toBe(false);
    expect("ClassMethods" in Record).toBe(false);
  });

  it("does not reset the inherited __callbacks when a subclass of an includer includes it again", () => {
    class Parent {
      declare static defineCallbacks: ClassMethods["defineCallbacks"];
      declare static __callbacks: object;
    }
    include(Parent, Callbacks);
    Parent.defineCallbacks("save");
    const inherited = Parent.__callbacks;
    class Child extends Parent {}

    include(Child, Callbacks);

    expect(Child.__callbacks).toBe(inherited);
    expect(Object.keys(Child.__callbacks)).toEqual(["save"]);
    expect(Object.prototype.hasOwnProperty.call(Child, "__class_attr___callbacks")).toBe(false);
  });
});

describe("defineCallbacks generates _run<Name>Callbacks (trails)", () => {
  it("runs the named chain around the block", () => {
    class Record extends Model {}
    Record.defineCallbacks("save");
    Record.setCallback("save", "before", (r: Record) => {
      r.log.push("before");
    });
    const record = new Record() as Record & {
      _runSaveCallbacks(block?: () => unknown): unknown;
      _saveCallbacks: CallbackChain;
    };
    expect(record._saveCallbacks).toBe(
      (Record as unknown as { _saveCallbacks: unknown })._saveCallbacks,
    );

    expect(
      record._runSaveCallbacks(() => {
        record.log.push("block");
        return "saved";
      }),
    ).toBe("saved");
    expect(record.log).toEqual(["before", "block"]);
  });
});

describe("setCallback type-omitted form (trails)", () => {
  it("defaults the callback type to before", () => {
    class Target extends Model {}
    const target = new Target();
    Target.defineCallbacks("save");
    const ran: string[] = [];
    Target.setCallback("save", () => ran.push("filter"));
    target.runCallbacks("save", () => ran.push("block"));
    expect(ran).toEqual(["filter", "block"]);
  });

  it("skipCallback defaults the callback type to before", () => {
    class Target extends Model {}
    const target = new Target();
    Target.defineCallbacks("save");
    const ran: string[] = [];
    const filter = () => ran.push("filter");
    Target.setCallback("save", filter);
    Target.skipCallback("save", filter);
    target.runCallbacks("save", () => ran.push("block"));
    expect(ran).toEqual(["block"]);
  });
});

describe("runCallbacks type argument (trails)", () => {
  const build = (ran: string[]): Model => {
    class Target extends Model {}
    const target = new Target();
    Target.defineCallbacks("save");
    Target.setCallback("save", "before", () => {
      ran.push("before");
    });
    Target.setCallback("save", "after", () => {
      ran.push("after");
    });
    return target;
  };

  it("runs only the callbacks of the given type", () => {
    const ran: string[] = [];
    const target = build(ran);
    target.runCallbacks("save", () => ran.push("block"), undefined, "before");
    expect(ran).toEqual(["before", "block"]);
  });

  it("runs the whole chain when no type is given", () => {
    const ran: string[] = [];
    const target = build(ran);
    target.runCallbacks("save", () => ran.push("block"));
    expect(ran).toEqual(["before", "block", "after"]);
  });

  it("memoizes each type separately from the unfiltered sequence", () => {
    const ran: string[] = [];
    const target = build(ran);
    target.runCallbacks("save", () => ran.push("block"), undefined, "after");
    target.runCallbacks("save", () => ran.push("block"), undefined, "after");
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
    class Target extends Model {}
    const target = new Target();
    Target.defineCallbacks("save");
    Target.setCallback("save", "before", ":iDontExist");

    expect(() => target.runCallbacks("save")).toThrow(
      /undefined method 'iDontExist' for an instance of Target/,
    );
  });

  it("sends a condition naming an accessor property", () => {
    const history: string[] = [];
    class Target extends Model {
      skipRequested = false;
      record(): void {
        history.push("record");
      }
    }
    Target.defineCallbacks("save");
    Target.setCallback("save", "before", ":record", { unless: ":skipRequested" });

    const target = new Target();
    target.runCallbacks("save");
    target.skipRequested = true;
    target.runCallbacks("save");

    expect(history).toEqual(["record"]);
  });
});

describe("normalizeCallbackParams (trails)", () => {
  it("takes a trailing hash carrying a class as options, the way extract_options! does", () => {
    class Target extends Model {}
    const target = new Target();
    const log = target.log;
    Target.defineCallbacks("save");
    class MyValidator {}

    Target.setCallback("save", "before", () => log.push("ran"), {
      class: MyValidator,
      if: () => true,
    } as never);
    target.runCallbacks("save");

    expect(log).toEqual(["ran"]);
  });
});

describe("MethodCall / ObjectCall forward the block (trails)", () => {
  const block = () => "yielded";

  it("hands a Symbol-named around callback its continuation", () => {
    const log: string[] = [];
    class Target extends Model {
      wrapIt(proceed: () => void) {
        log.push("around-before");
        proceed();
        log.push("around-after");
      }
    }
    const target = new Target();
    Target.defineCallbacks("save");
    Target.setCallback("save", "around", ":wrapIt");

    target.runCallbacks("save", () => log.push("block"));

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
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "before", (t: any) => {
        t.log.push("before1");
      });
      Target.setCallback("save", "before", (t: any) => {
        t.log.push("before2");
      });

      target.runCallbacks("save", () => {
        target.log.push("block");
      });

      expect(target.log).toEqual(["before1", "before2", "block"]);
    });

    it("runs after callbacks in reverse order", () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "after", (t: any) => {
        t.log.push("after1");
      });
      Target.setCallback("save", "after", (t: any) => {
        t.log.push("after2");
      });

      target.runCallbacks("save", () => {
        target.log.push("block");
      });

      expect(target.log).toEqual(["block", "after2", "after1"]);
    });

    it("runs around callbacks wrapping the block", () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "around", (t: any, next: () => void) => {
        t.log.push("around-before");
        next();
        t.log.push("around-after");
      });

      target.runCallbacks("save", () => {
        target.log.push("block");
      });

      expect(target.log).toEqual(["around-before", "block", "around-after"]);
    });

    it("binds this to the record inside proc/block callbacks (Rails instance_exec)", () => {
      class Target extends Model {
        seen: unknown[] = [];
        beforeThis: unknown = null;
        afterThis: unknown = null;
        aroundThis: unknown = null;
        aroundArg: unknown = null;
      }
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "before", function (this: any, record: any) {
        target.beforeThis = this;
        target.seen.push(record);
      });
      Target.setCallback("save", "after", function (this: any) {
        target.afterThis = this;
      });
      Target.setCallback("save", "around", function (this: any, record: any, next: () => void) {
        target.aroundThis = this;
        target.aroundArg = record;
        next();
      });

      target.runCallbacks("save", () => {});

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
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "before", (t: any) => t.log.push("before"));
      Target.setCallback("save", "after", (t: any) => t.log.push("after"));
      Target.setCallback("save", "around", (t: any, next: () => void) => {
        t.log.push("around-pre");
        next();
        t.log.push("around-post");
      });

      target.runCallbacks("save", () => target.log.push("block"));

      expect(target.log).toEqual(["before", "around-pre", "block", "around-post", "after"]);
    });

    it("after registered after an around runs inside it", () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "around", (t: any, next: () => void) => {
        t.log.push("around-pre");
        next();
        t.log.push("around-post");
      });
      Target.setCallback("save", "after", (t: any) => t.log.push("after"));

      target.runCallbacks("save", () => target.log.push("block"));

      expect(target.log).toEqual(["around-pre", "block", "after", "around-post"]);
    });
  });

  describe("halting", () => {
    it("halts when a before callback throws the abort sentinel", () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "before", (t: any) => {
        t.log.push("before1");
        kernelThrow(":abort");
      });
      Target.setCallback("save", "before", (t: any) => {
        t.log.push("should-not-run");
      });

      const result = target.runCallbacks("save", () => {
        target.log.push("block");
      });

      expect(result).toBe(false);
      expect(target.log).toEqual(["before1"]);
    });

    it("propagates non-sentinel errors thrown by a before callback", () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "before", () => {
        throw new Error("boom");
      });
      Target.setCallback("save", "before", (t: any) => {
        t.log.push("should-not-run");
      });

      expect(() =>
        target.runCallbacks("save", () => {
          target.log.push("block");
        }),
      ).toThrow("boom");
      expect(target.log).toEqual([]);
    });

    it("halts when an async before callback rejects with the abort sentinel", async () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "before", async (t: any) => {
        t.log.push("before1");
        kernelThrow(":abort");
      });
      Target.setCallback("save", "before", (t: any) => {
        t.log.push("should-not-run");
      });

      const result = await target.runCallbacks("save", () => {
        target.log.push("block");
      });

      expect(result).toBe(false);
      expect(target.log).toEqual(["before1"]);
    });

    it("propagates a non-sentinel rejection from an async before callback", async () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "before", async () => {
        throw new Error("async-boom");
      });

      await expect(
        target.runCallbacks("save", () => {
          target.log.push("block");
        }),
      ).rejects.toThrow("async-boom");
      expect(target.log).toEqual([]);
    });

    it("does not swallow the abort sentinel when terminator is disabled", () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save", { terminator: false });
      Target.setCallback("save", "before", () => kernelThrow(":abort"));

      expect(() => target.runCallbacks("save", () => {})).toThrow();
    });

    it("does not swallow the abort sentinel for a custom terminator", () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save", {
        terminator: (_t: object, fn: () => unknown) => fn() === false,
      });
      Target.setCallback("save", "before", () => kernelThrow(":abort"));

      expect(() => target.runCallbacks("save", () => {})).toThrow();
    });

    it("does not halt when terminator is disabled", () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save", { terminator: false });
      Target.setCallback("save", "before", () => false);

      const result = target.runCallbacks("save", () => {
        target.log.push("block");
        return true;
      });

      expect(result).toBe(true);
      expect(target.log).toEqual(["block"]);
    });

    it("around callback can halt by not calling next", () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "around", (t: any) => {
        t.log.push("halted");
      });

      target.runCallbacks("save", () => {
        target.log.push("block");
      });

      expect(target.log).toEqual(["halted"]);
    });

    it("after callbacks are skipped when around does not yield", () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "around", (t: any) => {
        t.log.push("around");
      });
      Target.setCallback("save", "after", (t: any) => {
        t.log.push("after");
      });
      const result = target.runCallbacks("save", () => {
        target.log.push("block");
      });
      expect(result).toBeUndefined();
      expect(target.log).toEqual(["around"]);
    });

    it("fire-and-forget around does not swallow inner rejection", async () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "around", (_t: any, next: any) => {
        next();
      });
      await expect(
        target.runCallbacks("save", async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
    });

    it("fire-and-forget next().finally(...) does not swallow inner rejection", async () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "around", (_t: any, next: any) => {
        next().finally(() => {});
      });
      await expect(
        target.runCallbacks("save", async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
    });

    it("fire-and-forget next().catch() with no handler does not swallow rejection", async () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "around", (_t: any, next: any) => {
        next().catch();
      });
      await expect(
        target.runCallbacks("save", async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
    });

    it("awaited around can rescue inner rejection", async () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      let caught: Error | null = null;
      Target.setCallback("save", "around", async (_t: any, next: any) => {
        try {
          await next();
        } catch (e) {
          caught = e as Error;
        }
      });
      await target.runCallbacks("save", async () => {
        throw new Error("boom");
      });
      expect(caught!.message).toBe("boom");
    });
  });

  describe("conditional callbacks", () => {
    it("respects :if condition", () => {
      class Target extends Model {
        shouldRun = false;
      }
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "before", (t: any) => t.log.push("conditional"), {
        if: (t: Target) => t.shouldRun,
      });

      target.runCallbacks("save");
      expect(target.log).toEqual([]);

      target.shouldRun = true;
      target.runCallbacks("save");
      expect(target.log).toEqual(["conditional"]);
    });

    it("respects :unless condition", () => {
      class Target extends Model {
        skip = true;
      }
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "before", (t: any) => t.log.push("run"), {
        unless: (t: Target) => t.skip,
      });

      target.runCallbacks("save");
      expect(target.log).toEqual([]);

      target.skip = false;
      target.runCallbacks("save");
      expect(target.log).toEqual(["run"]);
    });

    it("supports array of :if conditions", () => {
      class Target extends Model {
        a = true;
        b = false;
      }
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "before", (t: any) => t.log.push("run"), {
        if: [(t: Target) => t.a, (t: Target) => t.b],
      });

      target.runCallbacks("save");
      expect(target.log).toEqual([]);

      target.b = true;
      target.runCallbacks("save");
      expect(target.log).toEqual(["run"]);
    });

    it("forwards the block's return value (env.value) to after-callback conditions", () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "after", (t: any) => t.log.push("after"), {
        unless: new Value((value) => value === false),
      });

      target.runCallbacks("save", () => false);
      expect(target.log).toEqual([]);

      target.runCallbacks("save", () => "ok");
      expect(target.log).toEqual(["after"]);
    });
  });

  describe("prepend", () => {
    it("prepends callback to front of chain", () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "before", (t: any) => t.log.push("first"));
      Target.setCallback("save", "before", (t: any) => t.log.push("prepended"), {
        prepend: true,
      });

      target.runCallbacks("save");
      expect(target.log).toEqual(["prepended", "first"]);
    });
  });

  describe("skipCallback", () => {
    it("removes a specific callback", () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      const cb = (t: any) => t.log.push("skipped");
      Target.setCallback("save", "before", cb);
      Target.setCallback("save", "before", (t: any) => t.log.push("kept"));

      Target.skipCallback("save", "before", cb);
      target.runCallbacks("save");
      expect(target.log).toEqual(["kept"]);
    });
  });

  describe("resetCallbacks", () => {
    it("removes all callbacks from a chain", () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "before", (t: any) => t.log.push("a"));
      Target.setCallback("save", "after", (t: any) => t.log.push("b"));

      Target.resetCallbacks("save");
      target.runCallbacks("save", () => target.log.push("block"));
      expect(target.log).toEqual(["block"]);
    });
  });

  describe("error handling", () => {
    it("runCallbacks on a chain that was never defined raises as Rails' nil chain does", () => {
      class Target extends Model {}
      const target = new Target();
      const log: string[] = [];
      expect(() => target.runCallbacks("nonexistent", () => log.push("ran"))).toThrow(TypeError);
      expect(log).toEqual([]);
    });
  });

  describe("no block", () => {
    it("works without a block", () => {
      class Target extends Model {}
      const target = new Target();
      Target.defineCallbacks("save");
      Target.setCallback("save", "before", (t: any) => t.log.push("before"));
      Target.setCallback("save", "after", (t: any) => t.log.push("after"));

      target.runCallbacks("save");
      expect(target.log).toEqual(["before", "after"]);
    });
  });
});

describe("custom terminator function", () => {
  it("custom terminator halts when it returns true", () => {
    class Target extends Model {}
    const target = new Target();
    const log = target.log;
    Target.defineCallbacks("save", {
      terminator: (_t: object, fn: () => unknown) => {
        const result = fn();
        return result === "halt";
      },
    });
    Target.setCallback("save", "before", () => "halt");
    Target.setCallback("save", "before", (t: any) => t.log.push("second"));
    target.runCallbacks("save", () => log.push("block"));
    expect(log).not.toContain("second");
    expect(log).not.toContain("block");
  });

  it("custom terminator does not halt when it returns false", () => {
    class Target extends Model {}
    const target = new Target();
    const log = target.log;
    Target.defineCallbacks("save", {
      terminator: (_t: object, fn: () => unknown) => {
        fn();
        return false;
      },
    });
    Target.setCallback("save", "before", () => false);
    Target.setCallback("save", "before", (t: any) => t.log.push("second"));
    target.runCallbacks("save", () => log.push("block"));
    expect(log).toContain("second");
    expect(log).toContain("block");
  });

  it("throws when an async before callback is registered with a custom terminator", () => {
    class Target extends Model {}
    const t = new Target();
    Target.defineCallbacks("v", { terminator: (_t: object, fn: () => unknown) => fn() === "halt" });
    Target.setCallback("v", "before", async () => "halt");
    expect(() => t.runCallbacks("v")).toThrow(/unsupported with a custom terminator/);
  });
});

describe("skipAfterCallbacksIfTerminated", () => {
  it("after callbacks run by default even when halted", () => {
    class Target extends Model {}
    const target = new Target();
    const log = target.log;
    Target.defineCallbacks("save");
    Target.setCallback("save", "before", () => kernelThrow(":abort"));
    Target.setCallback("save", "after", (t: any) => t.log.push("after"));
    const result = target.runCallbacks("save");
    expect(result).toBe(false);
    expect(log).toContain("after");
  });

  it("skips after callbacks when halted and option is set", () => {
    class Target extends Model {}
    const target = new Target();
    const log = target.log;
    Target.defineCallbacks("save", { skipAfterCallbacksIfTerminated: true });
    Target.setCallback("save", "before", () => kernelThrow(":abort"));
    Target.setCallback("save", "after", (t: any) => t.log.push("after"));
    target.runCallbacks("save");
    expect(log).not.toContain("after");
  });

  it("runs after callbacks when not halted even with option set", () => {
    class Target extends Model {}
    const target = new Target();
    const log = target.log;
    Target.defineCallbacks("save", { skipAfterCallbacksIfTerminated: true });
    Target.setCallback("save", "before", () => undefined);
    Target.setCallback("save", "after", (t: any) => t.log.push("after"));
    target.runCallbacks("save");
    expect(log).toContain("after");
  });
});

describe("Callbacks — async propagation", () => {
  it("sync chain returns synchronously when no callback is async", () => {
    class Target extends Model {}
    const t = new Target();
    Target.defineCallbacks("save");
    Target.setCallback("save", "before", (x: any) => x.log.push("b"));
    Target.setCallback("save", "after", (x: any) => x.log.push("a"));
    const r = t.runCallbacks("save", () => {
      t.log.push("block");
      return true;
    });
    expect(r).toBe(true);
    expect(typeof (r as any)?.then).toBe("undefined");
    expect(t.log).toEqual(["b", "block", "a"]);
  });

  it("async before callback propagates Promise and preserves order", async () => {
    class Target extends Model {}
    const t = new Target();
    Target.defineCallbacks("save");
    Target.setCallback("save", "before", async (x: any) => x.log.push("b1"));
    Target.setCallback("save", "before", (x: any) => x.log.push("b2"));
    Target.setCallback("save", "after", (x: any) => x.log.push("a"));
    const r = t.runCallbacks("save", () => t.log.push("block"));
    expect(r).toBeInstanceOf(Promise);
    await r;
    expect(t.log).toEqual(["b1", "b2", "block", "a"]);
  });

  it("async after callback propagates Promise and runs in reverse order", async () => {
    class Target extends Model {}
    const t = new Target();
    Target.defineCallbacks("save");
    Target.setCallback("save", "after", async (x: any) => x.log.push("a1"));
    Target.setCallback("save", "after", (x: any) => x.log.push("a2"));
    const r = t.runCallbacks("save", () => t.log.push("block"));
    expect(r).toBeInstanceOf(Promise);
    await r;
    expect(t.log).toEqual(["block", "a2", "a1"]);
  });

  it("async around callback propagates Promise and runs after callbacks when complete", async () => {
    class Target extends Model {}
    const t = new Target();
    Target.defineCallbacks("save");
    Target.setCallback("save", "after", (x: any) => x.log.push("after"));
    Target.setCallback("save", "around", async (x: any, next: any) => {
      x.log.push("ao");
      await next();
      x.log.push("ac");
    });
    const r = t.runCallbacks("save", async () => t.log.push("block"));
    expect(r).toBeInstanceOf(Promise);
    await r;
    expect(t.log).toEqual(["ao", "block", "ac", "after"]);
  });

  it("around callbacks that call their block after an await each run the nested sequence once", async () => {
    class Target extends Model {}
    const t = new Target();
    Target.defineCallbacks("save");
    Target.setCallback("save", "around", async (x: any, next: any) => {
      await Promise.resolve();
      x.log.push("outer");
      await next();
      x.log.push("/outer");
    });
    Target.setCallback("save", "around", async (x: any, next: any) => {
      await Promise.resolve();
      x.log.push("inner");
      await next();
      x.log.push("/inner");
    });
    await t.runCallbacks("save", () => t.log.push("block"));
    expect(t.log).toEqual(["outer", "inner", "block", "/inner", "/outer"]);
  });

  it("a sync around callback that calls its block twice runs the nested sequence both times", () => {
    class Target extends Model {}
    const t = new Target();
    Target.defineCallbacks("save");
    Target.setCallback("save", "around", (_x: any, next: any) => {
      next();
      next();
    });
    Target.setCallback("save", "around", (x: any, next: any) => {
      x.log.push("inner");
      next();
    });
    t.runCallbacks("save", () => t.log.push("block"));
    expect(t.log).toEqual(["inner", "block", "inner", "block"]);
  });

  it("a chain with no around callback awaits an async before and an async block in order", async () => {
    class Target extends Model {}
    const t = new Target();
    Target.defineCallbacks("save");
    Target.setCallback("save", "before", async (x: any) => {
      await Promise.resolve();
      x.log.push("before");
    });
    Target.setCallback("save", "after", (x: any) => x.log.push("after"));
    const r = t.runCallbacks("save", async () => {
      await Promise.resolve();
      t.log.push("block");
      return "value";
    });
    expect(r).toBeInstanceOf(Promise);
    expect(await r).toBe("value");
    expect(t.log).toEqual(["before", "block", "after"]);
  });

  it("awaited next() resolves to the async block result", async () => {
    class Target extends Model {
      result = null as unknown;
    }
    const t = new Target();
    Target.defineCallbacks("save");
    Target.setCallback("save", "around", async (x: any, next: any) => {
      x.result = await next();
    });
    await t.runCallbacks("save", async () => "running");
    expect(t.result).toBe("running");
  });

  it("strict:sync throws on async callback", () => {
    class Target extends Model {}
    const t = new Target();
    Target.defineCallbacks("v");
    Target.setCallback("v", "before", async () => {});
    expect(() => t.runCallbacks("v", undefined, { strict: "sync" })).toThrow(/sync chain/);
  });

  it("strict:sync throws on a promise-returning custom terminator", async () => {
    class Target extends Model {}
    const t = new Target();
    Target.defineCallbacks("v", {
      terminator: async (_t: object, fn: () => unknown) => {
        fn();
        throw new Error("rejected halt");
      },
    });
    Target.setCallback("v", "before", (x: any) => x.log.push("first"));
    Target.setCallback("v", "before", (x: any) => x.log.push("second"));
    expect(() => t.runCallbacks("v", undefined, { strict: "sync" })).toThrow(
      'Async callback on sync chain "v" — before returned a Promise',
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(t.log).toEqual(["first"]);
  });

  it("a promise-returning custom terminator is awaited without strict:sync", async () => {
    class Target extends Model {}
    const t = new Target();
    Target.defineCallbacks("v", {
      terminator: async (_t: object, fn: () => unknown) => fn() === false,
    });
    Target.setCallback("v", "before", (x: any) => {
      x.log.push("first");
      return false;
    });
    Target.setCallback("v", "before", (x: any) => x.log.push("second"));
    await t.runCallbacks("v");
    expect(t.log).toEqual(["first"]);
  });
});

describe("CallbackObject dispatch", () => {
  const callbackObject = <T extends object>(methods: T & ThisType<T>): T =>
    Object.assign(new (class CallbackObject {})(), methods);
  it("before — calls the object's before method", () => {
    class Target extends Model {}
    const target = new Target();
    Target.defineCallbacks("save");
    const obj = callbackObject({ before: (t: typeof target) => t.log.push("before-obj") });
    Target.setCallback("save", "before", obj);
    target.runCallbacks("save");
    expect(target.log).toEqual(["before-obj"]);
  });

  it("after — calls the object's after method", () => {
    class Target extends Model {}
    const target = new Target();
    Target.defineCallbacks("save");
    const obj = callbackObject({ after: (t: typeof target) => t.log.push("after-obj") });
    Target.setCallback("save", "after", obj);
    target.runCallbacks("save");
    expect(target.log).toEqual(["after-obj"]);
  });

  it("around — calls the object's around method with target and proceed", () => {
    class Target extends Model {}
    const target = new Target();
    Target.defineCallbacks("save");
    const obj = callbackObject({
      around: (t: typeof target, next: () => void) => {
        t.log.push("around-pre");
        next();
        t.log.push("around-post");
      },
    });
    Target.setCallback("save", "around", obj);
    target.runCallbacks("save", () => target.log.push("body"));
    expect(target.log).toEqual(["around-pre", "body", "around-post"]);
  });

  it("custom scope dispatches the kind+name method", () => {
    class Target extends Model {}
    const target = new Target();
    Target.defineCallbacks("save", { scope: ["kind", "name"] });
    const obj = callbackObject({ beforeSave: (t: typeof target) => t.log.push("before-save-obj") });
    Target.setCallback("save", "before", obj);
    target.runCallbacks("save");
    expect(target.log).toEqual(["before-save-obj"]);
  });

  it("missing scoped method raises when the chain runs", () => {
    class Target extends Model {}
    const target = new Target();
    Target.defineCallbacks("save");
    Target.setCallback("save", "before", callbackObject({ beforeSave: () => {} }));
    expect(() => target.runCallbacks("save")).toThrow(/before/);
  });

  it("object method called with correct this binding", () => {
    class Target extends Model {}
    const target = new Target();
    Target.defineCallbacks("save");
    const obj = callbackObject({
      label: "my-obj",
      before(t: typeof target) {
        t.log.push(this.label);
      },
    });
    Target.setCallback("save", "before", obj);
    target.runCallbacks("save");
    expect(target.log).toEqual(["my-obj"]);
  });

  it("around object method reads object state via this", () => {
    class Target extends Model {}
    const target = new Target();
    Target.defineCallbacks("save");
    const obj = callbackObject({
      label: "around-obj",
      around(t: typeof target, next: () => void) {
        t.log.push(`${this.label}-pre`);
        next();
        t.log.push(`${this.label}-post`);
      },
    });
    Target.setCallback("save", "around", obj);
    target.runCallbacks("save", () => target.log.push("body"));
    expect(target.log).toEqual(["around-obj-pre", "body", "around-obj-post"]);
  });

  it("mixed chain: function + object + function all run", () => {
    class Target extends Model {}
    const target = new Target();
    Target.defineCallbacks("save");
    Target.setCallback("save", "before", (t: typeof target) => t.log.push("fn1"));
    Target.setCallback(
      "save",
      "before",
      callbackObject({ before: (t: typeof target) => t.log.push("obj") }),
    );
    Target.setCallback("save", "before", (t: typeof target) => t.log.push("fn2"));
    target.runCallbacks("save");
    expect(target.log).toEqual(["fn1", "obj", "fn2"]);
  });

  it("async object method — chain returns Promise", async () => {
    class Target extends Model {}
    const target = new Target();
    Target.defineCallbacks("save");
    const obj = callbackObject({
      before: async (t: typeof target) => {
        await Promise.resolve();
        t.log.push("async-obj");
      },
    });
    Target.setCallback("save", "before", obj);
    const r = target.runCallbacks("save");
    expect(r).toBeInstanceOf(Promise);
    await r;
    expect(target.log).toEqual(["async-obj"]);
  });

  it("skipCallback removes object-form callback by original reference", () => {
    class Target extends Model {}
    const target = new Target();
    Target.defineCallbacks("save");
    const obj = { before: (t: typeof target) => t.log.push("obj") };
    Target.setCallback("save", "before", obj);
    Target.setCallback("save", "before", (t: typeof target) => t.log.push("fn"));
    Target.skipCallback("save", "before", obj);
    target.runCallbacks("save");
    expect(target.log).toEqual(["fn"]);
  });

  it("skipCallback matches object by reference after chain inheritance clone", () => {
    class Parent extends Model {}
    Parent.defineCallbacks("save");
    const obj = { before: (t: Parent) => t.log.push("obj") };
    Parent.setCallback("save", "before", obj);

    class Child extends Parent {}
    Child.skipCallback("save", "before", obj);
    const child = new Child();
    child.runCallbacks("save");
    expect(child.log).toEqual([]);
  });

  it("a callback set on a parent reaches a grandchild whose middle class never wrote", () => {
    class Parent extends Model {
      declare static _saveCallbacks: CallbackChain;
      declare _saveCallbacks: CallbackChain;
      declare _runSaveCallbacks: (block?: () => unknown) => unknown;
    }
    Parent.defineCallbacks("save");
    class Middle extends Parent {}
    class Grandchild extends Middle {}
    Grandchild.setCallback("save", "before", (t: Parent) => t.log.push("grandchild"));

    Parent.setCallback("save", "before", (t: Parent) => t.log.push("parent"));

    const record = new Grandchild();
    record._runSaveCallbacks();
    expect(record.log).toEqual(["grandchild", "parent"]);
    expect(Parent.descendants).toEqual([Middle, Grandchild]);
    expect(record._saveCallbacks).toBe(Grandchild._saveCallbacks);
    expect(new Middle().log).toEqual([]);
  });

  it("setCallback on a chain that was never defined raises as Rails' nil chain does", () => {
    class Record extends Model {}
    expect(() => Record.setCallback("save", "before", () => {})).toThrow(TypeError);
  });

  it("a class attribute on a singleton class seats the delegators on its attached object", () => {
    const object = {} as { settings?: unknown };
    const singleton = rbObjSingletonClass(object) as any;
    classAttribute.call(singleton, "settings", { instanceWriter: false, default: 1 });
    expect(singleton.settings).toBe(1);
    expect(object.settings).toBeUndefined();
    singleton.settings = 2;
    expect(singleton.settings).toBe(2);
    expect(object.settings).toBeUndefined();
  });

  it("a callback set on a parent after a child wrote its own chain reaches the child", () => {
    class Parent extends Model {}
    Parent.defineCallbacks("save");
    class Child extends Parent {}
    Child.setCallback("save", "before", (t: Parent) => t.log.push("child"));

    Parent.setCallback("save", "before", (t: Parent) => t.log.push("parent"));

    const record = new Child();
    record.runCallbacks("save");
    expect(record.log).toEqual(["child", "parent"]);
    expect(Object.keys(Child.__callbacks)).toEqual(["save"]);
    expect(Child.__callbacks).not.toBe(Parent.__callbacks);
    expect(Parent.descendants).toEqual([Child]);
    expect(new Parent().__callbacks).toBe(Parent.__callbacks);

    Parent.resetCallbacks("save");
    expect(Child.getCallbacks("save").entries.map((c: Callback) => c.kind)).toEqual(["before"]);
    expect(Parent.getCallbacks("save").isEmpty).toBe(true);
  });
});

describe("setCallback with a block (trails)", () => {
  it("puts the block ahead of the positional filters, after the options", () => {
    class Target extends Model {
      ran: string[] = [];
      named() {
        this.ran.push("named");
      }
      on = true;
    }
    const target = new Target();
    Target.defineCallbacks("save");
    Target.setCallback(
      "save",
      "before",
      ":named",
      { if: (t: typeof target) => t.on },
      block(function (this: typeof target) {
        this.ran.push("block");
      }),
    );
    target.runCallbacks("save");
    expect(target.ran).toEqual(["block", "named"]);

    target.ran = [];
    target.on = false;
    target.runCallbacks("save");
    expect(target.ran).toEqual([]);
  });

  it("types run_callbacks as an instance method, not a property of the module object", () => {
    // @ts-expect-error run_callbacks is an instance method (callbacks.rb:97)
    expect(Callbacks.runCallbacks).toBeUndefined();
    expect(Callbacks.instanceMethods()).toContain("runCallbacks");
  });
});
