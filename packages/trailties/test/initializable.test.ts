import { describe, expect, test } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat/argument-error";
import { include, type Included } from "@blazetrails/ruby-compat/include";
import {
  ClassMethods,
  Initializable,
  type Collection,
  type InitializableClass,
} from "../lib/initializable.js";

type InitializableInstance = Included<typeof Initializable> & { readonly initializers: Collection };

let arr: number[] = [];
let withArg: unknown = null;
const push = (n: number) => () => void arr.push(n);

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface Foo extends InitializableInstance {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class Foo {
  declare static initializer: InitializableClass["initializer"];
  declare static readonly initializers: Collection;
  static {
    include(this, Initializable);
  }
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface Parent extends InitializableInstance {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class Parent {
  declare static initializer: InitializableClass["initializer"];
  declare static readonly initializers: Collection;
  static {
    include(this, Initializable);
  }
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
Parent.initializer("five", { before: "one" }, push(5));

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface Instance extends InitializableInstance {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class Instance {
  declare static initializer: InitializableClass["initializer"];
  declare static readonly initializers: Collection;
  static {
    include(this, Initializable);
  }
  static {
    Instance.initializer("one", { group: "assets" }, push(1));
    Instance.initializer("two", {}, push(2));
    Instance.initializer("three", { group: "all" }, push(3));
    Instance.initializer("four", {}, push(4));
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface WithArgs extends InitializableInstance {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class WithArgs {
  declare static initializer: InitializableClass["initializer"];
  declare static readonly initializers: Collection;
  static {
    include(this, Initializable);
  }
  static {
    WithArgs.initializer("foo", {}, (arg: unknown) => void (withArg = arg));
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface MoreInitializers extends InitializableInstance {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class MoreInitializers {
  declare static initializer: InitializableClass["initializer"];
  declare static readonly initializers: Collection;
  static {
    include(this, Initializable);
  }
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface OverriddenInitializer extends InitializableInstance {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class OverriddenInitializer {
  declare static initializer: InitializableClass["initializer"];
  static {
    include(this, Initializable);
  }
  static {
    OverriddenInitializer.initializer("first", {}, push(1));
    OverriddenInitializer.initializer("last", {}, push(4));
  }
  declare static readonly initializers: Collection;
  static {
    Object.defineProperty(this, "initializers", {
      get(this: typeof OverriddenInitializer): Collection {
        const initializers: Collection = Reflect.get(ClassMethods, "initializers", this);
        return initializers.plus(new MoreInitializers().initializers);
      },
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface PluginA extends InitializableInstance {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class PluginA {
  declare static initializer: InitializableClass["initializer"];
  declare static readonly initializers: Collection;
  static {
    include(this, Initializable);
  }
  static {
    PluginA.initializer("plugin_a.startup", {}, push(1));
    PluginA.initializer("plugin_a.terminate", {}, push(4));
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface PluginB extends InitializableInstance {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class PluginB {
  declare static initializer: InitializableClass["initializer"];
  declare static readonly initializers: Collection;
  static {
    include(this, Initializable);
  }
  static {
    PluginB.initializer("plugin_b.startup", { after: "plugin_a.startup" }, push(2));
    PluginB.initializer("plugin_b.terminate", { before: "plugin_a.terminate" }, push(3));
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface InterdependentApplication extends InitializableInstance {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class InterdependentApplication {
  declare static initializer: InitializableClass["initializer"];
  static {
    include(this, Initializable);
  }
  static get initializers(): Collection {
    return PluginB.initializers.plus(PluginA.initializers);
  }
}

describe("Basic", () => {
  test("initializers run", async () => {
    const foo = new Foo();
    await foo.runInitializers();
    expect(foo.foo).toBe(1);
  });
  test("initializers are inherited", async () => {
    const bar = new Bar();
    await bar.runInitializers();
    expect([bar.foo, bar.bar]).toEqual([1, 1]);
  });
  test("initializers only get run once", async () => {
    const foo = new Foo();
    await foo.runInitializers();
    await foo.runInitializers();
    expect(foo.foo).toBe(1);
  });
  test("opts is optional (Rails initializer(name, opts = {}, &blk))", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
    interface NoOpts extends InitializableInstance {}
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class NoOpts {
      declare static initializer: InitializableClass["initializer"];
      declare static readonly initializers: Collection;
      static {
        include(this, Initializable);
      }
      static {
        NoOpts.initializer("only", () => void arr.push(7));
      }
    }
    arr = [];
    await new NoOpts().runInitializers();
    expect(arr).toEqual([7]);
  });

  test("creating initializer without a block raises an error", () => {
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
      interface Bad extends InitializableInstance {}
      // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
      class Bad {
        declare static initializer: InitializableClass["initializer"];
        declare static readonly initializers: Collection;
        static {
          include(this, Initializable);
        }
      }
      // @ts-expect-error testing runtime guard
      Bad.initializer("foo", {});
    }).toThrow(ArgumentError);
  });
  test("Initializer provides context's class name", () => {
    const foo = new Foo();
    expect(foo.initializers[0].contextClass).toBe(foo.constructor);
  });
});

describe("BeforeAfter", () => {
  test("running on parent", async () => {
    arr = [];
    await new Parent().runInitializers();
    expect(arr).toEqual([5, 1, 2]);
  });
  test("running on child", async () => {
    arr = [];
    await new Child().runInitializers();
    expect(arr).toEqual([5, 3, 1, 4, 2]);
  });
  test("handles dependencies introduced before all initializers are loaded", async () => {
    arr = [];
    await new InterdependentApplication().runInitializers();
    expect(arr).toEqual([1, 2, 3, 4]);
  });
});

describe("InstanceTest", () => {
  test("running locals", async () => {
    arr = [];
    await new Instance().runInitializers();
    expect(arr).toEqual([2, 3, 4]);
  });
  test("running locals with groups", async () => {
    arr = [];
    await new Instance().runInitializers("assets");
    expect(arr).toEqual([1, 3]);
  });
});

describe("WithArgsTest", () => {
  test("running initializers with args", async () => {
    withArg = null;
    await new WithArgs().runInitializers("default", "foo");
    expect(withArg).toBe("foo");
  });
});

describe("OverriddenInitializerTest", () => {
  test("merges in the initializers from the parent in the right order", async () => {
    arr = [];
    await new OverriddenInitializer().runInitializers();
    expect(arr).toEqual([1, 2, 3, 4]);
  });
});
