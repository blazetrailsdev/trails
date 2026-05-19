import { describe, expect, test } from "vitest";
import { Initializable } from "./initializable.js";

let arr: number[] = [];
let withArg: unknown = null;
const push = (n: number) => () => void arr.push(n);

class Foo extends Initializable {
  foo?: number;
  bar?: number;
  static {
    Foo.initializer("start", {}, function (this: Foo) {
      this.foo = (this.foo ?? 0) + 1;
    });
  }
}
class Bar extends Foo {
  static {
    Bar.initializer("bar", {}, function (this: Bar) {
      this.bar = (this.bar ?? 0) + 1;
    });
  }
}

class Parent extends Initializable {
  static {
    Parent.initializer("one", {}, push(1));
    Parent.initializer("two", {}, push(2));
  }
}
class Child extends Parent {
  static {
    Child.initializer("three", { before: "one" }, push(3));
    Child.initializer("four", { after: "one", before: "two" }, push(4));
  }
}
// Re-open Parent (the Rails fixture does this) to add :five.
Parent.initializer("five", { before: "one" }, push(5));

class Instance extends Initializable {
  static {
    Instance.initializer("one", { group: "assets" }, push(1));
    Instance.initializer("two", {}, push(2));
    Instance.initializer("three", { group: "all" }, push(3));
    Instance.initializer("four", {}, push(4));
  }
}

class WithArgs extends Initializable {
  static {
    WithArgs.initializer("foo", {}, (arg: unknown) => void (withArg = arg));
  }
}

class MoreInitializers extends Initializable {
  static {
    MoreInitializers.initializer("startup", { before: "last" }, push(3));
    MoreInitializers.initializer(
      "terminate",
      { after: "first", before: "startup" },
      function (this: MoreInitializers) {
        arr.push(this.two());
      },
    );
  }
  two(): number {
    return 2;
  }
}
class OverriddenInitializer extends Initializable {
  static {
    OverriddenInitializer.initializer("first", {}, push(1));
    OverriddenInitializer.initializer("last", {}, push(4));
  }
  static override get initializers() {
    return super.initializers.plus(new MoreInitializers().initializers);
  }
}

class PluginA extends Initializable {
  static {
    PluginA.initializer("plugin_a.startup", {}, push(1));
    PluginA.initializer("plugin_a.terminate", {}, push(4));
  }
}
class PluginB extends Initializable {
  static {
    PluginB.initializer("plugin_b.startup", { after: "plugin_a.startup" }, push(2));
    PluginB.initializer("plugin_b.terminate", { before: "plugin_a.terminate" }, push(3));
  }
}
class InterdependentApplication extends Initializable {
  static override get initializers() {
    return PluginB.initializers.plus(PluginA.initializers);
  }
}

describe("Basic", () => {
  test("initializers run", () => {
    const foo = new Foo();
    foo.runInitializers();
    expect(foo.foo).toBe(1);
  });
  test("initializers are inherited", () => {
    const bar = new Bar();
    bar.runInitializers();
    expect([bar.foo, bar.bar]).toEqual([1, 1]);
  });
  test("initializers only get run once", () => {
    const foo = new Foo();
    foo.runInitializers();
    foo.runInitializers();
    expect(foo.foo).toBe(1);
  });
  test("opts is optional (Rails initializer(name, opts = {}, &blk))", () => {
    class NoOpts extends Initializable {
      static {
        NoOpts.initializer("only", () => void arr.push(7));
      }
    }
    arr = [];
    new NoOpts().runInitializers();
    expect(arr).toEqual([7]);
  });

  test("creating initializer without a block raises an error", () => {
    expect(() => {
      class Bad extends Initializable {}
      // @ts-expect-error testing runtime guard
      Bad.initializer("foo", {});
    }).toThrow(TypeError);
  });
  test("Initializer provides context's class name", () => {
    const foo = new Foo();
    expect(foo.initializers[0].contextClass).toBe(foo.constructor);
  });
});

describe("BeforeAfter", () => {
  test("running on parent", () => {
    arr = [];
    new Parent().runInitializers();
    expect(arr).toEqual([5, 1, 2]);
  });
  test("running on child", () => {
    arr = [];
    new Child().runInitializers();
    expect(arr).toEqual([5, 3, 1, 4, 2]);
  });
  test("handles dependencies introduced before all initializers are loaded", () => {
    arr = [];
    new InterdependentApplication().runInitializers();
    expect(arr).toEqual([1, 2, 3, 4]);
  });
});

describe("InstanceTest", () => {
  test("running locals", () => {
    arr = [];
    new Instance().runInitializers();
    expect(arr).toEqual([2, 3, 4]);
  });
  test("running locals with groups", () => {
    arr = [];
    new Instance().runInitializers("assets");
    expect(arr).toEqual([1, 3]);
  });
});

describe("WithArgsTest", () => {
  test("running initializers with args", () => {
    withArg = null;
    new WithArgs().runInitializers("default", "foo");
    expect(withArg).toBe("foo");
  });
});

describe("OverriddenInitializerTest", () => {
  test("merges in the initializers from the parent in the right order", () => {
    arr = [];
    new OverriddenInitializer().runInitializers();
    expect(arr).toEqual([1, 2, 3, 4]);
  });
});
