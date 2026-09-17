import { describe, it, expect, beforeEach } from "vitest";
import { onLoad, runLoadHooks, resetLoadHooks } from "./lazy-load-hooks.js";
import { assertRaises } from "./testing/assertions.js";

beforeEach(() => {
  resetLoadHooks();
});

class FakeContext {
  readonly incr: number;
  constructor(incr: number) {
    this.incr = incr;
  }
}

describe("LazyLoadHooksTest", () => {
  const incrAmt = () => 5;

  it("basic hook", () => {
    let i = 0;
    onLoad("basic_hook", () => {
      i += 1;
    });
    runLoadHooks("basic_hook", Object);
    expect(i).toEqual(1);
  });

  it("basic hook with two registrations", () => {
    let i = 0;
    onLoad("basic_hook_with_two", function (this: FakeContext) {
      i += this.incr;
    });
    expect(i).toEqual(0);
    runLoadHooks("basic_hook_with_two", new FakeContext(2));
    expect(i).toEqual(2);
    runLoadHooks("basic_hook_with_two", new FakeContext(5));
    expect(i).toEqual(7);
  });

  it("basic hook with two registrations only once", () => {
    let i = 0;
    const block = function (this: FakeContext) {
      i += this.incr;
    };
    onLoad("basic_hook_with_two_once", { runOnce: true }, block);
    onLoad("basic_hook_with_two_once", function (this: FakeContext) {
      i += this.incr;
    });

    onLoad("different_hook", { runOnce: true }, block);
    runLoadHooks("different_hook", new FakeContext(2));
    expect(i).toEqual(2);
    runLoadHooks("basic_hook_with_two_once", new FakeContext(2));
    expect(i).toEqual(6);
    runLoadHooks("basic_hook_with_two_once", new FakeContext(5));
    expect(i).toEqual(11);
  });

  it("hook registered after run", () => {
    let i = 0;
    runLoadHooks("registered_after", Object);
    expect(i).toEqual(0);
    onLoad("registered_after", () => {
      i += 1;
    });
    expect(i).toEqual(1);
  });

  it("hook registered after run with two registrations", () => {
    let i = 0;
    runLoadHooks("registered_after_with_two", new FakeContext(2));
    runLoadHooks("registered_after_with_two", new FakeContext(5));
    expect(i).toEqual(0);
    onLoad("registered_after_with_two", function (this: FakeContext) {
      i += this.incr;
    });
    expect(i).toEqual(7);
  });

  it("hook registered after run with two registrations only once", () => {
    let i = 0;
    runLoadHooks("registered_after_with_two_once", new FakeContext(2));
    runLoadHooks("registered_after_with_two_once", new FakeContext(5));
    expect(i).toEqual(0);
    onLoad("registered_after_with_two_once", { runOnce: true }, function (this: FakeContext) {
      i += this.incr;
    });
    expect(i).toEqual(2);
  });

  it("hook registered interleaved run with two registrations", () => {
    let i = 0;
    runLoadHooks("registered_interleaved_with_two", new FakeContext(2));
    expect(i).toEqual(0);
    onLoad("registered_interleaved_with_two", function (this: FakeContext) {
      i += this.incr;
    });
    expect(i).toEqual(2);
    runLoadHooks("registered_interleaved_with_two", new FakeContext(5));
    expect(i).toEqual(7);
  });

  it("hook registered interleaved run with two registrations once", () => {
    let i = 0;
    runLoadHooks("registered_interleaved_with_two_once", new FakeContext(2));
    expect(i).toEqual(0);

    onLoad("registered_interleaved_with_two_once", { runOnce: true }, function (this: FakeContext) {
      i += this.incr;
    });
    expect(i).toEqual(2);

    runLoadHooks("registered_interleaved_with_two_once", new FakeContext(5));
    expect(i).toEqual(2);
  });

  it("hook receives a context", () => {
    let i = 0;
    onLoad("contextual", function (this: FakeContext) {
      i += this.incr;
    });
    expect(i).toEqual(0);
    runLoadHooks("contextual", new FakeContext(2));
    expect(i).toEqual(2);
  });

  it("hook receives a context afterward", () => {
    let i = 0;
    runLoadHooks("contextual_after", new FakeContext(2));
    expect(i).toEqual(0);
    onLoad("contextual_after", function (this: FakeContext) {
      i += this.incr;
    });
    expect(i).toEqual(2);
  });

  it("hook with yield true", () => {
    let i = 0;
    onLoad("contextual_yield", { yield: true }, (obj: FakeContext) => {
      i += obj.incr + incrAmt();
    });
    expect(i).toEqual(0);
    runLoadHooks("contextual_yield", new FakeContext(2));
    expect(i).toEqual(7);
  });

  it("hook with yield true afterward", () => {
    let i = 0;
    runLoadHooks("contextual_yield_after", new FakeContext(2));
    expect(i).toEqual(0);
    onLoad("contextual_yield_after", { yield: true }, (obj: FakeContext) => {
      i += obj.incr + incrAmt();
    });
    expect(i).toEqual(7);
  });

  it("hook uses class eval when base is a class", () => {
    try {
      onLoad("uses_class_eval", function (this: typeof FakeContext) {
        (this.prototype as any).firstWrestler = function () {
          return "John Cena";
        };
      });

      runLoadHooks("uses_class_eval", FakeContext);
      expect((new FakeContext(0) as any).firstWrestler()).toEqual("John Cena");
    } finally {
      delete (FakeContext.prototype as any).firstWrestler;
    }
  });

  it("hook uses class eval when base is a module", () => {
    const mod = class {};
    onLoad("uses_class_eval2", function (this: typeof mod) {
      (this.prototype as any).lastWrestler = function () {
        return "Dwayne Johnson";
      };
    });
    runLoadHooks("uses_class_eval2", mod);

    const klass = class extends mod {};

    expect((new klass() as any).lastWrestler()).toEqual("Dwayne Johnson");
  });

  it("hook uses instance eval when base is an instance", async () => {
    onLoad("uses_instance_eval", function (this: FakeContext) {
      (this as any).secondWrestler = function () {
        return "Hulk Hogan";
      };
    });

    const context = new FakeContext(1);
    runLoadHooks("uses_instance_eval", context);

    await assertRaises([TypeError], {}, () => {
      (new FakeContext(2) as any).secondWrestler();
    });
    await assertRaises([TypeError], {}, () => {
      (FakeContext as any).secondWrestler();
    });
    expect((context as any).secondWrestler()).toEqual("Hulk Hogan");
  });
});
