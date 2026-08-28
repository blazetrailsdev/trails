/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import {
  Callbacks as ASCallbacks,
  extend,
  runCallbacks,
  throwAbort,
  withOptions,
  include,
} from "@blazetrails/activesupport";
import { Model } from "./index.js";
import { Callbacks as ValidationsCallbacks } from "./validations/callbacks.js";
import { Callbacks, type CallbackConditions, defineModelCallbacks } from "./callbacks.js";
import { NoMethodError } from "./attribute-assignment.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";

describe("defineModelCallbacks", () => {
  it("raises NoMethodError for an only: entry with no generator", () => {
    class Topic extends Model {}

    expect(() =>
      (Topic as unknown as { defineModelCallbacks(...a: unknown[]): void }).defineModelCallbacks(
        "create",
        { only: ["bogus"] },
      ),
    ).toThrow(NoMethodError);
  });
});

describe("Callbacks.extended", () => {
  it("installs ActiveSupport::Callbacks on the extending class", () => {
    class Topic {}
    extend(Topic, Callbacks);

    const topic = Topic as unknown as {
      defineModelCallbacks(...a: unknown[]): void;
      beforeSave(fn: () => void): void;
      setCallback: unknown;
      prototype: { runCallbacks: unknown };
    };
    expect(typeof topic.setCallback).toBe("function");
    expect(typeof topic.prototype.runCallbacks).toBe("function");

    const order: string[] = [];
    topic.defineModelCallbacks("save");
    topic.beforeSave(() => order.push("before"));

    const record = new Topic() as unknown as {
      runCallbacks(event: string, fn: () => void): void;
    };
    record.runCallbacks("save", () => order.push("body"));
    expect(order).toEqual(["before", "body"]);
  });
});

function modelWith(...events: string[]): any {
  class Klass {}
  extend(Klass, ASCallbacks.ClassMethods);
  (defineModelCallbacks as (this: unknown, ...a: string[]) => void).apply(Klass, events);
  return Klass;
}

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

describe("define_model_callbacks only: and callback objects", () => {
  it("define_model_callbacks with only option limits timing types", () => {
    class Job extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        this.defineModelCallbacks("process", { only: ["before", "after"] });
      }
    }
    expect(typeof (Job as any).beforeProcess).toBe("function");
    expect(typeof (Job as any).afterProcess).toBe("function");
    expect((Job as any).aroundProcess).toBeUndefined();
  });

  it("define_model_callbacks with only: ['before'] creates only before", () => {
    class Task extends Model {
      static {
        this.defineModelCallbacks("execute", { only: ["before"] });
      }
    }
    expect(typeof (Task as any).beforeExecute).toBe("function");
    expect((Task as any).afterExecute).toBeUndefined();
    expect((Task as any).aroundExecute).toBeUndefined();
  });

  it("class-based callback object with before method", async () => {
    const log: string[] = [];
    const auditor = {
      beforeValidation(record: any) {
        log.push(`auditing ${record._readAttribute("name")}`);
      },
    };
    class Person extends Model {
      declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
      declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, ValidationsCallbacks);
        include(this, Attributes);
        this.attribute("name", "string");
        this.beforeValidation(auditor);
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    await p.isValid();
    expect(log).toContain("auditing Alice");
  });

  it("class-based callback object with snake_case method", async () => {
    const log: string[] = [];
    const auditor = {
      beforeValidation(record: any) {
        log.push("camelCase called");
      },
    };
    class Person extends Model {
      declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
      declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, ValidationsCallbacks);
        include(this, Attributes);
        this.attribute("name", "string");
        this.beforeValidation(auditor);
      }
    }
    interface Person extends Attributes {}

    await new Person({ name: "test" }).isValid();
    expect(log).toContain("camelCase called");
  });

  it("class-based around callback object with proceed", async () => {
    const log: string[] = [];
    const wrapper = {
      aroundSave(record: any, proceed: () => void) {
        log.push("around_before");
        proceed();
        log.push("around_after");
      },
    };
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.defineModelCallbacks("save");
        this.attribute("name", "string");
        generated(this).aroundSave(wrapper);
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "test" });
    await p.runCallbacks("save", () => {
      log.push("save");
    });
    expect(log).toEqual(["around_before", "save", "around_after"]);
  });

  it("class-based callback via defineModelCallbacks-generated methods", async () => {
    const log: string[] = [];
    const observer = {
      beforeProcess(record: any) {
        log.push(`processing ${record._readAttribute("name")}`);
      },
    };
    class Job extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.defineModelCallbacks("process");
        (this as any).beforeProcess(observer);
      }
    }
    interface Job extends Attributes {}

    const j = new Job({ name: "import" });
    await j.runCallbacks("process", () => {
      log.push("executed");
    });
    expect(log).toEqual(["processing import", "executed"]);
  });
});

describe("CallbackChain.run", () => {
  it("runs after callbacks only after the block completes", async () => {
    const Klass = modelWith("save");
    const log: string[] = [];
    Klass.afterSave(() => {
      log.push("after");
    });
    await runCallbacks(new Klass(), "save", () => {
      log.push("block:start");
      log.push("block:end");
    });
    expect(log).toEqual(["block:start", "block:end", "after"]);
  });

  it("around callbacks wrap the block", async () => {
    const Klass = modelWith("save");
    const log: string[] = [];
    Klass.aroundSave((_record: any, proceed: () => void) => {
      log.push("around:before");
      proceed();
      log.push("around:after");
    });
    Klass.afterSave(() => {
      log.push("after");
    });
    await runCallbacks(new Klass(), "save", () => {
      log.push("block");
    });
    expect(log).toEqual(["around:before", "block", "around:after", "after"]);
  });

  it("after callbacks run in registration order", async () => {
    const Klass = modelWith("save");
    const log: string[] = [];
    Klass.afterSave(() => {
      log.push("after1");
    });
    Klass.afterSave(() => {
      log.push("after2");
    });
    await runCallbacks(new Klass(), "save", () => {
      log.push("block");
    });
    expect(log).toEqual(["block", "after1", "after2"]);
  });
});

describe("Generic Model.setCallback / skipCallback / resetCallbacks (Rails fidelity)", () => {
  it("setCallback registers a function for arbitrary event + timing", async () => {
    const log: string[] = [];
    class Thing extends Model {
      static {
        this.defineModelCallbacks("save");
      }
    }
    Thing.setCallback("save", "before", () => log.push("before"));
    Thing.setCallback("save", "after", () => log.push("after"));
    await new Thing().runCallbacks("save", () => log.push("block"));
    expect(log).toEqual(["before", "block", "after"]);
  });

  it("skipCallback removes a previously registered callback by reference", async () => {
    const log: string[] = [];
    class Thing extends Model {
      static {
        this.defineModelCallbacks("save");
      }
    }
    const cb = () => log.push("skipped-callback");
    Thing.setCallback("save", "before", cb);
    Thing.setCallback("save", "before", () => log.push("kept"));

    Thing.skipCallback("save", "before", cb);
    await new Thing().runCallbacks("save", () => log.push("block"));
    expect(log).toEqual(["kept", "block"]);
  });

  it("skipCallback raises on miss unless raise: false", () => {
    class Thing extends Model {
      static {
        this.defineModelCallbacks("save");
      }
    }
    expect(() => Thing.skipCallback("save", "before", () => undefined)).toThrow(
      /^Before save callback .* has not been defined$/,
    );
    expect(() =>
      Thing.skipCallback("save", "before", () => undefined, { raise: false }),
    ).not.toThrow();
  });

  it("resetCallbacks clears all callbacks for an event", async () => {
    const log: string[] = [];
    class Thing extends Model {
      static {
        this.defineModelCallbacks("save", "update");
      }
    }
    Thing.setCallback("save", "before", () => log.push("before"));
    Thing.setCallback("save", "after", () => log.push("after"));
    Thing.setCallback("update", "before", () => log.push("update-before"));

    Thing.resetCallbacks("save");
    await new Thing().runCallbacks("save", () => log.push("save-block"));
    await new Thing().runCallbacks("update", () => log.push("update-block"));
    expect(log).toEqual(["save-block", "update-before", "update-block"]);
  });

  it("setCallback on subclass does not leak up to parent (copy-on-first-write)", async () => {
    const log: string[] = [];
    class Parent extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        this.defineModelCallbacks("save");
      }
    }
    class Child extends Parent {}
    Child.setCallback("save", "before", () => log.push("child"));
    await new Parent().runCallbacks("save", () => log.push("parent-block"));
    expect(log).toEqual(["parent-block"]);
    await new Child().runCallbacks("save", () => log.push("child-block"));
    expect(log).toEqual(["parent-block", "child", "child-block"]);
  });

  it("skipCallback miss does NOT isolate subclass from future parent callbacks", async () => {
    const log: string[] = [];
    class Parent extends Model {
      static {
        this.defineModelCallbacks("save");
      }
    }
    class Child extends Parent {}
    Child.skipCallback("save", "before", () => undefined, { raise: false });
    Parent.setCallback("save", "before", () => log.push("from-parent"));
    await new Child().runCallbacks("save", () => log.push("child-block"));
    expect(log).toEqual(["from-parent", "child-block"]);
  });

  it("skipCallback removes a CallbackObject registered by reference", async () => {
    const log: string[] = [];
    class Thing extends Model {
      static {
        this.defineModelCallbacks("save");
      }
    }
    const obj = {
      beforeSave() {
        log.push("obj-before");
      },
    };
    Thing.setCallback("save", "before", obj);
    Thing.setCallback("save", "before", () => log.push("fn-kept"));

    Thing.skipCallback("save", "before", obj);
    await new Thing().runCallbacks("save", () => log.push("block"));
    expect(log).toEqual(["fn-kept", "block"]);
  });

  it("skipCallback removes a CallbackObject registered via beforeX/afterX helpers", async () => {
    const log: string[] = [];
    class Thing extends Model {
      static {
        this.defineModelCallbacks("ship");
      }
    }
    const obj = {
      beforeShip() {
        log.push("obj");
      },
    };
    (Thing as unknown as { beforeShip: (o: object) => void }).beforeShip(obj);
    (Thing as unknown as { beforeShip: (fn: () => void) => void }).beforeShip(() => log.push("fn"));

    Thing.skipCallback("ship", "before", obj);
    await new Thing().runCallbacks("ship", () => log.push("block"));
    expect(log).toEqual(["fn", "block"]);
  });

  it("resetCallbacks clears CallbackObject-registered callbacks too", async () => {
    const log: string[] = [];
    class Thing extends Model {
      static {
        this.defineModelCallbacks("save");
      }
    }
    const obj = {
      beforeSave() {
        log.push("obj-before");
      },
    };
    Thing.setCallback("save", "before", obj);
    Thing.setCallback("save", "before", () => log.push("fn"));

    Thing.resetCallbacks("save");
    await new Thing().runCallbacks("save", () => log.push("block-after-reset"));
    expect(log).toEqual(["block-after-reset"]);
  });

  it("skipCallback with if: skips the callback conditionally at run time", async () => {
    const log: string[] = [];
    class Writer extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("age", "integer");
        this.defineModelCallbacks("save");
      }
    }
    interface Writer extends Attributes {}

    const savingMessage = (): void => {
      log.push("saving...");
    };
    Writer.setCallback("save", "before", savingMessage);
    Writer.skipCallback("save", "before", savingMessage, {
      if: (record: Writer) => (record._readAttribute("age") as number) > 18,
    });

    await new Writer({ age: 20 }).runCallbacks("save", () => log.push("saved"));
    expect(log).toEqual(["saved"]);

    await new Writer({ age: 17 }).runCallbacks("save", () => log.push("saved"));
    expect(log).toEqual(["saved", "saving...", "saved"]);
  });

  it("setCallback respects prepend: true (runs before earlier-registered)", async () => {
    const log: string[] = [];
    class Thing extends Model {
      static {
        this.defineModelCallbacks("save");
      }
    }
    Thing.setCallback("save", "before", () => log.push("registered-first"));
    Thing.setCallback("save", "before", () => log.push("prepended"), { prepend: true });
    await new Thing().runCallbacks("save", () => log.push("block"));
    expect(log).toEqual(["prepended", "registered-first", "block"]);
  });
});

describe("unified sync/async runner", () => {
  it("returns a boolean synchronously when all callbacks and block are sync", () => {
    const Klass = modelWith("save");
    const log: string[] = [];
    Klass.beforeSave(() => {
      log.push("before");
    });
    Klass.afterSave(() => {
      log.push("after");
    });
    const result = runCallbacks(new Klass(), "save", () => {
      log.push("block");
      return true;
    });
    expect(result).toBe(true);
    expect(log).toEqual(["before", "block", "after"]);
  });

  it("returns a Promise when a before callback is async", async () => {
    const Klass = modelWith("save");
    const log: string[] = [];
    Klass.beforeSave(async () => {
      await Promise.resolve();
      log.push("before");
    });
    Klass.afterSave(() => {
      log.push("after");
    });
    const result = runCallbacks(new Klass(), "save", () => {
      log.push("block");
      return true;
    });
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toBe(true);
    expect(log).toEqual(["before", "block", "after"]);
  });

  it("returns a Promise when the block is async", async () => {
    const Klass = modelWith("save");
    const log: string[] = [];
    Klass.beforeSave(() => log.push("before"));
    Klass.afterSave(() => log.push("after"));
    const result = runCallbacks(new Klass(), "save", async () => {
      await Promise.resolve();
      log.push("block");
      return true;
    });
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toBe(true);
    expect(log).toEqual(["before", "block", "after"]);
  });

  it("awaits async callbacks in order", async () => {
    const Klass = modelWith("save");
    const log: string[] = [];
    Klass.beforeSave(async () => {
      await Promise.resolve();
      log.push("b1");
    });
    Klass.beforeSave(() => {
      log.push("b2");
    });
    Klass.afterSave(async () => {
      await Promise.resolve();
      log.push("a1");
    });
    await runCallbacks(new Klass(), "save", () => log.push("block"));
    expect(log).toEqual(["b1", "b2", "block", "a1"]);
  });

  it("strict: 'sync' throws when an after callback returns a Promise", () => {
    const Klass = modelWith("initialize");
    Klass.afterInitialize(async () => {});
    expect(() => runCallbacks(new Klass(), "initialize", undefined, { strict: "sync" })).toThrow(
      /Async callback on sync chain "initialize"/,
    );
  });

  it("async validator function registered via Model.validate runs and awaits", async () => {
    const seen: string[] = [];
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validate(async (r: any) => {
          await Promise.resolve();
          seen.push(r.name);
          r.errors.add("name", "is remote-invalid");
        });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "test" });
    const result = p.isValid();
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toBe(false);
    expect(seen).toEqual(["test"]);
    expect(p.errors.messagesFor("name")).toEqual(["is remote-invalid"]);
  });

  it("async validator method registered via Model.validate runs and awaits", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validate("checkRemote");
      }
      async checkRemote() {
        await Promise.resolve();
        this.errors.add("name", "failed remote check");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "test" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.messagesFor("name")).toEqual(["failed remote check"]);
  });

  it("async validator registered via validatesWith runs and awaits", async () => {
    class AsyncValidator {
      async validate(record: any): Promise<void> {
        await Promise.resolve();
        record.errors.add("name", "async validatesWith");
      }
    }
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validatesWith(AsyncValidator);
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "test" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.messagesFor("name")).toEqual(["async validatesWith"]);
  });

  it("an async before_validation callback that halts is awaited", async () => {
    const order: string[] = [];
    class Person extends Model {
      declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
      declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, ValidationsCallbacks);
        include(this, Attributes);
        this.attribute("name", "string");
        this.beforeValidation(async () => {
          await Promise.resolve();
          order.push("before");
          throwAbort();
        });
        this.validate(() => {
          order.push("validate");
        });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "test" });
    const result = p.isValid();
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toBe(false);
    expect(order).toEqual(["before"]);
  });

  it("strict: 'sync' allows fully-sync chains", () => {
    const Klass = modelWith("validation");
    const log: string[] = [];
    Klass.beforeValidation(() => log.push("before"));
    Klass.afterValidation(() => log.push("after"));
    const result = runCallbacks(
      new Klass(),
      "validation",
      () => {
        log.push("block");
        return true;
      },
      { strict: "sync" },
    );
    expect(result).toBe(true);
    expect(log).toEqual(["before", "block", "after"]);
  });
});
describe("Callbacks", () => {
  it("before/after callbacks run in order", async () => {
    const order: string[] = [];
    class Ordered extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.defineModelCallbacks("save");
        this.attribute("name", "string");
        generated(this).beforeSave(() => {
          order.push("before");
        });
        generated(this).afterSave(() => {
          order.push("after");
        });
      }
    }
    interface Ordered extends Attributes {}

    const o = new Ordered();
    await o.runCallbacks("save", () => {
      order.push("action");
    });
    expect(order).toEqual(["before", "action", "after"]);
  });

  it("around callbacks wrap the action", async () => {
    const order: string[] = [];
    class Around extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.defineModelCallbacks("save");
        this.attribute("name", "string");
        generated(this).aroundSave(async (_record, proceed) => {
          order.push("around_before");
          await proceed();
          order.push("around_after");
        });
      }
    }
    interface Around extends Attributes {}

    const a = new Around();
    await a.runCallbacks("save", () => {
      order.push("action");
    });
    expect(order).toEqual(["around_before", "action", "around_after"]);
  });

  it("further callbacks should not be called if before validation throws abort", () => {
    const order: string[] = [];
    class Halting extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.defineModelCallbacks("save");
        this.attribute("name", "string");
        generated(this).beforeSave(() => {
          order.push("before");
          throwAbort();
        });
        generated(this).afterSave(() => {
          order.push("after");
        });
      }
    }
    interface Halting extends Attributes {}

    const h = new Halting();
    const result = h.runCallbacks("save", () => {
      order.push("action");
    });
    expect(result).toBe(false);
    expect(order).toEqual(["before"]);
    expect(order).not.toContain("action");
    expect(order).not.toContain("after");
  });

  it("before_validation halting prevents validations from running", async () => {
    class NoValidate extends Model {
      declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
      declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, ValidationsCallbacks);
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { presence: true });
        this.beforeValidation(() => throwAbort());
      }
    }
    interface NoValidate extends Attributes {}

    const n = new NoValidate();
    expect(await n.isValid()).toBe(false);
    expect(n.errors.count).toBe(0);
  });

  it("complete callback chain", async () => {
    const order: string[] = [];
    class Full extends Model {
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
    await new Full().runCallbacks("save", () => {
      order.push("save");
    });
    expect(order).toEqual(["before_save", "around_before", "save", "around_after", "after_save"]);
  });
});

describe("Callbacks (extended)", () => {
  it("afterValidation runs after validation", async () => {
    const order: string[] = [];
    class Validated extends Model {
      declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
      declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, ValidationsCallbacks);
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { presence: true });
        this.afterValidation(() => {
          order.push("after_validation");
        });
      }
    }
    interface Validated extends Attributes {}

    const v = new Validated({ name: "dean" });
    await v.isValid();
    expect(order).toContain("after_validation");
  });

  it("afterValidation runs even when invalid", async () => {
    const order: string[] = [];
    class Validated extends Model {
      declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
      declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, ValidationsCallbacks);
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { presence: true });
        this.afterValidation(() => {
          order.push("after_validation");
        });
      }
    }
    interface Validated extends Attributes {}

    const v = new Validated();
    await v.isValid();
    expect(order).toContain("after_validation");
  });

  it("callback inheritance — child inherits parent callbacks", async () => {
    const order: string[] = [];
    class Parent extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.defineModelCallbacks("save");
        this.attribute("name", "string");
        generated(this).beforeSave(() => {
          order.push("parent_before");
        });
      }
    }
    interface Parent extends Attributes {}

    class Child extends Parent {
      static {
        generated(this).beforeSave(() => {
          order.push("child_before");
        });
      }
    }
    const c = new Child();
    await c.runCallbacks("save", () => {
      order.push("action");
    });
    expect(order).toContain("parent_before");
    expect(order).toContain("child_before");
    expect(order.indexOf("parent_before")).toBeLessThan(order.indexOf("child_before"));
  });

  it("child callbacks do not affect parent", async () => {
    const parentOrder: string[] = [];
    const childOrder: string[] = [];
    class Parent extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.defineModelCallbacks("save");
        this.attribute("name", "string");
        generated(this).beforeSave(() => {
          parentOrder.push("parent");
          childOrder.push("parent");
        });
      }
    }
    interface Parent extends Attributes {}

    class Child extends Parent {
      static {
        generated(this).beforeSave(() => {
          childOrder.push("child");
        });
      }
    }
    await new Parent().runCallbacks("save", () => {
      parentOrder.push("action");
    });
    expect(parentOrder).not.toContain("child");
  });

  it("custom validate with method name string", async () => {
    class WithMethod extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("value", "integer");
        this.validate("validateCustom");
      }
      validateCustom() {
        if (this._readAttribute("value") === 0) {
          this.errors.add("value", ":invalid", { message: "cannot be zero" });
        }
      }
    }
    interface WithMethod extends Attributes {}

    expect(await new WithMethod({ value: 1 }).isValid()).toBe(true);
    const w = new WithMethod({ value: 0 });
    expect(await w.isValid()).toBe(false);
    expect(w.errors.messagesFor("value")).toContain("cannot be zero");
  });
});

describe("defineModelCallbacks()", () => {
  it("creates before/after/around methods for custom events", async () => {
    class Payment extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("amount", "integer");
        this.defineModelCallbacks("process", "refund");
      }
    }
    interface Payment extends Attributes {}

    const log: string[] = [];
    (Payment as any).beforeProcess((_record: any) => {
      log.push("before_process");
    });
    (Payment as any).afterProcess((_record: any) => {
      log.push("after_process");
    });

    const p = new Payment({ amount: 100 });
    await runCallbacks(p, "process");
    expect(log).toEqual(["before_process", "after_process"]);
  });

  it("creates around callback", () => {
    class Payment extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("amount", "integer");
        this.defineModelCallbacks("charge");
      }
    }
    interface Payment extends Attributes {}

    expect(typeof (Payment as any).aroundCharge).toBe("function");
  });
});

describe("callbacks with prepend option", () => {
  it("prepend: true puts callback first in the chain", async () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.defineModelCallbacks("save");
        this.attribute("name", "string");
      }
    }
    interface User extends Attributes {}

    const order: string[] = [];
    generated(User).beforeSave(() => {
      order.push("first");
    });
    generated(User).beforeSave(
      () => {
        order.push("prepended");
      },
      { prepend: true },
    );

    const u = new User({ name: "Alice" });
    await runCallbacks(u, "save");
    expect(order).toEqual(["prepended", "first"]);
  });
});

describe("withOptions()", () => {
  it("applies common validation options to all validates calls", async () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.attribute("active", "boolean", { default: true });
      }
    }
    interface User extends Attributes {}

    withOptions(User, { on: "create" }, (m) => {
      m.validates("name", { presence: true });
      m.validates("email", { presence: true });
    });

    const user = new User();
    expect(await user.isValid()).toBe(true);
    expect(await user.isValid("create")).toBe(false);
    expect(user.errors.messagesFor("name")).toContain("can't be blank");
    expect(user.errors.messagesFor("email")).toContain("can't be blank");
  });
});

describe("skipCallback with CallbackObject (mixin-level)", () => {
  it("removes a CallbackObject from the chain by reference", async () => {
    const log: string[] = [];
    const Klass = modelWith("save");
    const obj = {
      beforeSave() {
        log.push("obj");
      },
    };
    Klass.beforeSave(obj);
    Klass.beforeSave(() => log.push("fn"));
    Klass.skipCallback("save", "before", obj);
    await runCallbacks(new Klass(), "save");
    expect(log).toEqual(["fn"]);
  });
});
