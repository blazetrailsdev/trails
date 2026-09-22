import { kernelThrow } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import {
  defineCallbacks,
  setCallback,
  skipCallback,
  resetCallbacks,
  runCallbacks,
  peekCallbackChain,
} from "./callbacks.js";
import { ArgumentError } from "./hash-utils.js";

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
    return runCallbacks(this, "save");
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
    return runCallbacks(this, "save");
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

class HyphenatedCallbacks {
  stuff: string | undefined;

  static {
    defineCallbacks(this.prototype, "save");
    setCallback(this.prototype, "save", "before", ":action", { if: ":yes" });
  }

  yes(): boolean {
    return true;
  }

  action(): void {
    this.stuff = "ACTION";
  }

  save(): unknown {
    return runCallbacks(this, "save", () => this.stuff);
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

class CallbackObject {
  before(caller: { record: string[] }): void {
    caller.record.push("before");
  }

  beforeSave(caller: { record: string[] }): void {
    caller.record.push("before save");
  }

  around(caller: { record: string[] }, block: () => unknown): void {
    caller.record.push("around before");
    block();
    caller.record.push("around after");
  }
}

class UsingObjectBefore {
  static {
    defineCallbacks(this.prototype, "save");
    setCallback(this.prototype, "save", "before", new CallbackObject());
  }

  record: string[] = [];

  save(): unknown {
    return runCallbacks(this, "save", () => {
      this.record.push("yielded");
    });
  }
}

class UsingObjectAround {
  static {
    defineCallbacks(this.prototype, "save");
    setCallback(this.prototype, "save", "around", new CallbackObject());
  }

  record: string[] = [];

  save(): unknown {
    return runCallbacks(this, "save", () => {
      this.record.push("yielded");
    });
  }
}

class CustomScopeObject {
  static {
    defineCallbacks(this.prototype, "save", { scope: ["kind", "name"] });
    setCallback(this.prototype, "save", "before", new CallbackObject());
  }

  record: string[] = [];

  save(): unknown {
    return runCallbacks(this, "save", () => {
      this.record.push("yielded");
      return "CallbackResult";
    });
  }
}

class OneTwoThreeSave {
  static {
    defineCallbacks(this.prototype, "save");
  }

  record: string[] = [];

  save(): unknown {
    return runCallbacks(this, "save", () => {
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
    setCallback(this.prototype, "save", "before", ":first", ":second");
    setCallback(this.prototype, "save", "before", ":first", ":third");
  }
}

class DuplicatingCallbacksInSameCall extends OneTwoThreeSave {
  static {
    setCallback(this.prototype, "save", "before", ":first", ":second", ":first", ":third");
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
    const callback = class {
      static foo(o: unknown) {
        z.push(o);
      }
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
    const klass = buildClass(
      class {
        static before(o: unknown) {
          z.push(o);
        }
      },
    );
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
      static {
        defineCallbacks(this.prototype, "foo");
        for (let i = 0; i < n; i++) setCallback(this.prototype, "foo", "before", callback as any);
      }

      run(): unknown {
        return runCallbacks(this, "foo");
      }

      static skip(...things: any[]): void {
        skipCallback(this.prototype, "foo", "before", ...things);
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
    expect(() =>
      skipCallback(Klass.prototype, "save", "before", ":tweedle", { if: "true" }),
    ).toThrow(ArgumentError);
    expect(() =>
      skipCallback(Klass.prototype, "save", "after", ":tweedle", { unless: "false" }),
    ).toThrow(ArgumentError);
  });
});

class AllSaveCallbacks {
  history: string[] = [];

  static {
    defineCallbacks(this.prototype, "save");
    setCallback(this.prototype, "save", "before", ":beforeSave1");
    setCallback(this.prototype, "save", "before", ":beforeSave2");
    setCallback(this.prototype, "save", "around", ":aroundSave1");
    setCallback(this.prototype, "save", "around", ":aroundSave2");
    setCallback(this.prototype, "save", "after", ":afterSave1");
    setCallback(this.prototype, "save", "after", ":afterSave2");
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
    runCallbacks(klass, "save", undefined, undefined, "before");
    expect(klass.history).toEqual(["beforeSave1", "beforeSave2"]);
  });

  it("run callbacks only around", () => {
    const klass = new AllSaveCallbacks();
    runCallbacks(klass, "save", undefined, undefined, "around");
    expect(klass.history).toEqual([
      "aroundSave1_before",
      "aroundSave2_before",
      "aroundSave2_after",
      "aroundSave1_after",
    ]);
  });

  it("run callbacks only after", () => {
    const klass = new AllSaveCallbacks();
    runCallbacks(klass, "save", undefined, undefined, "after");
    expect(klass.history).toEqual(["afterSave2", "afterSave1"]);
  });
});
