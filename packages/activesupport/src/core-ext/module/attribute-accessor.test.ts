import { describe, it, expect } from "vitest";

import {
  cattrAccessor,
  cattrReader,
  cattrWriter,
  mattrAccessor,
  mattrReader,
  mattrWriter,
} from "../../module-ext.js";

describe("ModuleAttributeAccessorTest", () => {
  it("should use mattr default", () => {
    class MyModule {}
    mattrAccessor.call(MyModule, "color", { default: "red" });
    expect((MyModule as any).color).toBe("red");
  });

  it("mattr default keyword arguments", () => {
    class MyModule {}
    cattrAccessor.call(MyModule, "defAccessor", { default: "default_accessor_value" });
    cattrReader.call(MyModule, "defReader", { default: "default_reader_value" });
    cattrWriter.call(MyModule, "defWriter", { default: "default_writer_value" });
    expect((MyModule as any).defAccessor).toBe("default_accessor_value");
    expect((MyModule as any).defReader).toBe("default_reader_value");
    expect((MyModule as any).__mattr_defWriter__).toBe("default_writer_value");
  });

  it("mattr can default to false", () => {
    class MyModule {}
    mattrAccessor.call(MyModule, "enabled", { default: false });
    expect((MyModule as any).enabled).toBe(false);
  });

  it("mattr default priority", () => {
    class MyModule {}
    mattrAccessor.call(MyModule, "x", { default: "default" });
    (MyModule as any).x = "override";
    expect((MyModule as any).x).toBe("override");
  });

  it("should set mattr value", () => {
    class MyModule {}
    mattrAccessor.call(MyModule, "val");
    (MyModule as any).val = "set";
    expect((MyModule as any).val).toBe("set");
  });

  it("cattr accessor default value", () => {
    class MyModule {}
    mattrAccessor.call(MyModule, "n", { default: 99 });
    expect((MyModule as any).n).toBe(99);
  });

  it("should not create instance writer", () => {
    class MyModule {}
    mattrAccessor.call(MyModule, "x", { default: "val", instanceWriter: false });
    const inst = new (MyModule as any)();
    expect(inst.x).toBe("val");
    expect(() => {
      inst.x = "new";
    }).toThrow();
  });

  it("should not create instance reader", () => {
    class MyModule {}
    mattrReader.call(MyModule, "shaq", { instanceReader: false });
    expect((MyModule as any).shaq).toBeUndefined();
    const inst = new (MyModule as any)();
    expect(inst.shaq).toBeUndefined();
  });

  it("should not create instance accessors", () => {
    class MyModule {}
    mattrWriter.call(MyModule, "camp", { instanceAccessor: false });
    (MyModule as any).camp = "set";
    expect((MyModule as any).camp).toBeUndefined();
    expect((MyModule as any).__mattr_camp__).toBe("set");

    mattrAccessor.call(MyModule, "hidden", { instanceReader: false, instanceWriter: false });
    const inst = new (MyModule as any)();
    expect(inst.hidden).toBeUndefined();
  });

  it("should raise name error if attribute name is invalid", () => {
    class MyModule {}
    expect(() => mattrAccessor.call(MyModule, "1invalid")).toThrow();
  });

  it("should use default value if block passed", () => {
    class MyModule {}
    let calls = 0;
    mattrAccessor.call(MyModule, "x", {
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
    mattrAccessor.call(MyModule, "x", {
      default: () => {
        calls++;
        return "computed";
      },
    });
    (MyModule as any).x;
    const callsAfterFirst = calls;
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
    mattrAccessor.call(MyModule, "a", "b", "c", { default: makeDefault });
    expect(callCount).toBe(3);
  });
});
