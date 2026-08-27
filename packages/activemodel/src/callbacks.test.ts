import { describe, it, expect } from "vitest";
import { runCallbacks, throwAbort } from "@blazetrails/activesupport";
import { Model } from "./index.js";
import { type CallbackConditions } from "./callbacks.js";

type GeneratedMacro<F> = (...args: Array<F | object | string | CallbackConditions>) => void;

interface GeneratedModelCallbacks {
  beforeSave: GeneratedMacro<GeneratedCallback>;
  afterSave: GeneratedMacro<GeneratedCallback>;
  aroundSave: GeneratedMacro<GeneratedAroundCallback>;
  beforeCreate: GeneratedMacro<GeneratedCallback>;
  afterCreate: GeneratedMacro<GeneratedCallback>;
  aroundCreate: GeneratedMacro<GeneratedAroundCallback>;
}

type GeneratedCallback = (record: Model) => unknown;
type GeneratedAroundCallback = (record: Model, proceed: () => void | Promise<void>) => unknown;

function generated(klass: typeof Model): GeneratedModelCallbacks {
  return klass as unknown as GeneratedModelCallbacks;
}

class Violin extends Model {
  static {
    this.defineModelCallbacks("create");
  }
  history: string[] = [];
  callback1(): void {
    this.history.push("callback1");
  }
  callback2(): void {
    this.history.push("callback2");
  }
  async create(): Promise<this> {
    await runCallbacks(this, "create", () => {});
    return this;
  }
}
describe("CallbacksTest", () => {
  it("after callbacks are not executed if the block returns false", async () => {
    class CallbackValidator {
      aroundCreate(model: any, proceed: () => void) {
        model.callbacks.push("before_around_create");
        proceed();
        model.callbacks.push("after_around_create");
        return false;
      }
    }
    class ModelCallbacks extends Model {
      callbacks: string[] = [];
      valid: boolean;
      static {
        this.defineModelCallbacks("create");
        generated(this).beforeCreate((m: any) => {
          m.callbacks.push("before_create");
        });
        generated(this).aroundCreate(new CallbackValidator());
        generated(this).afterCreate((m: any) => {
          m.callbacks.push("after_create");
          return false;
        });
        generated(this).afterCreate((m: any) => {
          m.callbacks.push("final_callback");
        });
      }
      constructor(options: { valid?: boolean } = {}) {
        super();
        this.valid = options.valid ?? true;
      }
      create() {
        return this.runCallbacks("create", () => {
          this.callbacks.push("create");
          return this.valid;
        });
      }
    }
    const model = new ModelCallbacks({ valid: false });
    await model.create();
    expect(model.callbacks).toEqual([
      "before_create",
      "before_around_create",
      "create",
      "after_around_create",
    ]);
  });

  it("only selects which types of callbacks should be created from an array list", async () => {
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
    await p.isValid();
    expect(log).toContain("before");
    expect(log).toContain("after");
  });

  it("no callbacks should be created", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "test" });
    expect(await p.isValid()).toBe(true);
  });

  it("after_create callbacks with both callbacks declared in different lines", async () => {
    class Violin2 extends Violin {
      static {
        generated(this).afterCreate(":callback1");
        generated(this).afterCreate(":callback2");
      }
    }
    expect((await new Violin2().create()).history).toEqual(["callback1", "callback2"]);
  });

  it("complete callback chain", async () => {
    const order: string[] = [];
    class Person extends Model {
      static {
        this.defineModelCallbacks("save");
        generated(this).beforeSave(() => {
          order.push("before_save");
        });
        generated(this).aroundSave(async (_r, proceed) => {
          order.push("around_before");
          await proceed();
          order.push("around_after");
        });
        generated(this).afterSave(() => {
          order.push("after_save");
        });
      }
    }
    await new Person().runCallbacks("save", () => {
      order.push("save");
    });
    expect(order).toEqual(["before_save", "around_before", "save", "around_after", "after_save"]);
  });

  it("the callback chain is halted when a callback throws :abort", () => {
    const order: string[] = [];
    class Person extends Model {
      static {
        this.defineModelCallbacks("save");
        generated(this).beforeSave(() => {
          order.push("first");
        });
        generated(this).beforeSave(() => {
          order.push("halt");
          throwAbort();
        });
        generated(this).beforeSave(() => {
          order.push("never");
        });
        generated(this).afterSave(() => {
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

  it("only selects which types of callbacks should be created", async () => {
    const order: string[] = [];
    class Person extends Model {
      static {
        this.defineModelCallbacks("create");
        generated(this).beforeCreate(() => {
          order.push("before_create");
        });
        generated(this).afterCreate(() => {
          order.push("after_create");
        });
      }
    }
    await new Person().runCallbacks("create", () => {
      order.push("create");
    });
    expect(order).toEqual(["before_create", "create", "after_create"]);
  });

  it("after_create callbacks with both callbacks declared in one line", async () => {
    class Violin1 extends Violin {
      static {
        generated(this).afterCreate(":callback1", ":callback2");
      }
    }
    expect((await new Violin1().create()).history).toEqual(["callback1", "callback2"]);
  });

  it("the callback chain is not halted when around or after callbacks return false", async () => {
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
    await p.isValid();
    expect(log).toEqual(["after1", "after2"]);
  });

  it("the :if option array should not be mutated by an after callback", async () => {
    const conditions = { if: (_r: any) => true };
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.afterValidation((_r: any) => {}, conditions);
      }
    }
    const p = new Person({ name: "Alice" });
    await p.isValid();
    expect(typeof conditions.if).toBe("function");
  });

  it("the callback chain is not halted when a before callback returns false)", async () => {
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
    await m.isValid();
    expect(log).toContain("before");
    expect(log).toContain("after");
  });
});
