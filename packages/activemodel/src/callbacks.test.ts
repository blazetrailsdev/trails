import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

describe("CallbacksTest", () => {
  it("after callbacks are not executed if the block returns false", () => {
    const log: string[] = [];
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.beforeValidation((_r: any) => {
          log.push("before");
          return false;
        });
        this.afterValidation((_r: any) => {
          log.push("after");
        });
      }
    }
    const p = new Person({ name: "Alice" });
    p.isValid();
    expect(log).toContain("before");
    expect(log).not.toContain("after");
  });

  it("only selects which types of callbacks should be created from an array list", () => {
    const log: string[] = [];
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.beforeValidation(() => {
          log.push("before");
        });
        this.afterValidation(() => {
          log.push("after");
        });
      }
    }
    const p = new Person({ name: "test" });
    p.isValid();
    expect(log).toContain("before");
    expect(log).toContain("after");
  });

  it("no callbacks should be created", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "test" });
    expect(p.isValid()).toBe(true);
  });

  it("after_create callbacks with both callbacks declared in different lines", () => {
    const log: string[] = [];
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.afterCreate(() => {
          log.push("first");
        });
        this.afterCreate(() => {
          log.push("second");
        });
      }
    }
    const p = new Person({ name: "test" });
    (p.constructor as typeof Model)._callbackChain.runAfter("create", p);
    expect(log).toEqual(["first", "second"]);
  });

  it("complete callback chain", () => {
    const order: string[] = [];
    class Person extends Model {
      static {
        this.beforeSave(() => {
          order.push("before_save");
        });
        this.aroundSave((_r, proceed) => {
          order.push("around_before");
          proceed();
          order.push("around_after");
        });
        this.afterSave(() => {
          order.push("after_save");
        });
      }
    }
    new Person().runCallbacks("save", () => {
      order.push("save");
    });
    expect(order).toEqual(["before_save", "around_before", "save", "around_after", "after_save"]);
  });

  it("the callback chain is halted when a callback throws :abort", () => {
    const order: string[] = [];
    class Person extends Model {
      static {
        this.beforeSave(() => {
          order.push("first");
        });
        this.beforeSave(() => {
          order.push("halt");
          return false;
        });
        this.beforeSave(() => {
          order.push("never");
        });
        this.afterSave(() => {
          order.push("after");
        });
      }
    }
    const result = new Person().runCallbacks("save", () => {
      order.push("action");
    });
    expect(result).toBe(false);
    expect(order).toContain("halt");
    expect(order).not.toContain("never");
    expect(order).not.toContain("action");
    expect(order).not.toContain("after");
  });

  it("only selects which types of callbacks should be created", () => {
    // Test that before/after/around create callbacks exist
    const order: string[] = [];
    class Person extends Model {
      static {
        this.beforeCreate(() => {
          order.push("before_create");
        });
        this.afterCreate(() => {
          order.push("after_create");
        });
      }
    }
    new Person().runCallbacks("create", () => {
      order.push("create");
    });
    expect(order).toEqual(["before_create", "create", "after_create"]);
  });

  it("after_create callbacks with both callbacks declared in one line", () => {
    const order: string[] = [];
    class Person extends Model {
      static {
        this.afterCreate(() => {
          order.push("first_after");
        });
        this.afterCreate(() => {
          order.push("second_after");
        });
      }
    }
    new Person().runCallbacks("create", () => {
      order.push("create");
    });
    expect(order).toEqual(["create", "first_after", "second_after"]);
  });

  it("the callback chain is not halted when around or after callbacks return false", () => {
    const log: string[] = [];
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.afterValidation((_r: any) => {
          log.push("after1");
          return false;
        });
        this.afterValidation((_r: any) => {
          log.push("after2");
        });
      }
    }
    const p = new Person({ name: "Alice" });
    p.isValid();
    expect(log).toEqual(["after1", "after2"]);
  });

  it("the :if option array should not be mutated by an after callback", () => {
    const conditions = { if: (_r: any) => true };
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.afterValidation((_r: any) => {}, conditions);
      }
    }
    const p = new Person({ name: "Alice" });
    p.isValid();
    expect(typeof conditions.if).toBe("function");
  });

  it("the callback chain is not halted when a before callback returns false)", () => {
    const log: string[] = [];
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
        this.beforeValidation(() => {
          log.push("before");
        });
        this.afterValidation(() => {
          log.push("after");
        });
      }
    }
    const m = new MyModel({ name: "test" });
    m.isValid();
    expect(log).toContain("before");
    expect(log).toContain("after");
  });
});

describe("CallbackChain.runAsync", () => {
  it("runs after callbacks only after the async block completes", async () => {
    const { CallbackChain } = await import("./callbacks.js");
    const chain = new CallbackChain();
    const log: string[] = [];
    chain.register("after", "save", () => {
      log.push("after");
    });
    await chain.runAsync("save", {}, async () => {
      log.push("block:start");
      await Promise.resolve();
      log.push("block:end");
    });
    expect(log).toEqual(["block:start", "block:end", "after"]);
  });

  it("returns false and skips block when before callback halts", async () => {
    const { CallbackChain } = await import("./callbacks.js");
    const chain = new CallbackChain();
    const log: string[] = [];
    chain.register("before", "save", () => {
      log.push("before");
      return false;
    });
    chain.register("after", "save", () => {
      log.push("after");
    });
    const result = await chain.runAsync("save", {}, async () => {
      log.push("block");
    });
    expect(result).toBe(false);
    expect(log).toEqual(["before"]);
  });

  it("around callbacks wrap the async block", async () => {
    const { CallbackChain } = await import("./callbacks.js");
    const chain = new CallbackChain();
    const log: string[] = [];
    chain.register("around", "save", async (_record: any, proceed: () => void | Promise<void>) => {
      log.push("around:before");
      await proceed();
      log.push("around:after");
    });
    chain.register("after", "save", () => {
      log.push("after");
    });
    await chain.runAsync("save", {}, async () => {
      log.push("block:start");
      await Promise.resolve();
      log.push("block:end");
    });
    expect(log).toEqual(["around:before", "block:start", "block:end", "around:after", "after"]);
  });

  it("sync around callback still waits for async block", async () => {
    const { CallbackChain } = await import("./callbacks.js");
    const chain = new CallbackChain();
    const log: string[] = [];
    chain.register("around", "save", (_record: any, proceed: () => void) => {
      log.push("around:before");
      proceed();
      log.push("around:after");
    });
    chain.register("after", "save", () => {
      log.push("after");
    });
    await chain.runAsync("save", {}, async () => {
      log.push("block:start");
      await Promise.resolve();
      log.push("block:end");
    });
    expect(log).toEqual(["around:before", "block:start", "around:after", "block:end", "after"]);
  });

  it("async before callback that resolves to false halts the chain", async () => {
    const { CallbackChain } = await import("./callbacks.js");
    const chain = new CallbackChain();
    const log: string[] = [];
    chain.register("before", "save", async () => {
      await Promise.resolve();
      log.push("before");
      return false;
    });
    chain.register("after", "save", () => {
      log.push("after");
    });
    const result = await chain.runAsync("save", {}, async () => {
      log.push("block");
    });
    expect(result).toBe(false);
    expect(log).toEqual(["before"]);
  });

  it("async after callbacks are awaited in order", async () => {
    const { CallbackChain } = await import("./callbacks.js");
    const chain = new CallbackChain();
    const log: string[] = [];
    chain.register("after", "save", async () => {
      await Promise.resolve();
      log.push("after1");
    });
    chain.register("after", "save", async () => {
      await Promise.resolve();
      log.push("after2");
    });
    await chain.runAsync("save", {}, async () => {
      log.push("block");
    });
    expect(log).toEqual(["block", "after1", "after2"]);
  });
});
