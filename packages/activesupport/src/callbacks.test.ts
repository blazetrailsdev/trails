import { include, kernelThrow, rbObjSingletonClass } from "@blazetrails/ruby-compat";
import type { Extended, Included } from "@blazetrails/ruby-compat/include";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Callbacks } from "./callbacks.js";
import { ArgumentError } from "./hash-utils.js";

type ClassMethods = Extended<typeof Callbacks.ClassMethods>;
type RunCallbacks = Included<typeof Callbacks>["runCallbacks"];

class Record {
  declare static defineCallbacks: ClassMethods["defineCallbacks"];
  declare static setCallback: ClassMethods["setCallback"];
  declare static skipCallback: ClassMethods["skipCallback"];
  declare static resetCallbacks: ClassMethods["resetCallbacks"];
  declare runCallbacks: RunCallbacks;

  static {
    include(this, Callbacks);
  }

  static beforeSave(...filters: any[]): void {
    this.setCallback("save", "before", ...filters);
  }

  static afterSave(...filters: any[]): void {
    this.setCallback("save", "after", ...filters);
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
Record.defineCallbacks("save");

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
    return this.runCallbacks("save", () => {
      if (this.saveFails) throw new Error("inside save");
    });
  }
}

class PersonSkipper extends Person {
  static {
    this.skipCallback("save", "before", ":beforeSaveMethod", { if: ":yes" });
    this.skipCallback("save", "after", ":afterSaveMethod", { unless: ":yes" });
    this.skipCallback("save", "after", ":afterSaveMethod", { if: ":no" });
    this.skipCallback("save", "before", ":beforeSaveMethod", { unless: ":no" });
    this.skipCallback("save", "before", CallbackClass, { if: ":yes" });
  }

  yes(): boolean {
    return true;
  }

  no(): boolean {
    return false;
  }
}

class PersonForProgrammaticSkipping extends Person {}

class OneTimeCompile extends Record {
  static startsTrue = true;
  static startsFalse = false;

  static {
    this.beforeSave((r: Record) => r.history.push(["beforeSave", "startsTrue", "if"]), {
      if: ":startsTrue",
    });
    this.beforeSave((r: Record) => r.history.push(["beforeSave", "startsFalse", "if"]), {
      if: ":startsFalse",
    });
    this.beforeSave((r: Record) => r.history.push(["beforeSave", "startsTrue", "unless"]), {
      unless: ":startsTrue",
    });
    this.beforeSave((r: Record) => r.history.push(["beforeSave", "startsFalse", "unless"]), {
      unless: ":startsFalse",
    });
  }

  startsTrue(): boolean {
    if (OneTimeCompile.startsTrue) {
      OneTimeCompile.startsTrue = false;
      return true;
    }
    return OneTimeCompile.startsTrue;
  }

  startsFalse(): boolean {
    if (!OneTimeCompile.startsFalse) {
      OneTimeCompile.startsFalse = true;
      return false;
    }
    return OneTimeCompile.startsFalse;
  }

  save(): unknown {
    return this.runCallbacks("save");
  }
}

class AfterSaveConditionalPerson extends Record {
  static {
    this.afterSave((r: Record) => {
      r.history.push(["afterSave", "string1"]);
    });
    this.afterSave((r: Record) => {
      r.history.push(["afterSave", "string2"]);
    });
  }

  save(): unknown {
    return this.runCallbacks("save");
  }
}

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
    return this.runCallbacks("save");
  }
}

class CleanPerson extends ConditionalPerson {
  static {
    this.resetCallbacks("save");
  }
}

class MySuper {
  declare static defineCallbacks: ClassMethods["defineCallbacks"];
  declare static setCallback: ClassMethods["setCallback"];
  declare static skipCallback: ClassMethods["skipCallback"];
  declare static resetCallbacks: ClassMethods["resetCallbacks"];
  declare runCallbacks: RunCallbacks;

  static {
    include(this, Callbacks);
  }
}
MySuper.defineCallbacks("save");

class MySlate extends MySuper {
  history: string[] = [];
  saveFails = false;

  save(): unknown {
    return this.runCallbacks("save", () => {
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
    this.setCallback("save", "before", ":nope", { if: ":no" });
    this.setCallback("save", "before", ":nope", { unless: ":yes" });
    this.setCallback("save", "after", ":tweedle");
    this.setCallback("save", "before", (m: MySlate) => m.history.push("yup"));
    this.setCallback("save", "before", ":nope", { if: () => false });
    this.setCallback("save", "before", ":nope", { unless: () => true });
    this.setCallback("save", "before", ":yup", { if: () => true });
    this.setCallback("save", "before", ":yup", { unless: () => false });
    this.setCallback("save", "around", ":tweedleDum");
    this.setCallback("save", "around", ":w0tyes", { if: ":yes" });
    this.setCallback("save", "around", ":w0tno", { if: ":no" });
    this.setCallback("save", "around", ":tweedleDeedle");
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
    this.setCallback("save", "after", ":tweedle1");
    this.setCallback("save", "around", ":tweedleDum");
    this.setCallback("save", "after", ":tweedle2");
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
    return this.runCallbacks("save", () => "running");
  }
}

class HyphenatedCallbacks {
  declare static defineCallbacks: ClassMethods["defineCallbacks"];
  declare static setCallback: ClassMethods["setCallback"];
  declare static skipCallback: ClassMethods["skipCallback"];
  declare static resetCallbacks: ClassMethods["resetCallbacks"];
  declare runCallbacks: RunCallbacks;

  static {
    include(this, Callbacks);
  }

  stuff: string | undefined;

  static {
    this.defineCallbacks("save");
    this.setCallback("save", "before", ":action", { if: ":yes" });
  }

  yes(): boolean {
    return true;
  }

  action(): void {
    this.stuff = "ACTION";
  }

  save(): unknown {
    return this.runCallbacks("save", () => this.stuff);
  }
}

class AbstractCallbackTerminator {
  declare static defineCallbacks: ClassMethods["defineCallbacks"];
  declare static setCallback: ClassMethods["setCallback"];
  declare static skipCallback: ClassMethods["skipCallback"];
  declare static resetCallbacks: ClassMethods["resetCallbacks"];
  declare runCallbacks: RunCallbacks;

  static {
    include(this, Callbacks);
  }

  static setSaveCallbacks(): void {
    this.setCallback("save", "before", ":first");
    this.setCallback("save", "before", ":second");
    this.setCallback("save", "around", ":aroundIt");
    this.setCallback("save", "before", ":third");
    this.setCallback("save", "after", ":first");
    this.setCallback("save", "around", ":aroundIt");
    this.setCallback("save", "after", ":third");
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
    return this.runCallbacks("save", () => {
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
    this.defineCallbacks("save", {
      terminator: (_: object, resultLambda: () => unknown) => resultLambda() === ":halt",
    });
    this.setSaveCallbacks();
  }
}

class CallbackTerminatorSkippingAfterCallbacks extends AbstractCallbackTerminator {
  static {
    this.defineCallbacks("save", {
      terminator: (_: object, resultLambda: () => unknown) => resultLambda() === ":halt",
      skipAfterCallbacksIfTerminated: true,
    });
    this.setSaveCallbacks();
  }
}

class CallbackDefaultTerminator extends AbstractCallbackTerminator {
  static {
    this.defineCallbacks("save");
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
    this.defineCallbacks("save");
  }

  override second(): unknown {
    this.history.push("second");
    return false;
  }

  static {
    this.setSaveCallbacks();
  }
}

class OneTwoThreeSave {
  declare static defineCallbacks: ClassMethods["defineCallbacks"];
  declare static setCallback: ClassMethods["setCallback"];
  declare static skipCallback: ClassMethods["skipCallback"];
  declare static resetCallbacks: ClassMethods["resetCallbacks"];
  declare runCallbacks: RunCallbacks;

  static {
    include(this, Callbacks);
  }

  static {
    this.defineCallbacks("save");
  }

  record: string[] = [];

  save(): unknown {
    return this.runCallbacks("save", () => {
      this.record.push("yielded");
    });
  }

  first(): void {
    this.record.push("one");
  }

  second(): void {
    this.record.push("two");
  }

  third(): void {
    this.record.push("three");
  }
}

class DuplicatingCallbacks extends OneTwoThreeSave {
  static {
    this.setCallback("save", "before", ":first", ":second");
    this.setCallback("save", "before", ":first", ":third");
  }
}

class DuplicatingCallbacksInSameCall extends OneTwoThreeSave {
  static {
    this.setCallback("save", "before", ":first", ":second", ":first", ":third");
  }
}

class WriterSkipper extends Person {
  age = 0;

  static {
    this.skipCallback("save", "before", ":beforeSaveMethod", {
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
    const around = new AroundPerson();
    around.save();
    expect(around.history).toEqual([
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

describe("OneTimeCompileTest", () => {
  it("optimized first compile", () => {
    const around = new OneTimeCompile();
    around.save();
    expect(around.history).toEqual([
      ["beforeSave", "startsTrue", "if"],
      ["beforeSave", "startsTrue", "unless"],
    ]);
  });
});

describe("AfterSaveConditionalPersonCallbackTest", () => {
  it("after save runs in the reverse order", () => {
    const person = new AfterSaveConditionalPerson();
    person.save();
    expect(person.history).toEqual([
      ["afterSave", "string2"],
      ["afterSave", "string1"],
    ]);
  });
});

describe("DoubleYieldTest", () => {
  class DoubleYieldModel extends MySlate {
    static {
      this.setCallback("save", "around", ":wrapOuter");
      this.setCallback("save", "around", ":doubleTrouble");
      this.setCallback("save", "around", ":wrapInner");
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
  let stackTraceLimit: number;
  beforeEach(() => {
    stackTraceLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = Infinity;
  });
  afterEach(() => {
    Error.stackTraceLimit = stackTraceLimit;
  });

  it("tidy call stack", () => {
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
          "invokeSequence",
          "AroundPerson.tweedleDeedle",
          "invokeSequence",
          "AroundPerson.w0tyes",
          "invokeSequence",
          "AroundPerson.tweedleDum",
          "invokeSequence",
          "AroundPerson.runCallbacks",
          "AroundPerson.save",
        ].join("\n"),
      );
    } else {
      // eslint-disable-next-line vitest/no-conditional-expect
      expect(callStack.join("\n")).toBe(
        [
          "<anonymous>",
          "invokeSequence",
          "tweedleDeedle",
          "invokeSequence",
          "w0tyes",
          "invokeSequence",
          "tweedleDum",
          "invokeSequence",
          "runCallbacks",
          "save",
        ].join("\n"),
      );
    }
  });

  it("short call stack", () => {
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
      expect(callStack.join("\n")).toBe(
        ["<anonymous>", "Person.runCallbacks", "Person.save"].join("\n"),
      );
    } else {
      // eslint-disable-next-line vitest/no-conditional-expect
      expect(callStack.join("\n")).toBe(["<anonymous>", "runCallbacks", "save"].join("\n"));
    }
  });
});

describe("ExtendCallbacksTest", () => {
  const ExtendModule = {
    extended(base: ExtendCallbacks) {
      (rbObjSingletonClass(base) as unknown as typeof ExtendCallbacks).setCallback(
        "save",
        "before",
        ":record3",
      );
    },

    record3(this: ExtendCallbacks) {
      this.recorder.push(3);
    },
  };

  const IncludeModule = {
    included(base: typeof ExtendCallbacks) {
      base.setCallback("save", "before", ":record2");
    },

    record2(this: ExtendCallbacks) {
      this.recorder.push(2);
    },
  };

  class ExtendCallbacks {
    declare static defineCallbacks: ClassMethods["defineCallbacks"];
    declare static setCallback: ClassMethods["setCallback"];
    declare static skipCallback: ClassMethods["skipCallback"];
    declare static resetCallbacks: ClassMethods["resetCallbacks"];
    declare runCallbacks: RunCallbacks;

    static {
      include(this, Callbacks);
    }

    static {
      this.defineCallbacks("save");
      this.setCallback("save", "before", ":record1");

      Object.defineProperty(this.prototype, "record2", { value: IncludeModule.record2 });
      IncludeModule.included(this);
    }

    save(): unknown {
      return this.runCallbacks("save");
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
    const obj = new HyphenatedCallbacks();
    obj.save();
    expect(obj.stuff).toBe("ACTION");
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
      declare static defineCallbacks: ClassMethods["defineCallbacks"];
      declare static setCallback: ClassMethods["setCallback"];
      declare static skipCallback: ClassMethods["skipCallback"];
      declare static resetCallbacks: ClassMethods["resetCallbacks"];
      declare runCallbacks: RunCallbacks;

      static {
        include(this, Callbacks);
      }

      static {
        this.defineCallbacks("foo");
        this.setCallback("foo", "before", ":hello");
      }

      run(): unknown {
        return this.runCallbacks("foo");
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

    klass.resetCallbacks("foo");
    new klass().run();
    expect(events.length).toBe(1);
  });

  it("reset impacts subclasses", () => {
    const events: unknown[] = [];
    const klass = buildClass(events);
    class Subclass extends klass {
      static {
        this.setCallback("foo", "before", ":world");
      }

      world(): void {
        events.push("world");
      }
    }

    new Subclass().run();
    expect(events.length).toBe(2);

    klass.resetCallbacks("foo");
    new Subclass().run();
    expect(events.length).toBe(3);
  });
});

describe("ConditionalTests", () => {
  function buildClass(callback: unknown) {
    class Klass {
      declare static defineCallbacks: ClassMethods["defineCallbacks"];
      declare static setCallback: ClassMethods["setCallback"];
      declare static skipCallback: ClassMethods["skipCallback"];
      declare static resetCallbacks: ClassMethods["resetCallbacks"];
      declare runCallbacks: RunCallbacks;

      static {
        include(this, Callbacks);
      }

      static {
        this.defineCallbacks("foo");
        this.setCallback("foo", "before", ":foo", { if: callback as any });
      }

      foo(): void {}

      run(): unknown {
        return this.runCallbacks("foo");
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
      declare static defineCallbacks: ClassMethods["defineCallbacks"];
      declare static setCallback: ClassMethods["setCallback"];
      declare static skipCallback: ClassMethods["skipCallback"];
      declare static resetCallbacks: ClassMethods["resetCallbacks"];
      declare runCallbacks: RunCallbacks;

      static {
        include(this, Callbacks);
      }

      static {
        this.defineCallbacks("foo", { scope: ["name"] });
        this.setCallback("foo", "before", ":foo", { if: callback as any });
      }

      run(): unknown {
        return this.runCallbacks("foo");
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
    for (const saveCallback of (PersonForProgrammaticSkipping as any).__callbacks.save.entries) {
      if ("before" === String(saveCallback.kind)) {
        PersonForProgrammaticSkipping.skipCallback("save", saveCallback.kind, saveCallback.filter);
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
  it("excludes duplicates in separate calls", () => {
    const model = new DuplicatingCallbacks();
    model.save();
    expect(model.record).toEqual(["two", "one", "three", "yielded"]);
  });

  it("excludes duplicates in one call", () => {
    const model = new DuplicatingCallbacksInSameCall();
    model.save();
    expect(model.record).toEqual(["two", "one", "three", "yielded"]);
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

  class UsingObjectBefore {
    declare static defineCallbacks: ClassMethods["defineCallbacks"];
    declare static setCallback: ClassMethods["setCallback"];
    declare runCallbacks: RunCallbacks;

    static {
      include(this, Callbacks);

      this.defineCallbacks("save");
      this.setCallback("save", "before", new CallbackObject());
    }

    record: string[] = [];

    save(): unknown {
      return this.runCallbacks("save", () => {
        this.record.push("yielded");
      });
    }
  }

  class UsingObjectAround {
    declare static defineCallbacks: ClassMethods["defineCallbacks"];
    declare static setCallback: ClassMethods["setCallback"];
    declare runCallbacks: RunCallbacks;

    static {
      include(this, Callbacks);

      this.defineCallbacks("save");
      this.setCallback("save", "around", new CallbackObject());
    }

    record: string[] = [];

    save(): unknown {
      return this.runCallbacks("save", () => {
        this.record.push("yielded");
      });
    }
  }

  class CustomScopeObject {
    declare static defineCallbacks: ClassMethods["defineCallbacks"];
    declare static setCallback: ClassMethods["setCallback"];
    declare runCallbacks: RunCallbacks;

    static {
      include(this, Callbacks);

      this.defineCallbacks("save", { scope: ["kind", "name"] });
      this.setCallback("save", "before", new CallbackObject());
    }

    record: string[] = [];

    save(): unknown {
      return this.runCallbacks("save", () => {
        this.record.push("yielded");
        return "CallbackResult";
      });
    }
  }

  it("before object", () => {
    const u = new UsingObjectBefore();
    u.save();
    expect(u.record).toEqual(["before", "yielded"]);
  });
  it("around object", () => {
    const u = new UsingObjectAround();
    u.save();
    expect(u.record).toEqual(["around before", "yielded", "around after"]);
  });
  it("customized object", () => {
    const u = new CustomScopeObject();
    u.save();
    expect(u.record).toEqual(["before save", "yielded"]);
  });
  it("block result is returned", () => {
    const u = new CustomScopeObject();
    expect(u.save()).toBe("CallbackResult");
  });
});

describe("NotPermittedStringCallbackTest", () => {
  it("passing string callback is not permitted", () => {
    class Klass extends Record {}

    expect(() => Klass.beforeSave("tweedle")).toThrow(ArgumentError);
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
      declare static defineCallbacks: ClassMethods["defineCallbacks"];
      declare static setCallback: ClassMethods["setCallback"];
      declare static skipCallback: ClassMethods["skipCallback"];
      declare static resetCallbacks: ClassMethods["resetCallbacks"];
      declare runCallbacks: RunCallbacks;

      static {
        include(this, Callbacks);
      }

      static {
        this.defineCallbacks("foo");
        this.setCallback("foo", "before", callback as any);
      }

      run(): unknown {
        return this.runCallbacks("foo");
      }
    }
    return Klass;
  }

  it("proc arity 0", () => {
    const calls: unknown[] = [];
    const klass = buildClass(() => calls.push(":foo"));
    new klass().run();
    expect(calls).toEqual([":foo"]);
  });

  it("proc arity 1", () => {
    const calls: unknown[] = [];
    const klass = buildClass((o: unknown) => calls.push(o));
    const instance = new klass();
    instance.run();
    expect(calls).toEqual([instance]);
  });

  it("proc arity 2", () => {
    expect(() => {
      const klass = buildClass((x: unknown, y: unknown) => {});
      new klass().run();
    }).toThrow(ArgumentError);
  });

  it("proc negative called with empty list", () => {
    const calls: unknown[] = [];
    const klass = buildClass((...args: unknown[]) => calls.push(args));
    new klass().run();
    expect(calls).toEqual([[]]);
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
      declare static defineCallbacks: ClassMethods["defineCallbacks"];
      declare static setCallback: ClassMethods["setCallback"];
      declare static skipCallback: ClassMethods["skipCallback"];
      declare static resetCallbacks: ClassMethods["resetCallbacks"];
      declare runCallbacks: RunCallbacks;

      static {
        include(this, Callbacks);
      }

      static {
        this.defineCallbacks("foo");
        for (let i = 0; i < n; i++) this.setCallback("foo", "before", callback as any);
      }

      run(): unknown {
        return this.runCallbacks("foo");
      }

      static skip(...things: any[]): void {
        this.skipCallback("foo", "before", ...things);
      }
    }
    return Klass;
  }

  it("add class", () => {
    const calls: unknown[] = [];
    const callback = class {
      static before(o: unknown) {
        calls.push(o);
      }
    };
    new (buildClass(callback))().run();
    expect(calls.length).toBe(10);
  });

  it("add lambda", () => {
    const calls: unknown[] = [];
    new (buildClass((o: unknown) => calls.push(o)))().run();
    expect(calls.length).toBe(10);
  });

  it("add symbol", () => {
    const calls: unknown[] = [];
    const klass = buildClass(":bar");
    Object.defineProperty(klass.prototype, "bar", { value: () => calls.push(klass) });
    new klass().run();
    expect(calls.length).toBe(1);
  });

  it("skip class", () => {
    const calls: unknown[] = [];
    const callback = class {
      static before(o: unknown) {
        calls.push(o);
      }
    };
    const klass = buildClass(callback);
    for (let i = 9; i >= 0; i--) {
      klass.skip(callback);
      new klass().run();
      expect(calls.length).toBe(i);
      calls.length = 0;
    }
  });

  it("skip symbol", () => {
    const calls: unknown[] = [];
    const klass = buildClass(":bar");
    Object.defineProperty(klass.prototype, "bar", { value: () => calls.push(klass) });
    klass.skip(":bar");
    new klass().run();
    expect(calls.length).toBe(0);
  });

  it("skip string", () => {
    const calls: unknown[] = [];
    const klass = buildClass(":bar");
    Object.defineProperty(klass.prototype, "bar", { value: () => calls.push(klass) });
    expect(() => klass.skip("bar")).toThrow(ArgumentError);
    new klass().run();
    expect(calls.length).toBe(1);
  });

  it("skip undefined callback", () => {
    const calls: unknown[] = [];
    const klass = buildClass(":bar");
    Object.defineProperty(klass.prototype, "bar", { value: () => calls.push(klass) });
    expect(() => klass.skip(":qux")).toThrow(ArgumentError);
    new klass().run();
    expect(calls.length).toBe(1);
  });

  it("skip without raise", () => {
    const calls: unknown[] = [];
    const klass = buildClass(":bar");
    Object.defineProperty(klass.prototype, "bar", { value: () => calls.push(klass) });
    klass.skip(":qux", { raise: false });
    new klass().run();
    expect(calls.length).toBe(1);
  });
});

describe("NotSupportedStringConditionalTest", () => {
  it("string conditional options", () => {
    class Klass extends Record {}

    expect(() => Klass.beforeSave(":tweedle", { if: ["true"] })).toThrow(ArgumentError);
    expect(() => Klass.beforeSave(":tweedle", { if: "true" })).toThrow(ArgumentError);
    expect(() => Klass.afterSave(":tweedle", { unless: "false" })).toThrow(ArgumentError);
    expect(() => Klass.skipCallback("save", "before", ":tweedle", { if: "true" })).toThrow(
      ArgumentError,
    );
    expect(() => Klass.skipCallback("save", "after", ":tweedle", { unless: "false" })).toThrow(
      ArgumentError,
    );
  });
});

class AllSaveCallbacks {
  declare static defineCallbacks: ClassMethods["defineCallbacks"];
  declare static setCallback: ClassMethods["setCallback"];
  declare static skipCallback: ClassMethods["skipCallback"];
  declare static resetCallbacks: ClassMethods["resetCallbacks"];
  declare runCallbacks: RunCallbacks;

  static {
    include(this, Callbacks);
  }

  history: string[] = [];

  static {
    this.defineCallbacks("save");
    this.setCallback("save", "before", ":beforeSave1");
    this.setCallback("save", "before", ":beforeSave2");
    this.setCallback("save", "around", ":aroundSave1");
    this.setCallback("save", "around", ":aroundSave2");
    this.setCallback("save", "after", ":afterSave1");
    this.setCallback("save", "after", ":afterSave2");
  }

  beforeSave1(): void {
    this.history.push("beforeSave1");
  }

  beforeSave2(): void {
    this.history.push("beforeSave2");
  }

  aroundSave1(block: () => unknown): void {
    this.history.push("aroundSave1_before");
    block();
    this.history.push("aroundSave1_after");
  }

  aroundSave2(block: () => unknown): void {
    this.history.push("aroundSave2_before");
    block();
    this.history.push("aroundSave2_after");
  }

  afterSave1(): void {
    this.history.push("afterSave1");
  }

  afterSave2(): void {
    this.history.push("afterSave2");
  }
}

describe("RunSpecificCallbackTest", () => {
  it("run callbacks only before", () => {
    const klass = new AllSaveCallbacks();
    klass.runCallbacks("save", undefined, undefined, "before");
    expect(klass.history).toEqual(["beforeSave1", "beforeSave2"]);
  });

  it("run callbacks only around", () => {
    const klass = new AllSaveCallbacks();
    klass.runCallbacks("save", undefined, undefined, "around");
    expect(klass.history).toEqual([
      "aroundSave1_before",
      "aroundSave2_before",
      "aroundSave2_after",
      "aroundSave1_after",
    ]);
  });

  it("run callbacks only after", () => {
    const klass = new AllSaveCallbacks();
    klass.runCallbacks("save", undefined, undefined, "after");
    expect(klass.history).toEqual(["afterSave2", "afterSave1"]);
  });
});
