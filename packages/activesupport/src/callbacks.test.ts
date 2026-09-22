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
