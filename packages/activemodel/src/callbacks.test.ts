import { describe, it, expect } from "vitest";
import {
  assertEmpty,
  assertRespondTo,
  assertNotRespondTo,
  extend,
} from "@blazetrails/activesupport";
import { kernelThrow } from "@blazetrails/ruby-compat";
import { Callbacks } from "./callbacks.js";

type GeneratedMacro = (...args: unknown[]) => void;

interface GeneratedModelCallbacks {
  beforeCreate: GeneratedMacro;
  aroundCreate: GeneratedMacro;
  afterCreate: GeneratedMacro;
}

function generated(klass: unknown): GeneratedModelCallbacks {
  return klass as GeneratedModelCallbacks;
}

describe("CallbacksTest", () => {
  class CallbackValidator {
    aroundCreate(model: ModelCallbacks, proceed: () => void | Promise<void>): unknown {
      model.callbacks.push("before_around_create");
      const result = proceed();
      model.callbacks.push("after_around_create");
      void result;
      return false;
    }
  }

  class ModelCallbacks {
    callbacks: string[];
    _valid: boolean | undefined;
    _beforeCreateReturns: boolean;
    _beforeCreateThrows: string | undefined;

    declare runCallbacks: (event: string, block: () => unknown) => Promise<unknown>;

    static {
      extend(this, Callbacks);

      (this as unknown as { defineModelCallbacks: GeneratedMacro }).defineModelCallbacks("create");
      (this as unknown as { defineModelCallbacks: GeneratedMacro }).defineModelCallbacks(
        "initialize",
        { only: "after" },
      );
      (this as unknown as { defineModelCallbacks: GeneratedMacro }).defineModelCallbacks(
        "multiple",
        { only: ["before", "around"] },
      );
      (this as unknown as { defineModelCallbacks: GeneratedMacro }).defineModelCallbacks("empty", {
        only: [],
      });

      generated(this).beforeCreate(":beforeCreate");
      generated(this).aroundCreate(new CallbackValidator());

      generated(this).afterCreate((model: ModelCallbacks) => {
        model.callbacks.push("after_create");
        return false;
      });

      generated(this).afterCreate((model: ModelCallbacks) => {
        model.callbacks.push("final_callback");
      });
    }

    constructor(
      options: {
        valid?: boolean;
        beforeCreateReturns?: boolean;
        beforeCreateThrows?: string;
      } = {},
    ) {
      this.callbacks = [];
      this._valid = options.valid;
      this._beforeCreateReturns = options.beforeCreateReturns ?? true;
      this._beforeCreateThrows = options.beforeCreateThrows;
    }

    beforeCreate(): boolean {
      this.callbacks.push("before_create");
      if (this._beforeCreateThrows != null) kernelThrow(this._beforeCreateThrows);
      return this._beforeCreateReturns;
    }

    create(): Promise<unknown> {
      return this.runCallbacks("create", () => {
        this.callbacks.push("create");
        return this._valid;
      });
    }
  }

  it("complete callback chain", async () => {
    const model = new ModelCallbacks();
    await model.create();
    expect(model.callbacks).toEqual([
      "before_create",
      "before_around_create",
      "create",
      "after_around_create",
      "after_create",
      "final_callback",
    ]);
  });

  it("the callback chain is not halted when around or after callbacks return false", async () => {
    const model = new ModelCallbacks();
    await model.create();
    expect(model.callbacks[model.callbacks.length - 1]).toEqual("final_callback");
  });

  it("the callback chain is not halted when a before callback returns false)", async () => {
    const model = new ModelCallbacks({ beforeCreateReturns: false });
    await model.create();
    expect(model.callbacks[model.callbacks.length - 1]).toEqual("final_callback");
  });

  it("the callback chain is halted when a callback throws :abort", async () => {
    const model = new ModelCallbacks({ beforeCreateThrows: ":abort" });
    await model.create();
    expect(model.callbacks).toEqual(["before_create"]);
  });

  it("after callbacks are not executed if the block returns false", async () => {
    const model = new ModelCallbacks({ valid: false });
    await model.create();
    expect(model.callbacks).toEqual([
      "before_create",
      "before_around_create",
      "create",
      "after_around_create",
    ]);
  });

  it("only selects which types of callbacks should be created", () => {
    assertNotRespondTo(ModelCallbacks, "beforeInitialize");
    assertNotRespondTo(ModelCallbacks, "aroundInitialize");
    assertRespondTo(ModelCallbacks, "afterInitialize");
  });

  it("only selects which types of callbacks should be created from an array list", () => {
    assertRespondTo(ModelCallbacks, "beforeMultiple");
    assertRespondTo(ModelCallbacks, "aroundMultiple");
    assertNotRespondTo(ModelCallbacks, "afterMultiple");
  });

  it("no callbacks should be created", () => {
    assertNotRespondTo(ModelCallbacks, "beforeEmpty");
    assertNotRespondTo(ModelCallbacks, "aroundEmpty");
    assertNotRespondTo(ModelCallbacks, "afterEmpty");
  });

  it("the :if option array should not be mutated by an after callback", () => {
    const opts: unknown[] = [];

    class _Anonymous extends ModelCallbacks {
      static {
        generated(this).afterCreate(() => {}, { if: opts });
      }
    }
    void _Anonymous;

    assertEmpty(opts);
  });

  class Violin {
    history: string[];
    declare runCallbacks: (event: string, block: () => unknown) => Promise<unknown>;
    constructor() {
      this.history = [];
    }
    static {
      extend(this, Callbacks);
      (this as unknown as { defineModelCallbacks: GeneratedMacro }).defineModelCallbacks("create");
    }
    callback1(): void {
      this.history.push("callback1");
    }
    callback2(): void {
      this.history.push("callback2");
    }
    async create(): Promise<this> {
      await this.runCallbacks("create", () => {});
      return this;
    }
  }
  class Violin1 extends Violin {
    static {
      generated(this).afterCreate(":callback1", ":callback2");
    }
  }
  class Violin2 extends Violin {
    static {
      generated(this).afterCreate(":callback1");
      generated(this).afterCreate(":callback2");
    }
  }

  it("after_create callbacks with both callbacks declared in one line", async () => {
    expect((await new Violin1().create()).history).toEqual(["callback1", "callback2"]);
  });

  it("after_create callbacks with both callbacks declared in different lines", async () => {
    expect((await new Violin2().create()).history).toEqual(["callback1", "callback2"]);
  });
});
