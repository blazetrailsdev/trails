import { describe, it, expect } from "vitest";

import { mattrAccessor } from "../../module-ext.js";

describe("ModuleAttributeAccessorTest", () => {
  it("should use mattr default", () => {
    class MyModule {}
    mattrAccessor(MyModule, "color", { default: "red" });
    expect((MyModule as any).color).toBe("red");
  });

  it("mattr default keyword arguments", () => {
    class MyModule {}
    mattrAccessor(MyModule, "size", { default: 42 });
    expect((MyModule as any).size).toBe(42);
  });

  it("mattr can default to false", () => {
    class MyModule {}
    mattrAccessor(MyModule, "enabled", { default: false });
    expect((MyModule as any).enabled).toBe(false);
  });

  it("mattr default priority", () => {
    class MyModule {}
    mattrAccessor(MyModule, "x", { default: "default" });
    (MyModule as any).x = "override";
    expect((MyModule as any).x).toBe("override");
  });

  it("should set mattr value", () => {
    class MyModule {}
    mattrAccessor(MyModule, "val");
    (MyModule as any).val = "set";
    expect((MyModule as any).val).toBe("set");
  });

  it("cattr accessor default value", () => {
    class MyModule {}
    mattrAccessor(MyModule, "n", { default: 99 });
    expect((MyModule as any).n).toBe(99);
  });

  it("should not create instance writer", () => {
    class MyModule {}
    mattrAccessor(MyModule, "x", { default: "val", instanceWriter: false });
    const inst = new (MyModule as any)();
    expect(inst.x).toBe("val");
    expect(() => {
      inst.x = "new";
    }).toThrow();
  });

  it("should not create instance reader", () => {
    class MyModule {}
    mattrAccessor(MyModule, "secret", { instanceReader: false });
    const inst = new (MyModule as any)();
    expect(inst.secret).toBeUndefined();
  });

  it("should not create instance accessors", () => {
    class MyModule {}
    mattrAccessor(MyModule, "hidden", { instanceReader: false, instanceWriter: false });
    const inst = new (MyModule as any)();
    expect(inst.hidden).toBeUndefined();
  });

  it("should raise name error if attribute name is invalid", () => {
    class MyModule {}
    expect(() => mattrAccessor(MyModule, "1invalid")).toThrow();
  });

  it("should use default value if block passed", () => {
    class MyModule {}
    let calls = 0;
    mattrAccessor(MyModule, "x", {
      default: () => {
        calls++;
        return "computed";
      },
    });
    expect((MyModule as any).x).toBe("computed");
    expect(calls).toBe(1);
  });

  it("method invocation should not invoke the default block", () => {
    class MyModule {}
    let calls = 0;
    mattrAccessor(MyModule, "x", {
      default: () => {
        calls++;
        return "computed";
      },
    });
    // First access calls the block
    (MyModule as any).x;
    const callsAfterFirst = calls;
    // Second access should not call it again
    (MyModule as any).x;
    expect(calls).toBe(callsAfterFirst);
  });

  it("declaring multiple attributes at once invokes the block multiple times", () => {
    class MyModule {}
    let callCount = 0;
    const makeDefault = () => {
      callCount++;
      return "val";
    };
    mattrAccessor(MyModule, "a", "b", "c", { default: makeDefault });
    expect(callCount).toBe(3);
  });

  it.skip("declaring attributes on singleton errors", () => {});
});
